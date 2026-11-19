import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDirectApp} from '../hosting/site/direct-server.mjs';
import {serveDeviceAsset} from '../hosting/site/device-assets.mjs';
import {assetPrefix,deviceFiles} from '../web/device-dictation-files.mjs';

test('optional speech downloads reserve fixed file sizes across restarts before the origin is contacted',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'fund-edition-downloads-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const origin='https://fund.example';
  const name='model/tokenizer_config.json',file=deviceFiles.get(name);
  let transfers=0;
  t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(url,file.url);
    transfers++;
    return new Response(new Uint8Array(file.size));
  });
  const open=()=>createDirectApp({database:join(dir,'site.sqlite'),origin,credential:'fixture',monthlyDeviceMiB:1,
    siteWorker:{fetch:(request,env)=>serveDeviceAsset(request,env.reserveDeviceBytes)},
    voiceStatus:async()=>({local:false,languages:[]}),playbackLanguages:async()=>[]});
  const download=(app,method='GET')=>app.dispatch(new Request(origin+assetPrefix+name,{method}));
  let app=await open();
  try {
    assert.equal((await download(app,'HEAD')).status,200);
    const first=await download(app);
    assert.equal((await first.arrayBuffer()).byteLength,file.size);
    assert.equal(transfers,1);
  } finally {app.close();}
  app=await open();
  try {
    const results=await Promise.all(Array.from({length:3},()=>download(app)));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,200,429]);
    assert.equal(transfers,3);
    assert.equal((await download(app,'HEAD')).status,200);
    assert.equal(transfers,3);
  } finally {app.close();}
});
