import {nextWatchSlot,watchGraceMs} from './watch-clock.mjs';

export function openWatchJournal(db){
  db.exec(`CREATE TABLE IF NOT EXISTS studio_watch_jobs(
    owner TEXT NOT NULL REFERENCES demo_sessions(session_id) ON DELETE CASCADE,
    fund TEXT NOT NULL,enabled INTEGER NOT NULL,due INTEGER,kind TEXT,interval INTEGER NOT NULL DEFAULT 60,PRIMARY KEY(owner,fund));
    CREATE INDEX IF NOT EXISTS studio_watch_due ON studio_watch_jobs(enabled,due);
    CREATE TABLE IF NOT EXISTS studio_watch_runs(
    owner TEXT NOT NULL,fund TEXT NOT NULL,slot INTEGER NOT NULL,started INTEGER NOT NULL,
    kind TEXT NOT NULL,status TEXT NOT NULL,record TEXT,PRIMARY KEY(owner,fund,slot),
    FOREIGN KEY(owner,fund) REFERENCES studio_watch_jobs(owner,fund) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS studio_watch_budget(owner TEXT NOT NULL,fund TEXT NOT NULL,day TEXT NOT NULL,used INTEGER NOT NULL,PRIMARY KEY(owner,fund,day));
    CREATE INDEX IF NOT EXISTS studio_watch_budget_time ON studio_watch_budget(used);
    CREATE TABLE IF NOT EXISTS studio_watch_cache(k TEXT PRIMARY KEY,expires INTEGER NOT NULL,value TEXT NOT NULL);`);
  if(!db.prepare('PRAGMA table_info(studio_watch_jobs)').all().some(c=>c.name==='interval'))db.exec('ALTER TABLE studio_watch_jobs ADD COLUMN interval INTEGER NOT NULL DEFAULT 60');
  const seed=db.prepare('INSERT OR IGNORE INTO studio_watch_jobs(owner,fund,enabled,due,kind) VALUES(?,?,1,?,?)');
  const ahead=db.prepare('SELECT * FROM studio_watch_jobs WHERE enabled=1 AND due IS NOT NULL ORDER BY due,owner,fund LIMIT 1');
  const take=db.prepare("INSERT OR IGNORE INTO studio_watch_runs(owner,fund,slot,started,kind,status) VALUES(?,?,?,?,?,'running')");
  const next=db.prepare('UPDATE studio_watch_jobs SET due=?,kind=? WHERE owner=? AND fund=? AND due=? AND enabled=1');
  const finish=db.prepare("UPDATE studio_watch_runs SET status=?,record=? WHERE owner=? AND fund=? AND slot=? AND status='running'");
  const audit=db.prepare("SELECT slot,started,kind,status,record FROM studio_watch_runs WHERE owner=? AND fund=? AND slot<? ORDER BY slot DESC LIMIT 31");
  const job=db.prepare('SELECT enabled,due,kind,interval FROM studio_watch_jobs WHERE owner=? AND fund=?');
  const keep=db.prepare('DELETE FROM studio_watch_runs WHERE owner=? AND fund=? AND slot NOT IN (SELECT slot FROM studio_watch_runs WHERE owner=? AND fund=? ORDER BY slot DESC LIMIT 210)');
  const reserve=db.prepare(`INSERT OR IGNORE INTO studio_watch_budget SELECT ?,?,?,? WHERE
    (SELECT count(*) FROM studio_watch_budget WHERE day=?)<3 AND
    (SELECT count(*) FROM studio_watch_budget WHERE owner=? AND day=?)<1 AND
    (SELECT count(*) FROM studio_watch_budget WHERE used>?)<60`);
  const peek=db.prepare('SELECT expires,value FROM studio_watch_cache WHERE k=?');
  const put=db.prepare('INSERT INTO studio_watch_cache(k,expires,value) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET expires=excluded.expires,value=excluded.value');
  const old=db.prepare("SELECT d.session_id AS owner,json_extract(f.value,'$.id') AS fund FROM demo_sessions d,json_each(d.data,'$.funds') f WHERE CAST(f.key AS INTEGER)>0 AND json_extract(f.value,'$.replica') IS NULL AND NOT EXISTS (SELECT 1 FROM studio_watch_jobs j WHERE j.owner=d.session_id AND j.fund=json_extract(f.value,'$.id'))");
  return {
    seedOld(now){
      const rows=old.all();
      rows.forEach((row,index)=>seed.run(row.owner,row.fund,now+4_000+index*200,'migration-file'));
    },
    sync(owner,data,now){for(const fund of data.funds.slice(1))if(!fund.replica)seed.run(owner,fund.id,now,'opening-file');},
    transfer(from,to){
      db.prepare('INSERT INTO studio_watch_jobs(owner,fund,enabled,due,kind,interval) SELECT ?,fund,enabled,due,kind,interval FROM studio_watch_jobs WHERE owner=?').run(to,from);
      db.prepare("INSERT INTO studio_watch_runs SELECT ?,fund,slot,started,kind,CASE WHEN status='running' THEN 'interrupted' ELSE status END,record FROM studio_watch_runs WHERE owner=?").run(to,from);
      db.prepare('UPDATE studio_watch_budget SET owner=? WHERE owner=?').run(to,from);
    },
    next(){return ahead.get();},
    wakeAt(){
      const due=ahead.get()?.due,oldest=db.prepare("SELECT min(started) AS t FROM studio_watch_runs WHERE status='running'").get().t;
      return Math.min(due??Infinity,oldest==null?Infinity:oldest+3*60_000+1);
    },
    claim(now){
      db.exec('BEGIN IMMEDIATE');
      try{
        const j=ahead.get();if(!j||j.due>now){db.exec('COMMIT');return null;}
        // After an outage, archive the old slot as missed, then offer any
        // scheduled observation still eligible at the actual restart time.
        const expired=now-j.due>watchGraceMs&&!['opening-file','migration-file'].includes(j.kind);
        const slot=nextWatchSlot(expired?now-watchGraceMs-1:now,{interval:j.interval});
        next.run(slot?.at??null,slot?.kind??null,j.owner,j.fund,j.due);
        const taken=take.run(j.owner,j.fund,j.due,now,j.kind).changes===1;
        db.exec('COMMIT');return taken?j:null;
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    complete(j,status,record){finish.run(status,JSON.stringify(record),j.owner,j.fund,j.due);keep.run(j.owner,j.fund,j.owner,j.fund);},
    recover(now){db.prepare("UPDATE studio_watch_runs SET status='interrupted' WHERE status='running' AND started<?").run(now-3*60_000);},
    read(owner,fund,before=Number.MAX_SAFE_INTEGER){
      const j=job.get(owner,fund);if(!j)return null;const rows=audit.all(owner,fund,before);
      return {...j,older:rows.length>30?rows[29].slot:null,history:rows.slice(0,30).map(r=>({...r,record:r.record?JSON.parse(r.record):null}))};
    },
    setPolicy(owner,fund,update,now){
      const j=job.get(owner,fund);if(!j)return;
      const interval=update.intervalMinutes??j.interval,enabled=update.enabled??Boolean(j.enabled);
      if(enabled===Boolean(j.enabled)&&interval===j.interval)return;
      const slot=!enabled?null:['opening-file','migration-file'].includes(j.kind)&&j.enabled?{at:j.due,kind:j.kind}:nextWatchSlot(now,{interval});
      db.prepare('UPDATE studio_watch_jobs SET enabled=?,due=?,kind=?,interval=? WHERE owner=? AND fund=?').run(Number(enabled),slot?.at??null,slot?.kind??null,interval,owner,fund);
    },
    reserveModel(owner,fund,day,now){
      db.prepare('DELETE FROM studio_watch_budget WHERE used<?').run(now-31*86_400_000);
      return reserve.run(owner,fund,day,now,day,owner,day,now-30*86_400_000).changes===1;
    },
    cache:{
      get(key,now){const r=peek.get(key);return r&&r.expires>now?JSON.parse(r.value):null;},
      set(key,value,expires){db.prepare('DELETE FROM studio_watch_cache WHERE expires<?').run(Date.now());put.run(key,expires,JSON.stringify(value));},
    },
  };
}
