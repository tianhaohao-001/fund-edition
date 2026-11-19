export function createActivityStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS workspace_activity (
    workspace TEXT NOT NULL REFERENCES demo_sessions(session_id) ON DELETE CASCADE,
    request_id TEXT NOT NULL, kind TEXT NOT NULL, signature TEXT NOT NULL,
    status TEXT NOT NULL, events TEXT NOT NULL, updated INTEGER NOT NULL,
    PRIMARY KEY(workspace,request_id)
  )`);
  const row=db.prepare('SELECT * FROM workspace_activity WHERE workspace=? AND request_id=?');
  const write=db.prepare(`INSERT INTO workspace_activity VALUES (?,?,?,?,'running','[]',?)
    ON CONFLICT(workspace,request_id) DO UPDATE SET kind=excluded.kind,signature=excluded.signature,status='running',events='[]',updated=excluded.updated`);
  const event=db.prepare(`UPDATE workspace_activity SET events=json_insert(events,'$[#]',json(?)),updated=?
    WHERE workspace=? AND request_id=? AND status='running' AND json_array_length(events)<60`);
  const mark=db.prepare("UPDATE workspace_activity SET status=?,updated=? WHERE workspace=? AND request_id=? AND status='running'");
  const prune=db.prepare(`DELETE FROM workspace_activity WHERE workspace=? AND request_id IN (
    SELECT request_id FROM workspace_activity WHERE workspace=? AND status!='running' ORDER BY updated DESC LIMIT -1 OFFSET 90)`);
  function read(space,id) {
    const value=row.get(space,id);
    if(!value)return null;
    const stale=value.status==='running' && value.updated<Date.now()-10*60_000;
    return {requestId:id,kind:value.kind,status:stale?'failed':value.status,events:JSON.parse(value.events).map((e,i)=>({...e,seq:i+1}))};
  }
  return {read,
    start(space,id,kind,signature) {
      const existing=row.get(space,id), now=Date.now();
      if(existing?.status==='running' && existing.updated>=now-10*60_000) return null;
      prune.run(space,space);
      write.run(space,id,kind,signature,now);
      return {
        emit({actor,recipient,stage,text,source,responseId,evidenceRefs}) {
          const msg={at:new Date().toISOString(),actor,recipient,stage,text:String(text??'').slice(0,1200),source,responseId,evidenceRefs:evidenceRefs?.slice(0,8)};
          event.run(JSON.stringify(msg),Date.now(),space,id);
        },
        snapshot(status) { const value=read(space,id); return value?{...value,status}:null; },
        finish(status) { mark.run(status,Date.now(),space,id); },
      };
    },
  };
}

