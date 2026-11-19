import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../server.mjs';
import { createMobileSessions } from '../core/mobile-session.mjs';

const CODE = 'test-mobile-code-0123456789';

test('mobile pairing is explicit, single-use and bounded by attempts and expiry', () => {
  const disabled = createMobileSessions({ enabled: false, code: CODE });
  assert.throws(() => disabled.pair(CODE), error => error.code === 'mobile-pairing-disabled');
  let time = 1_000_000;
  const valid = createMobileSessions({ enabled: true, code: CODE, now: () => time });
  assert.throws(() => valid.pair('wrong'), error => error.code === 'mobile-pairing-invalid');
  const paired = valid.pair(CODE);
  assert.equal(paired.token.length, 43);
  assert.equal(valid.authorize(`Bearer ${paired.token}`).sessionId, paired.sessionId);
  assert.throws(() => valid.pair(CODE), error => error.code === 'mobile-pairing-expired');
  time += 12 * 60 * 60_000;
  assert.throws(() => valid.authorize(`Bearer ${paired.token}`), error => error.code === 'mobile-session-required');
  const limited = createMobileSessions({ enabled: true, code: CODE });
  for (let index = 0; index < 8; index += 1) assert.throws(() => limited.pair('wrong'));
  assert.throws(() => limited.pair(CODE), error => error.code === 'mobile-pairing-limit');
  const expiring = createMobileSessions({ enabled: true, code: CODE, now: () => time });
  time += 5 * 60_000 + 1;
  assert.throws(() => expiring.pair(CODE), error => error.code === 'mobile-pairing-expired');
});

test('native bearer sessions stay outside browser and broker accounts and authenticate audio before reading it', async () => {
  const { server, host } = await createApp({
    env: { FUNDROOM_DB_PATH: ':memory:', FUNDROOM_ENABLE_LOCAL_VOICE: 'false', FUNDROOM_MOBILE_ENABLED: 'true', FUNDROOM_MOBILE_PAIR_CODE: CODE },
    fetchImpl: async () => assert.fail('This test must not call an external service.'),
  });
  server.listen(0, host);
  await once(server, 'listening');
  const base = `http://${host}:${server.address().port}`;
  const post = async (path, body, headers = {}) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  try {
    const webResponse = await fetch(base + '/api/state');
    const webCookie = webResponse.headers.get('set-cookie').split(';')[0];
    const web = await webResponse.json();
    const unpaired = await fetch(base + '/api/mobile/state');
    assert.equal(unpaired.status, 401);
    const crossSite = await post('/api/mobile/pair', { code: CODE }, { Origin: 'https://third-party.example', 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(crossSite.status, 403);
    const pair = await post('/api/mobile/pair', { code: CODE, language: 'en-US' });
    assert.equal(pair.status, 200);
    assert.equal(pair.headers.get('access-control-allow-origin'), null);
    assert.equal(pair.headers.get('set-cookie'), null);
    assert.equal(pair.data.sessionId, undefined);
    const authorization = `Bearer ${pair.data.token}`;
    const read = async () => (await fetch(base + '/api/mobile/state', { headers: { Authorization: authorization } })).json();
    const native = await read();
    assert.equal(native.guide.language, 'en-US');
    assert.notEqual(native.fund.id, web.fund.id);
    const purchase = { action: 'catalogBuy', catalogId: 'contrafund', amount: 1000, requestId: 'native-retry', language: 'en-US' };
    const filled = await post('/api/mobile/action', purchase, { Authorization: authorization });
    const retry = await post('/api/mobile/action', { ...purchase, language: 'zh-CN' }, { Authorization: authorization });
    assert.equal(filled.status, 200);
    assert.deepEqual(retry.data.catalogAccounts, filled.data.catalogAccounts);
    assert.equal(retry.data.catalogAccounts.contrafund.history.length, 1);
    assert.deepEqual((await (await fetch(base + '/api/state', { headers: { Cookie: webCookie } })).json()).catalogAccounts, {});
    assert.equal((await post('/api/action', purchase, { Authorization: authorization })).status, 401);
    assert.equal((await post('/api/mobile/broker/action', { action: 'submit' }, { Authorization: authorization })).status, 404);
    const audio = await fetch(base + '/api/mobile/voice/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/mp4' }, body: Buffer.alloc(1_000_000) });
    assert.equal(audio.status, 401);
    const invalidAudio = await fetch(base + '/api/mobile/voice/transcribe', { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/octet-stream' }, body: Buffer.alloc(32) });
    assert.equal(invalidAudio.status, 415);
    assert.equal((await post('/api/mobile/disconnect', {}, { Authorization: authorization })).status, 200);
    assert.equal((await fetch(base + '/api/mobile/state', { headers: { Authorization: authorization } })).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
