import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createMobileGateway } from '../mobile/scripts/mobile-gateway.mjs';

test('private mobile gateway exposes only native mobile routes and preserves the backend auth boundary', async () => {
  let forwarded = 0;
  const backend = http.createServer((request, response) => {
    forwarded += 1;
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers['x-forwarded-host'], undefined);
    response.writeHead(request.headers.authorization === 'Bearer sample' ? 200 : 401, { 'Set-Cookie': 'should-not-leave=1' });
    response.end(JSON.stringify({ path: request.url }));
  }).listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const gateway = createMobileGateway({ backendPort: backend.address().port }).listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const url = `http://127.0.0.1:${gateway.address().port}`;
  try {
    for (const path of ['/', '/api/state', '/api/action', '/api/broker/account', '/.env']) {
      assert.equal((await fetch(`${url}${path}`)).status, 403);
    }
    assert.equal((await fetch(`${url}/api/mobile/state`, { headers: { Origin: 'https://evil.test' } })).status, 403);
    assert.equal(forwarded, 0);
    assert.equal((await fetch(`${url}/api/mobile/state`)).status, 401);
    const state = await fetch(`${url}/api/mobile/state?language=en-US`, { headers: { Authorization: 'Bearer sample', Cookie: 'web-secret=1', 'X-Forwarded-Host': 'evil.test' } });
    assert.equal(state.status, 200);
    assert.equal(state.headers.get('set-cookie'), null);
    assert.equal(state.headers.get('access-control-allow-origin'), null);
    assert.equal((await state.json()).path, '/api/mobile/state?language=en-US');
  } finally { await Promise.all([new Promise(resolve => gateway.close(resolve)), new Promise(resolve => backend.close(resolve))]); }
});
