import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { requestJson, RequestConnectionError } from '../web/json-request.mjs';

test('a timed-out submitted action has an unknown outcome and is never automatically repeated', async () => {
  let accepted = 0;
  const server = createServer((request, response) => {
    accepted++;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{"accepted":');
    // The server has accepted the action but its body cannot finish reaching the browser.
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await assert.rejects(requestJson(`http://127.0.0.1:${server.address().port}/api/action`, {
      method: 'POST', body: JSON.stringify({ action: 'designConversation', requestId: 'retain-this-id' }),
    }, { timeoutMs: 100 }), error => {
      assert.ok(error instanceof RequestConnectionError);
      assert.equal(error.resultUnknown, true);
      assert.equal(error.timedOut, true);
      return true;
    });
    assert.equal(accepted, 1);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('read failures, HTTP problems and invalid response bodies remain distinguishable', async () => {
  await assert.rejects(requestJson('/api/state', {}, { fetchImpl: async () => { throw new TypeError('offline'); } }),
    error => error instanceof RequestConnectionError && !error.resultUnknown && !error.timedOut);
  const unavailable = await requestJson('/api/action', { method: 'POST' }, {
    fetchImpl: async () => Response.json({ code: 'manager-unavailable' }, { status: 503 }),
  });
  assert.equal(unavailable.response.status, 503);
  assert.equal(unavailable.data.code, 'manager-unavailable');
  const invalid = await requestJson('/api/state', {}, { fetchImpl: async () => new Response('not json') });
  assert.equal(invalid.data, null);
});

test('a successful write with an unreadable or empty result requires authoritative state recovery', async () => {
  for (const body of ['not json', '', 'null']) {
    let calls = 0;
    await assert.rejects(requestJson('/api/action', { method: 'POST' }, {
      fetchImpl: async () => { calls++; return new Response(body, { status: 200 }); },
    }), error => error instanceof RequestConnectionError && error.resultUnknown && !error.timedOut);
    assert.equal(calls, 1);
  }
  const failed = await requestJson('/api/action', { method: 'POST' }, {
    fetchImpl: async () => new Response('not json', { status: 503 }),
  });
  assert.equal(failed.response.status, 503);
  assert.equal(failed.data, null);
});
