import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createApp } from '../server.mjs';

function send(base, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const call = request(new URL(path, base), { method, headers }, response => {
      const data = [];
      response.on('data', chunk => data.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode, headers: response.headers, text: Buffer.concat(data).toString('utf8'),
      }));
    });
    call.on('error', reject);
    call.end(body);
  });
}

test('a shared link opens Fundroom while cross-site calls cannot reach the workspace or broker', async () => {
  const { server, host } = await createApp({ env: { FUNDROOM_DB_PATH: ':memory:' } });
  server.listen(0, host);
  await once(server, 'listening');
  const base = `http://${host}:${server.address().port}`;
  const foreign = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', Origin: 'https://event.example' };
  try {
    const page = await send(base, '/', { headers: foreign });
    assert.equal(page.status, 200);
    assert.match(page.text, /<link rel="manifest" href="\/manifest.webmanifest">/);
    assert.equal(page.headers['set-cookie'], undefined);
    const head = await send(base, '/index.html', { method: 'HEAD', headers: foreign });
    assert.equal(head.status, 200);
    assert.equal(head.text, '');
    assert.equal((await send(base, '/', { headers: { ...foreign, Host: 'untrusted.example' } })).status, 403);
    for (const path of ['/api/state', '/api/broker/status', '/broker.html']) {
      const response = await send(base, path, { headers: foreign });
      assert.equal(response.status, 403, path);
      assert.equal(JSON.parse(response.text).code, 'untrusted-origin');
    }
    for (const path of ['/api/action', '/api/broker/action']) {
      const response = await send(base, path, {
        method: 'POST', headers: { ...foreign, 'Content-Type': 'application/json' }, body: '{}',
      });
      assert.equal(response.status, 403, path);
      assert.equal(JSON.parse(response.text).code, 'untrusted-origin');
    }
    for (const [path, mime] of [['/manifest.webmanifest', /^application\/manifest\+json/], ['/sw.js', /^text\/javascript/], ['/offline.html', /^text\/html/]]) {
      const asset = await send(base, path);
      assert.equal(asset.status, 200, path);
      assert.match(asset.headers['content-type'], mime);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('a loopback browser preview can use Studio and Funds on its forwarded port', async (t) => {
  const { server, host } = await createApp({ env: { FUNDROOM_DB_PATH: ':memory:', FUNDROOM_ENABLE_LOCAL_VOICE: 'false' } });
  server.listen(0, host);
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const previewHost = server.address().port === 60708 ? 'localhost:60709' : 'localhost:60708';
  const headers = { Host: previewHost, 'Sec-Fetch-Site': 'same-origin' };
  const page = await send(base, '/', { headers });
  assert.equal(page.status, 200);
  assert.match(page.text, /href="#\/fund"/);
  assert.match(page.text, /href="#\/lab"/);
  const state = await send(base, '/api/state', { headers });
  assert.equal(state.status, 200);
  const cookie = state.headers['set-cookie'][0].split(';')[0];
  const body = JSON.stringify({ action: 'resetDesignConversation', requestId: 'preview-check', language: 'en-US' });
  const post = (changes) => send(base, '/api/action', {
    method: 'POST', body, headers: { ...headers, 'Content-Type': 'application/json', Cookie: cookie, ...changes },
  });
  const valid = await post({ Origin: `http://${previewHost}` });
  assert.equal(valid.status, 200);
  assert.ok(JSON.parse(valid.text).guide);
  for (const changes of [{}, { Origin: base }, { Origin: `http://${previewHost}`, 'Sec-Fetch-Site': 'same-site' }]) {
    assert.equal((await post(changes)).status, 403);
  }
  for (const path of ['/api/broker/status', '/api/paper/account', '/api/market/snapshot', '/api/mobile/state']) {
    assert.equal((await send(base, path, { headers })).status, 403, path);
  }
  assert.equal((await send(base, '/api/broker/action', { method: 'POST', headers: { ...headers, Origin: `http://${previewHost}` } })).status, 403);
  for (const untrusted of [
    { Host: 'untrusted.example:60708', 'X-Forwarded-Host': previewHost },
    { ...headers, 'X-Forwarded-For': '192.0.2.1' },
    { Host: 'localhost:99999' },
  ]) {
    assert.equal((await send(base, '/api/state', { headers: untrusted })).status, 403);
  }
});

test('the service worker only stores the static offline notice and leaves order requests on the network', async () => {
  const script = await readFile(new URL('../web/sw.js', import.meta.url), 'utf8');
  const origin = 'https://fundroom.example';
  const handlers = new Map();
  const cached = new Map();
  let online = true;
  const cache = {
    async addAll(requests) {
      for (const item of requests) {
        assert.equal(item.credentials, 'omit');
        cached.set(item.url, new Response(new URL(item.url).pathname));
      }
    },
    match(key) { return cached.get(String(key))?.clone(); },
  };
  runInNewContext(script, {
    self: {
      location: { origin }, addEventListener: (event, handler) => handlers.set(event, handler),
      skipWaiting() {},
    },
    caches: { open: async () => cache },
    Request, Response, URL,
    async fetch() {
      if (!online) throw new TypeError('Network unavailable');
      return new Response('Fresh homepage');
    },
  });
  let installation;
  handlers.get('install')({ waitUntil: result => { installation = result; } });
  await installation;
  assert.deepEqual([...cached.keys()].sort(), ['/assets/signature-mark.svg', '/brand.css', '/i18n.mjs', '/icon-192.png', '/install.css', '/offline.html', '/offline.mjs'].map(path => origin + path));

  function dispatch(path, mode = 'navigate', method = 'GET', requestOrigin = origin) {
    let response;
    handlers.get('fetch')({ request: { url: requestOrigin + path, method, mode }, respondWith: result => { response = result; } });
    return response;
  }
  assert.equal(await (await dispatch('/')).text(), 'Fresh homepage');
  online = false;
  assert.equal(await (await dispatch('/')).text(), '/offline.html');
  assert.equal(await (await dispatch('/install.css', 'cors')).text(), '/install.css');
  for (const sensitive of ['/api/state', '/api/broker/status', '/broker.html']) {
    assert.equal(dispatch(sensitive), undefined);
  }
  assert.equal(dispatch('/api/action', 'cors', 'POST'), undefined);
  assert.equal(dispatch('/icon-192.png', 'cors', 'GET', 'https://outside.example'), undefined);
});
