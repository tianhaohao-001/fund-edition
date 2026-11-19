import { DatabaseSync } from 'node:sqlite';
import { createActivityStore } from './team-activity.mjs';
import { createAccounts } from './accounts.mjs';
import { openWatchJournal } from './watch-journal.mjs';
import { openStudioMarks } from './studio-review.mjs';
import { billingRecords } from './stripe-billing.mjs';
import { paypalRecords } from './paypal-billing.mjs';
import { invoiceRecords } from './invoice-membership.mjs';
import {testCheckoutRecords} from './checkout-test.mjs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export class SessionConflict extends Error {}

export function openStore(filename,{PortfolioError,placePortfolioOrder,validatePortfolioOrder,viewPortfolio,crossEntryRetry,validateCashClaim,claimPaperCash}={}) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 3000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS demo_sessions (
      session_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS decision_receipts (
      session_id TEXT NOT NULL REFERENCES demo_sessions(session_id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      signature TEXT NOT NULL,
      run TEXT NOT NULL,
      PRIMARY KEY (session_id, request_id)
    );
    CREATE TABLE IF NOT EXISTS guest_onboarding_uses (
      owner TEXT NOT NULL, network TEXT NOT NULL, kind TEXT NOT NULL, used INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS guest_onboarding_owner ON guest_onboarding_uses(owner,kind);
    CREATE INDEX IF NOT EXISTS guest_onboarding_time ON guest_onboarding_uses(kind,used);
    CREATE TABLE IF NOT EXISTS hosted_model_usage (used INTEGER NOT NULL, tasks INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS hosted_model_usage_time ON hosted_model_usage(used);
  `);
  // Founding workspaces with a previously created custom fund get the full trial at rollout.
  // Every workspace has a seed fund at index zero; market replicas do not start a Studio trial.
  db.prepare(`UPDATE demo_sessions
    SET data = json_set(data, '$.studioMembership', json_set(
      coalesce(json_extract(data, '$.studioMembership'), '{}'), '$.startedAt', ?)), revision = revision + 1
    WHERE json_extract(data, '$.studioMembership.startedAt') IS NULL AND EXISTS (
      SELECT 1 FROM json_each(data, '$.funds') AS f
      WHERE CAST(f.key AS INTEGER) > 0 AND json_extract(f.value, '$.replica') IS NULL
    )`).run(new Date().toISOString());
  const create = db.prepare('INSERT INTO demo_sessions (session_id, data) VALUES (?, ?)');
  const read = db.prepare('SELECT data, revision FROM demo_sessions WHERE session_id = ?');
  const update = db.prepare('UPDATE demo_sessions SET data = ?, revision = revision + 1 WHERE session_id = ? AND revision = ?');
  const receipt = db.prepare('SELECT signature, run FROM decision_receipts WHERE session_id = ? AND request_id = ?');
  const register = db.prepare('INSERT INTO decision_receipts (session_id, request_id, signature, run) VALUES (?, ?, ?, ?)');
  const listOrders=db.prepare(`SELECT run FROM decision_receipts
    WHERE session_id=? AND json_extract(run,'$.kind') IN ('portfolio-order','portfolio-claim')
      AND (? IS NULL OR rowid < (SELECT rowid FROM decision_receipts WHERE session_id=? AND request_id=? AND json_extract(run,'$.kind') IN ('portfolio-order','portfolio-claim')))
    ORDER BY rowid DESC LIMIT 101`);
  function portfolioPage(owner,data,before=null) {
    const rows=listOrders.all(owner,before,owner,before).map(r=>JSON.parse(r.run).receipt);
    const orders=rows.slice(0,100);
    return {...viewPortfolio(data,orders),olderOrdersCursor:rows.length>100?orders.at(-1).requestId:null};
  }
  const count = db.prepare('SELECT COUNT(*) AS total FROM demo_sessions');
  const guestCount = db.prepare('SELECT COUNT(*) AS n FROM guest_onboarding_uses WHERE owner=? AND kind=?');
  const trimModelUsage=db.prepare('DELETE FROM hosted_model_usage WHERE used<=?');
  const countModelUsage=db.prepare('SELECT COALESCE(SUM(tasks),0) AS total, COALESCE(SUM(CASE WHEN used>? THEN tasks END),0) AS hourly FROM hosted_model_usage');
  const recordModelUsage=db.prepare('INSERT INTO hosted_model_usage(used,tasks) VALUES(?,?)');
  const guestReserve = db.prepare(`INSERT INTO guest_onboarding_uses(owner,network,kind,used) SELECT ?,?,?,?
    WHERE (SELECT COUNT(*) FROM guest_onboarding_uses WHERE owner=? AND kind=?)<?
      AND (SELECT COUNT(*) FROM guest_onboarding_uses WHERE kind=? AND used>? AND network=?)<?
      AND (SELECT COUNT(*) FROM guest_onboarding_uses WHERE kind=? AND used>?)<?`);
  const purgeGuestUses = db.prepare(`DELETE FROM guest_onboarding_uses WHERE used<? AND
    NOT EXISTS(SELECT 1 FROM demo_sessions WHERE session_id=guest_onboarding_uses.owner)`);
  const watch = openWatchJournal(db);
  const studioMarks = openStudioMarks(db);
  const nextRun = db.prepare(`
    SELECT session_id AS sessionId,
           json_extract(fund.value, '$.id') AS fundId,
           json_extract(fund.value, '$.schedule.nextRunAt') AS nextRunAt
    FROM demo_sessions, json_each(data, '$.funds') AS fund
    WHERE json_extract(fund.value, '$.schedule.enabled') = 1
      AND json_extract(fund.value, '$.schedule.nextRunAt') IS NOT NULL
    ORDER BY nextRunAt
    LIMIT 1
  `);

  return {
    billing: billingRecords(db),
    paypal: paypalRecords(db),
    invoices: invoiceRecords(db),
    testCheckout:testCheckoutRecords(db),
    studioMarks,
    watch,
    activity: createActivityStore(db),
    accounts: createAccounts(db,(from, to) => {
      watch.transfer(from, to);
      studioMarks.transfer(from, to);
    }),
    readPortfolio(owner,before){
      db.exec('BEGIN');
      try{
        const row=read.get(owner);
        if(!row)throw new PortfolioError('portfolio-session','The workspace session changed. Reload the portfolio.',401);
        const result=portfolioPage(owner,JSON.parse(row.data),before);
        db.exec('COMMIT');return result;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    orderPortfolio(owner,body,options){
      const isClaim = options?.claim === true;
      const kind = isClaim ? 'portfolio-claim' : 'portfolio-order';
      const signature = isClaim ? validateCashClaim(body) : validatePortfolioOrder(body,options);
      db.exec('BEGIN IMMEDIATE');
      try{
        const row=read.get(owner);
        if(!row)throw new PortfolioError('portfolio-session','The workspace session changed. Reload the portfolio.',401);
        const data=JSON.parse(row.data),prior=receipt.get(owner,body.requestId);
        if (isClaim && data.funds[0]?.id !== body.workspaceRef)
          throw new PortfolioError('portfolio-workspace','Your workspace changed. Reload your portfolio.');
        let entry;
        if(prior){
          const record=JSON.parse(prior.run);
          if(record.kind!==kind||(prior.signature!==signature&&(isClaim||!crossEntryRetry(body,record.receipt,options))))
            throw new PortfolioError('portfolio-request-conflict','This order ID is already used for a different instruction.');
          entry=record.receipt;
        }else{
          entry=isClaim ? claimPaperCash(data,body) : placePortfolioOrder(data,body,options);
          if(update.run(JSON.stringify(data),owner,row.revision).changes!==1)throw new SessionConflict('The portfolio changed.');
          register.run(owner,body.requestId,signature,JSON.stringify({kind,receipt:entry}));
        }
        const result={...portfolioPage(owner,data),receipt:entry};
        db.exec('COMMIT');return result;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    reserveHostedModelUse(tasks,hourlyLimit,rollingLimit,reserveVisitor) {
      const now=Date.now();
      db.exec('BEGIN IMMEDIATE');
      try {
        trimModelUsage.run(now-30*86_400_000);
        const {total,hourly}=countModelUsage.get(now-3_600_000);
        const fits=total+tasks<=rollingLimit && hourly+tasks<=hourlyLimit;
        if(fits){
          reserveVisitor?.();
          recordModelUsage.run(now,tasks);
        }
        db.exec('COMMIT');
        return fits;
      } catch(error) { db.exec('ROLLBACK'); throw error; }
    },
    reserveGuestUse(owner, network, kind, siteLimit) {
      const now=Date.now(),cutoff=now-86_400_000;
      const memberLimit=kind==='chat'?8:16,networkLimit=kind==='chat'?24:48;
      purgeGuestUses.run(cutoff);
      const added=guestReserve.run(owner,network,kind,now,owner,kind,memberLimit,kind,cutoff,network,networkLimit,kind,cutoff,siteLimit);
      if(added.changes===1)return 'ok';
      return guestCount.get(owner,kind).n>=memberLimit?'sign-in':'capacity';
    },
    create(sessionId, data) {
      create.run(sessionId, JSON.stringify(data));
      return { data, revision: 0 };
    },
    read(sessionId) {
      const row = read.get(sessionId);
      return row ? { data: JSON.parse(row.data), revision: row.revision } : null;
    },
    readReceipt(sessionId, requestId) {
      const row = receipt.get(sessionId, requestId);
      return row ? { signature: row.signature, run: JSON.parse(row.run) } : null;
    },
    save(sessionId, revision, data, entry, openingOrder) {
      db.exec('BEGIN IMMEDIATE');
      try {
        if (update.run(JSON.stringify(data), sessionId, revision).changes !== 1) {
          throw new SessionConflict('The account changed before this action could be saved.');
        }
        for (const record of [entry, openingOrder]) {
          if (record) register.run(sessionId, record.requestId, record.signature, JSON.stringify(record.run));
        }
        if(data.funds?.length>1)watch.sync(sessionId,data,Date.now());
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    count: () => count.get().total,
    nextRun: () => nextRun.get() ?? null,
    close: () => db.close(),
  };
}

