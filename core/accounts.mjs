import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const HASH_OPTIONS = { N: 65536, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const SESSION_TTL = 30 * 24 * 60 * 60_000;
const ATTEMPT_WINDOW = 15 * 60_000;
const dummySalt = randomBytes(16);
const dummyHash = randomBytes(32);
const digest = value => createHash('sha256').update(value).digest('hex');

export class AccountError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function credentials(input) {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@<>"(),;:\\[\]]+@(?:[\p{L}\p{N}-]+\.)+[\p{L}\p{N}-]+$/u.test(email)) {
    throw new AccountError(400, 'invalid-email', 'Enter a valid email address.');
  }
  const password = input.password;
  if (typeof password !== 'string' || [...password].length < 12 || [...password].length > 128) {
    throw new AccountError(400, 'invalid-password', 'Use a password of 12 to 128 characters.');
  }
  return { email, password };
}

export function createAccounts(db, transferWorkspaceRecords) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt BLOB NOT NULL, password_hash BLOB NOT NULL,
      workspace_id TEXT NOT NULL UNIQUE REFERENCES demo_sessions(session_id), created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspace_logins (
      digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES workspace_users(id), expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS workspace_logins_expiry ON workspace_logins(expires);
    CREATE TABLE IF NOT EXISTS workspace_auth_attempts (
      bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires INTEGER NOT NULL
    );
  `);
  const find = db.prepare('SELECT * FROM workspace_users WHERE email = ?');
  const lookup = db.prepare(`SELECT u.id, u.email, u.workspace_id FROM workspace_logins t
    JOIN workspace_users u ON u.id=t.user_id WHERE t.digest=? AND t.expires>?`);
  const privateSpace = db.prepare('SELECT 1 FROM workspace_users WHERE workspace_id = ?');
  const addUser = db.prepare('INSERT INTO workspace_users VALUES (?, ?, ?, ?, ?, ?)');
  const addLogin = db.prepare('INSERT INTO workspace_logins VALUES (?, ?, ?)');
  const removeLogin = db.prepare('DELETE FROM workspace_logins WHERE digest=?');
  const purgeLogins = db.prepare('DELETE FROM workspace_logins WHERE expires<=?');
  const purgeAttempts = db.prepare('DELETE FROM workspace_auth_attempts WHERE expires<=?');
  const countAttempt = db.prepare(`INSERT INTO workspace_auth_attempts VALUES (?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts`);
  const clearAccountAttempts = db.prepare('DELETE FROM workspace_auth_attempts WHERE bucket=?');
  const readGuest = db.prepare('SELECT data,revision FROM demo_sessions WHERE session_id=?');
  const createSpace = db.prepare('INSERT INTO demo_sessions(session_id,data,revision) VALUES(?,?,?)');
  const transferReceipts = db.prepare('UPDATE decision_receipts SET session_id=? WHERE session_id=?');
  const transferActivity = db.prepare("UPDATE workspace_activity SET workspace=? WHERE workspace=? AND status!='running'");
  const retireGuest = db.prepare('DELETE FROM demo_sessions WHERE session_id=?');
  let hashing = 0;

  function authenticate(token) {
    if (!token) return null;
    const result = lookup.get(digest(token), Date.now());
    return result ? { user: { id: result.id, email: result.email }, workspaceId: result.workspace_id } : null;
  }

  function createLogin(user, time) {
    const token = randomUUID();
    addLogin.run(digest(token), user.id, time + SESSION_TTL);
    return { token, user: { id: user.id, email: user.email } };
  }

  async function enter(mode, input, { ip, guestId, initialState }) {
    const { email, password } = credentials(input);
    const time = Date.now();
    const accountBucket = digest('email:' + email);
    purgeAttempts.run(time);
    purgeLogins.run(time);
    const ipCount = countAttempt.get(digest('ip:' + ip), time + ATTEMPT_WINDOW).attempts;
    if (ipCount > 65 || hashing >= 3 ||
        countAttempt.get(accountBucket, time + ATTEMPT_WINDOW).attempts > 10) {
      throw new AccountError(429, 'auth-limit', 'Too many attempts. Try again later.');
    }
    const found = find.get(email);
    const salt = mode === 'register' ? randomBytes(16) : (found?.salt ?? dummySalt);
    let derived;
    hashing++;
    try { derived = await deriveKey(password, salt, 32, HASH_OPTIONS); }
    finally { hashing--; }

    if (mode === 'login') {
      const valid = timingSafeEqual(derived, found?.password_hash ?? dummyHash);
      if (!found || !valid) throw new AccountError(401, 'auth-failed', 'The email or password could not be verified.');
      clearAccountAttempts.run(accountBucket);
      return createLogin(found, Date.now());
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      if (find.get(email)) throw new AccountError(409, 'registration-unavailable', 'Could not create an account with these details. Try signing in.');
      const prior = guestId ? readGuest.get(guestId) : null;
      if (guestId && (!prior || privateSpace.get(guestId))) {
        throw new AccountError(409, 'auth-changed', 'The workspace changed. Reload it before registering.');
      }
      const workspaceId = randomUUID();
      createSpace.run(workspaceId, prior?.data ?? JSON.stringify(initialState()), prior?.revision ?? 0);
      if (prior) {
        transferReceipts.run(workspaceId, guestId);
        transferActivity.run(workspaceId, guestId);
        transferWorkspaceRecords(guestId, workspaceId);
        retireGuest.run(guestId);
      }
      const user = { id: randomUUID(), email };
      addUser.run(user.id, email, salt, derived, workspaceId, time);
      const login = createLogin(user, time);
      clearAccountAttempts.run(accountBucket);
      db.exec('COMMIT');
      return login;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    authenticate, enter, isPrivateWorkspace: id => Boolean(privateSpace.get(id)),
    revoke: token => { if (token) removeLogin.run(digest(token)); },
  };
}

