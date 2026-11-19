export async function draftResponse(request,db,owner,topic,json,fail){
 const current=await db.prepare('SELECT revision,message,updated FROM drafts WHERE owner=? AND topic=?').bind(owner,topic).first();
 const snapshot=r=>r?{revision:r.revision,message:r.message,updatedAt:new Date(r.updated).toISOString()}:{revision:0,message:'',updatedAt:null};
 if(request.method==='GET')return json(snapshot(current));
 if(request.method!=='PUT')return fail(405,'method');
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail(403,'origin');
 if(!request.headers.get('content-type')?.startsWith('application/json'))return fail(415,'json-required');
 const reader=request.body?.getReader();if(!reader)return fail(400,'invalid-request');
 const decoder=new TextDecoder();let raw='',size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return fail(413,'body-limit');}raw+=decoder.decode(value,{stream:true});}
 let body;try{body=JSON.parse(raw+decoder.decode());}catch{return fail(400,'invalid-request');}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='message'&&k!=='revision')||typeof body.message!=='string'||body.message.length>3000||!Number.isSafeInteger(body.revision)||body.revision<0)return fail(400,'invalid-request');
 if(current?.message===body.message)return json(snapshot(current));
 if(body.revision!==(current?.revision||0))return fail(409,'stale');
 const now=Date.now();
 const saved=await db.prepare(`INSERT INTO drafts(owner,topic,revision,message,updated) SELECT ?,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM drafts WHERE owner=? AND topic=? AND revision=?)
 ON CONFLICT(owner,topic) DO UPDATE SET revision=excluded.revision,message=excluded.message,updated=excluded.updated WHERE drafts.revision=?`)
 .bind(owner,topic,body.revision+1,body.message,now,body.revision,owner,topic,body.revision,body.revision).run();
 if(!saved.meta.changes)return fail(409,'stale');
 return json(snapshot({revision:body.revision+1,message:body.message,updated:now}));
}
