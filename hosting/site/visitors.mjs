const DAY=86400000,TTL=90*DAY;
const cookieName='__Host-morrowfolio-visitor';
let siteSalt;
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const hash=async text=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));
function cookieValue(request){
  const value=request.headers.get('Cookie')?.split(';').map(p=>p.trim()).find(p=>p.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  return value && /^[a-f0-9]{64}$/.test(value)?value:null;
}
const cookie=(token,age)=>cookieName+'='+token+'; Path=/; Max-Age='+age+'; Secure; HttpOnly; SameSite=Strict';
export function nativeUser(request){
  const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');
  return id&&email?id:null;
}
async function getIpKey(request,db) {
  if(!siteSalt){
    await db.prepare("INSERT OR IGNORE INTO security_settings (name,value) VALUES('daily-ip-key',lower(hex(randomblob(32))))").run();
    siteSalt=(await db.prepare("SELECT value FROM security_settings WHERE name='daily-ip-key'").first()).value;
  }
  // The edge supplies CF-Connecting-IP; a visitor's forwarded header is never a rate-limit identity.
  return hash(siteSalt+'|'+new Date().toISOString().slice(0,10)+'|'+(request.headers.get('CF-Connecting-IP')||'unavailable'));
}
export async function visitorContext(request,db,allowCreate){
 const account=nativeUser(request),value=cookieValue(request),now=Date.now(),ip=await getIpKey(request,db);
 const fingerprint=value?await hash(value):null;
 const visitor=fingerprint?await db.prepare('SELECT space,expires,claimed_by FROM visitor_spaces WHERE token_hash=?').bind(fingerprint).first():null;
 if(account){
   if(visitor && visitor.expires>now && !visitor.claimed_by){
     const space=visitor.space;
     // The claimed_by condition in every adoption write prevents a second account from adopting the same browser data.
     await db.batch([
       db.prepare('UPDATE visitor_spaces SET claimed_by=? WHERE token_hash=? AND claimed_by IS NULL AND expires>?').bind(account,fingerprint,now),
       db.prepare(`INSERT OR IGNORE INTO account_spaces(account,space,created)
        SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM visitor_spaces WHERE token_hash=? AND claimed_by=?) AND
         (EXISTS(SELECT 1 FROM conversations WHERE owner=?) OR EXISTS(SELECT 1 FROM calls WHERE owner=? AND status='busy') OR EXISTS(SELECT 1 FROM drafts WHERE owner=? AND message!=''))`).bind(account,space,now,fingerprint,account,space,space,space),
       db.prepare(`INSERT INTO account_focus(account,space) SELECT ?,? WHERE EXISTS(SELECT 1 FROM account_spaces WHERE account=? AND space=?)
          ON CONFLICT(account) DO UPDATE SET space=excluded.space`).bind(account,space,account,space)
     ]);
   }
   const setting=await db.prepare('SELECT space FROM account_focus WHERE account=?').bind(account).first();
   return {owner:setting?.space||account,account,guest:false,ip,cookie:value?cookie('',0):null};
 }
 if(visitor && visitor.expires>now && !visitor.claimed_by)
   return {owner:visitor.space,account:null,guest:true,ip,cookie:null};
 if(!allowCreate)return null;
 const token=hex(crypto.getRandomValues(new Uint8Array(32))),space='guest/'+crypto.randomUUID();
 const inserted=await db.prepare(`INSERT INTO visitor_spaces(token_hash,space,ip_key,created,expires)
 SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM visitor_spaces WHERE ip_key=? AND created>?)<80
  AND (SELECT COUNT(*) FROM visitor_spaces WHERE ip_key=? AND created>?)<250
  AND (SELECT COUNT(*) FROM visitor_spaces WHERE created>?)<2000`)
 .bind(await hash(token),space,ip,now,now+TTL,ip,now-3600000,ip,now-DAY,now-DAY).run();
 if(!inserted.meta.changes)return {limited:true};
 return {owner:space,account:null,guest:true,ip,cookie:cookie(token,TTL/1000)};
}
export function attachCookie(response,ctx) {
 if(ctx?.cookie)response.headers.append('Set-Cookie',ctx.cookie);
 return response;
}
export async function listSpaces(ctx,db) {
 if(!ctx.account)return {active:'current',workspaces:[{id:'current',active:true,label:'current',updatedAt:null}]};
 const found=await db.prepare('SELECT space,created FROM account_spaces WHERE account=? ORDER BY created DESC LIMIT 100').bind(ctx.account).all();
 const rows=[{space:ctx.account,created:null},...found.results];
 return {active:ctx.owner===ctx.account?'home':ctx.owner,workspaces:await Promise.all(rows.map(async r=>{
    const guide=await db.prepare("SELECT content FROM conversations WHERE owner=? AND topic='studio'").bind(r.space).first();
    const content=guide?JSON.parse(guide.content):null;
    return {id:r.space===ctx.account?'home':r.space,active:r.space===ctx.owner,label:content?.fund?.name||content?.draft?.name||content?.profile?.goal?.slice(0,80)||(r.space===ctx.account?'account':'guest'),updatedAt:r.created?new Date(r.created).toISOString():null};
 }))};
}
export async function chooseSpace(ctx,db,id) {
 if(!ctx.account || typeof id!=='string' || !(id==='home'||/^guest\/[a-f0-9-]{36}$/u.test(id))) return false;
 const owned=id==='home'||await db.prepare('SELECT 1 FROM account_spaces WHERE account=? AND space=?').bind(ctx.account,id).first();
 if(!owned)return false;
 await db.prepare('INSERT INTO account_focus(account,space) VALUES(?,?) ON CONFLICT(account) DO UPDATE SET space=excluded.space').bind(ctx.account,id==='home'?ctx.account:id).run();
 return true;
}
