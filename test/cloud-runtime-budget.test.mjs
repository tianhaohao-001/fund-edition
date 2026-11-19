import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openStore } from '../core/store.mjs';
import { requestQuotaAddress } from '../server.mjs';

test('verified Railway HTTP ingress partitions quotas by the edge address and other paths keep socket limits', () => {
  const host = 'fund.example.test';
  const peer = '192.0.2.9';
  const request = {
    socket:{remoteAddress:peer},
    headers:{host, 'x-forwarded-host':host, 'x-forwarded-proto':'https', 'x-real-ip':'198.51.100.14'},
  };
  assert.equal(requestQuotaAddress(request,null),peer);
  assert.equal(requestQuotaAddress(request,host),'198.51.100.14');
  const choose = changes => requestQuotaAddress({...request, headers:{...request.headers, ...changes}},host);
  assert.equal(choose({'x-real-ip':'203.0.113.2'}),'203.0.113.2');
  assert.equal(choose({'x-real-ip':'2001:0db8:0000:0000::4'}),'2001:db8::4');
  assert.equal(choose({'x-real-ip':undefined,'x-forwarded-for':'198.51.100.14'}),peer);
  assert.equal(choose({'x-real-ip':'not-one-address'}),peer);
  assert.equal(choose({'x-forwarded-host':'fund.railway.internal'}),peer);
  assert.equal(choose({host:'localhost'}),peer);
  assert.equal(choose({'x-forwarded-proto':'http'}),peer);
});

test('public model reservations count all seats, survive restart, and never charge a denied guest',()=>{
  const folder=mkdtempSync(join(tmpdir(),'fund-edition-budget-'));
  const database=join(folder,'test.sqlite');
  let store=openStore(database);
  try {
    let admitted=0;
    assert.equal(store.reserveHostedModelUse(3,10,2,()=>{admitted++;}),false);
    assert.equal(admitted,0);
    assert.throws(()=>store.reserveHostedModelUse(1,10,3,()=>{throw new Error('guest already reached their limit');}));
    assert.equal(store.reserveHostedModelUse(3,10,3,()=>{admitted++;}),true);
    assert.equal(admitted,1);
    store.close();store=openStore(database);
    assert.equal(store.reserveHostedModelUse(1,10,3),false);
    assert.equal(store.reserveHostedModelUse(1,3,10),false);
    assert.equal(store.reserveHostedModelUse(1,4,10),true);
    assert.equal(store.reserveHostedModelUse(1,0,10),false);
    assert.equal(store.reserveHostedModelUse(1,10,0),false);
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});
