import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export class MobileSessionError extends Error {
  constructor(message, status = 401, code = 'mobile-session-required') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const digest = value => createHash('sha256').update(value).digest();

export function createMobileSessions({ enabled, code, now = Date.now }) {
  const ready = enabled && typeof code === 'string' && /^[A-Za-z0-9_-]{16,100}$/u.test(code);
  const expected = ready ? digest(code) : null;
  const pairingExpires = now() + 5 * 60_000;
  const tokens = new Map();
  let attempts = 0;
  let consumed = false;

  function pair(candidate) {
    if (!ready) throw new MobileSessionError('Mobile pairing is disabled on this instance.', 403, 'mobile-pairing-disabled');
    if (consumed || now() > pairingExpires) throw new MobileSessionError('This pairing code expired or was already used. Generate a new code on the computer.', 403, 'mobile-pairing-expired');
    if (attempts >= 8) throw new MobileSessionError('The pairing attempt limit has been reached. Generate a new code on the computer.', 429, 'mobile-pairing-limit');
    attempts += 1;
    if (typeof candidate !== 'string' || !timingSafeEqual(digest(candidate), expected)) throw new MobileSessionError('The pairing code is not valid.', 403, 'mobile-pairing-invalid');
    consumed = true;
    const token = randomBytes(32).toString('base64url');
    const sessionId = randomUUID();
    const expiresAt = new Date(now() + 12 * 60 * 60_000).toISOString();
    tokens.set(digest(token).toString('hex'), { sessionId, expiresAt });
    return { token, sessionId, expiresAt };
  }

  function authorize(header) {
    const match = typeof header === 'string' && header.match(/^Bearer ([A-Za-z0-9_-]{43})$/u);
    const key = match ? digest(match[1]).toString('hex') : '';
    const session = tokens.get(key);
    if (!ready || !session || Date.parse(session.expiresAt) <= now()) {
      if (session) tokens.delete(key);
      throw new MobileSessionError('Pair this device again to continue.');
    }
    return session;
  }

  function revoke(header) {
    authorize(header);
    tokens.delete(digest(header.slice(7)).toString('hex'));
  }

  return { pair, authorize, revoke };
}
