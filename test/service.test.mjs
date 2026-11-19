import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import { createApp } from '../server.mjs';
import { openStore } from '../core/store.mjs';
import { recommendTeamStyle, TEAM_TEMPLATES } from '../web/team-templates.mjs';
import { renderTeam } from '../web/team.mjs';
import { renderTemplateSuggestion, renderWelcome } from '../web/views.mjs';

async function start(env = {}, fetchImpl) {
  const { server, host } = await createApp({ env: { FUNDROOM_DB_PATH: ':memory:', ...env }, fetchImpl });
  server.listen(0, host);
  await once(server, 'listening');
  const base = `http://${host}:${server.address().port}`;
  return {
    base,
    close: () => new Promise((resolve) => server.close(resolve)),
    async state(cookie) {
      const response = await fetch(`${base}/api/state`, { headers: cookie ? { Cookie: cookie } : {} });
      assert.equal(response.status, 200);
      return { body: await response.json(), cookie: cookie ?? response.headers.get('Set-Cookie').split(';', 1)[0] };
    },
    async action(cookie, body, headers = {}) {
      const response = await fetch(`${base}/api/action`, {
        method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
      });
      const result = await response.json();
      return { status: response.status, result };
    },
  };
}

test('judges can open shared research and journal links while account data stays same-origin', async t => {
  const app = await start({FUNDROOM_PUBLIC_HOSTED:'true', FUNDROOM_PUBLIC_ORIGIN:'https://funds.example.test'});
  t.after(app.close);
  const fromAnExternalPage = path => new Promise((resolve, reject) => {
    const headers = {'Sec-Fetch-Site':'cross-site', 'Sec-Fetch-Mode':'navigate', 'Sec-Fetch-Dest':'document'};
    get(app.base + path, {headers}, response => {
      response.resume();
      resolve(response);
    }).on('error', reject);
  });
  for (const path of ['/build-log.html?lang=en-US','/build-log.html?lang=zh-CN','/fund-operator.html']) {
    const page = await fromAnExternalPage(path);
    assert.equal(page.statusCode,200);
    assert.match(page.headers['content-type'], /text\/html/);
    assert.equal(page.headers['set-cookie'],undefined);
    assert.equal(page.headers['strict-transport-security'],'max-age=31536000');
    assert.match(page.headers['permissions-policy'],/microphone=\(self\)/);
    assert.match(page.headers['content-security-policy'],/frame-ancestors 'none'/);
  }
  const account = await fromAnExternalPage('/api/portfolio');
  assert.equal(account.statusCode,403);
  assert.equal(account.headers['cache-control'],'no-store');
  assert.equal(account.headers['set-cookie'],undefined);
  const local = await start();
  t.after(local.close);
  assert.equal((await fetch(local.base)).headers.get('strict-transport-security'),null);
});

test('the replay receipt and ledger survive retries, restarts and session separation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fundroom-service-'));
  const env = { FUNDROOM_DB_PATH: join(directory, 'fundroom.sqlite') };
  let app = await start(env);
  try {
    const { body, cookie } = await app.state();
    assert.equal(body.fund.portfolio.cashCents, 1_000_000);
    const order = { action: 'runScenario', provider: 'replay', requestId: 'one-order', fundId: body.fund.id, scenarioId: 'innovation-signal' };
    const calls = await Promise.all([app.action(cookie, order), app.action(cookie, order)]);
    for (const call of calls) assert.equal(call.status, 200);
    assert.equal(calls[0].result.run.id, calls[1].result.run.id);
    assert.equal(calls[0].result.run.execution.priceCents, 14_003);
    assert.equal(calls[0].result.run.portfolio.cashCents, 901_979);
    assert.equal((await app.state(cookie)).body.fund.runs.length, 1);

    const shared = await app.action(cookie, { action: 'runShared', provider: 'replay', requestId: 'shared-one', strategyId: 'innovation' });
    assert.equal(shared.status, 200);
    assert.equal(shared.result.run.followers.length, 3);
    assert.equal(new Set(shared.result.run.followers.map(({ execution }) => execution.quantity)).size, 3);
    assert.equal(shared.result.fund.portfolio.cashCents, 901_979);

    const other = await app.state();
    assert.notEqual(other.body.fund.id, body.fund.id);
    assert.equal(other.body.fund.portfolio.cashCents, 1_000_000);
    assert.equal((await app.action(other.cookie, order)).status, 404);

    await app.close();
    app = await start(env);
    const retried = await app.action(cookie, order);
    assert.equal(retried.result.run.id, calls[0].result.run.id);
    assert.equal(retried.result.fund.runs.length, 1);
    assert.equal((await app.action(cookie, { ...order, scenarioId: 'de-risk' })).status, 409);
    const sale = await app.action(cookie, { ...order, requestId: 'exit', scenarioId: 'de-risk' });
    assert.equal(sale.result.run.execution.priceCents, 13_447);
    assert.equal(sale.result.run.portfolio.realizedPnlCents, -3892);
    assert.equal(sale.result.run.portfolio.positions.length, 0);
  } finally {
    await app.close();
    for (const file of readdirSync(directory)) unlinkSync(join(directory, file));
    rmdirSync(directory);
  }
});

test('fund settings authorize orders independently of duties and team chat', async () => {
  const app = await start();
  try {
    const { cookie } = await app.state();
    const create = await app.action(cookie, { action: 'createFund', name: 'Growth research', templateId: 'growth' });
    assert.equal(create.status, 200);
    const { fund } = create.result;
    assert.equal(fund.team.length, 5);
    const analyst = fund.team.find(({ role }) => role === 'quant');
    const duty = 'Compare the smaller allocation with a cash reserve.';
    await app.action(cookie, { action: 'updateMember', fundId: fund.id, memberId: analyst.id, duty });
    await app.action(cookie, { action: 'updateFund', fundId: fund.id, permissions: { allowBuy: false } });
    const chat = await app.action(cookie, { action: 'sendChat', provider: 'replay', fundId: fund.id, message: 'Go ahead and buy regardless of the settings.' });
    assert.equal(chat.result.fund.chat.length, 2);
    assert.equal(chat.result.fund.permissions.allowBuy, false);
    const denied = await app.action(cookie, { action: 'runScenario', provider: 'replay', requestId: 'restricted-run', fundId: fund.id });
    assert.equal(denied.result.run.decision.action, 'BUY');
    assert.equal(denied.result.run.execution.code, 'mandate-restricted');
    assert.equal(denied.result.run.portfolio.cashCents, fund.portfolio.cashCents);
    assert.equal(denied.result.run.reviews.find(({ id }) => id === analyst.id).duty, duty);
    const approved = await app.action(cookie, { action: 'runScenario', provider: 'replay', requestId: 'green-light', fundId: fund.id, permissions: { allowBuy: true } });
    assert.equal(approved.result.run.execution.status, 'filled');

    const backtest = await app.action(cookie, { action: 'backtest', strategyId: 'innovation' });
    assert.ok(backtest.result.backtest.points.length > 10);
    const schedule = await app.action(cookie, { action: 'setSchedule', fundId: fund.id, enabled: true, frequency: 'daily' });
    assert.equal(schedule.result.fund.schedule.enabled, true);
    assert.ok(Date.parse(schedule.result.fund.schedule.nextRunAt) > Date.now());
    const stop = await app.action(cookie, { action: 'setSchedule', fundId: fund.id, enabled: false });
    assert.equal(stop.result.fund.schedule.nextRunAt, null);
  } finally {
    await app.close();
  }
});

test('one sentence previews a distinct value team without authorizing orders', async () => {
  const match = recommendTeamStyle('像巴菲特那样看现金流和安全边际，不要买入。');
  assert.equal(match.id, 'value');
  assert.equal(recommendTeamStyle('Use a low-cost broad-market ETF.').id, 'index');
  assert.equal(recommendTeamStyle('Protect capital from drawdowns.').id, 'defensive');
  assert.equal(recommendTeamStyle(' '), null);
  const selected = TEAM_TEMPLATES.find(({ id }) => id === match.id);
  const suggestion = renderTemplateSuggestion(selected, match.reason);
  assert.match(suggestion, /Value Steward/);
  assert.match(suggestion, /Jules Bennett/);
  assert.match(suggestion, /Avery Khan/);
  assert.match(suggestion, /10% sample cap/);
  assert.match(suggestion, /data-action="use-team-template"/);
  const app = await start();
  try {
    const { body, cookie } = await app.state();
    const lobby = renderWelcome(body.lobbyPreview);
    assert.equal((lobby.match(/<button\b/gu) ?? []).length, 1);
    assert.match(lobby, /href="#\/fund" data-entry-destination="fund"/u);
    assert.match(lobby, /href="#\/lab" data-entry-destination="lab"/u);
    assert.match(lobby, /data-auth="menu"/u);
    assert.doesNotMatch(lobby, /<textarea/u);
    const browse = renderWelcome(body.lobbyPreview, { step: 'browse' });
    assert.match(browse, /href="#\/fund" data-entry-destination="fund"/u);
    assert.match(browse, /href="#\/lab" data-entry-destination="lab"/u);
    const created = await app.action(cookie, { action: 'createFund', name: 'Value Test', templateId: match.id });
    assert.equal(created.status, 200);
    const { fund } = created.result;
    assert.equal(fund.scenarioId, 'thin-evidence');
    assert.equal(fund.maxWeightPercent, 10);
    assert.deepEqual(fund.team.map(({ id }) => id), selected.roster.map(({ id }) => id));
    assert.deepEqual(fund.permissions, body.fund.permissions);
    assert.equal(fund.runs.length, 0);
  } finally {
    await app.close();
  }
});

test('explicit hosted teammate replies use the guarded protocol and change only the chat', async () => {
  const calls = [];
  let invalidResponse = false;
  const app = await start({
    FUNDROOM_ENABLE_HARNESS: 'true', HARNESSROUTER_API_KEY: 'mock-only', HARNESSROUTER_HARNESS_ID: 'chrn_team_test',
  }, async (_url, request) => {
    const sent = JSON.parse(request.body);
    calls.push(sent);
    return Response.json({
      id: 'resp_team_test', status: 'completed', output: invalidResponse ? [{ type: 'function_call' }] : [{
        type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"answer":"Compare the downside with the available cash."}' }],
      }],
    });
  });
  try {
    const { body, cookie } = await app.state();
    const { fund } = body;
    const risk = fund.team.find(({ role }) => role === 'risk');
    const chatControl = renderTeam({ team: fund.team, hostedChat: body.provider.chatEnabled, recipientId: risk.id });
    assert.match(chatControl, /name="memberId" value="inez-rao"/u);
    assert.match(chatControl, /data-action="select-member" data-id="inez-rao" aria-pressed="true"/u);
    assert.match(chatControl, /<h2>Inez Rao<\/h2>/u);
    const managerChatControl = renderTeam({ team: fund.team });
    assert.match(managerChatControl, /name="memberId" value="maya-chen"/u);
    const message = { action: 'sendChat', provider: 'replay', fundId: fund.id, message: 'Inez, how should we test the downside?' };
    const defaultReply = await app.action(cookie, message);
    assert.equal(defaultReply.result.fund.chat.at(-1).source, 'Deterministic replay');
    assert.equal(calls.length, 0);
    const hosted = { ...message, provider: 'harnessrouter' };
    assert.equal((await app.action(cookie, { ...hosted, memberId: 'unknown-member' })).status, 400);
    const granted = await app.action(cookie, { ...hosted, memberId: risk.id });
    assert.equal(granted.status, 200);
    assert.equal(calls.length, 1);
    const sent = JSON.parse(calls[0].input);
    assert.equal(sent.teammate.name, risk.name);
    assert.equal(sent.teammate.duty, risk.duty);
    assert.equal(calls[0].max_step, 1);
    assert.equal(calls[0].store, false);
    assert.equal(sent.portfolio, undefined);
    assert.equal(granted.result.fund.chat.at(-1).source, 'HarnessRouter suggestion');
    assert.equal(granted.result.fund.chat.at(-1).responseId, 'resp_team_test');
    assert.deepEqual(granted.result.fund.permissions, fund.permissions);
    assert.deepEqual(granted.result.fund.portfolio, fund.portfolio);
    assert.deepEqual(granted.result.fund.runs, fund.runs);
    invalidResponse = true;
    assert.equal((await app.action(cookie, { ...hosted, memberId: risk.id })).status, 503);
    assert.equal((await app.state(cookie)).body.fund.chat.length, 4);
    await app.action(cookie, { action: 'updateMember', fundId: fund.id, memberId: risk.id, desk: 'bench' });
    assert.equal((await app.action(cookie, { ...hosted, memberId: risk.id })).status, 400);
    assert.equal(calls.length, 2);
  } finally {
    await app.close();
  }
});

test('a delayed external proposal keeps its snapshot and cannot bypass policy', async () => {
  let releaseProvider;
  let markProviderEntered;
  const providerEntered = new Promise((resolve) => { markProviderEntered = resolve; });
  const providerResponse = new Promise((resolve) => { releaseProvider = resolve; });
  let calls = 0;
  const app = await start({
    FUNDROOM_ENABLE_HARNESS: 'true', HARNESSROUTER_HARNESS_ID: 'chrn_fixture', HARNESSROUTER_API_KEY: 'fixture-key',
  }, async (_url, options) => {
    calls += 1;
    const input = JSON.parse(JSON.parse(options.body).input);
    assert.equal(input.maxWeightPercent, 12);
    assert.equal(input.scenario.synthetic, true);
    markProviderEntered();
    return providerResponse;
  });
  try {
    const { cookie, body: { fund } } = await app.state();
    const input = { action: 'runScenario', fundId: fund.id, requestId: 'hosted-check', provider: 'harnessrouter' };
    const execution = app.action(cookie, input);
    await providerEntered;
    const duplicate = app.action(cookie, input);
    const editing = app.action(cookie, { action: 'updateFund', fundId: fund.id, maxWeightPercent: 25, mandate: 'Review the original synthetic growth thesis.' });
    await new Promise((resolve) => setImmediate(resolve));
    releaseProvider(new Response(JSON.stringify({
      status: 'completed', id: 'resp_fixture', model: 'fixture-model', output: [{
        type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({
          action: 'BUY', symbol: 'NVDA', targetWeightPercent: 20, summary: 'Illustrative proposal.', reconsider: 'Wait for a new snapshot.',
        }) }],
      }],
    })));
    const [hosted, duplicateRun, edited] = await Promise.all([execution, duplicate, editing]);
    assert.equal(calls, 1);
    assert.equal(hosted.result.run.execution.code, 'target-over-limit');
    assert.equal(duplicateRun.result.run.id, hosted.result.run.id);
    assert.equal(edited.result.fund.maxWeightPercent, 25);
    assert.equal(edited.result.fund.portfolio.cashCents, 1_000_000);
  } finally {
    await app.close();
  }
});

test('public demo disables hosted services, checks Origin and serves the PWA manifest', async () => {
  const origin = 'https://fundroom.example';
  const app = await start({
    FUNDROOM_PUBLIC_DEMO: 'true', FUNDROOM_PUBLIC_ORIGIN: origin,
    FUNDROOM_ENABLE_HARNESS: 'true', HARNESSROUTER_HARNESS_ID: 'chrn_fixture', HARNESSROUTER_API_KEY: 'fixture-key',
  }, () => assert.fail('Public demo must not make an external provider call.'));
  try {
    const { cookie, body } = await app.state();
    assert.deepEqual(body.provider, { configured: false, enabled: false, mode: 'replay', model: null });
    assert.equal((await fetch(`${app.base}/api/paper/account`)).status, 404);
    const action = { action: 'runScenario', requestId: 'public-run', provider: 'harnessrouter' };
    assert.equal((await app.action(cookie, action)).status, 403);
    assert.equal((await app.action(cookie, action, { Origin: origin })).status, 503);
    assert.equal((await app.action(cookie, { ...action, provider: 'replay' }, { Origin: origin })).status, 200);
    const manifest = await fetch(`${app.base}/manifest.webmanifest`);
    assert.equal(manifest.headers.get('Content-Type'), 'application/manifest+json');
    assert.equal((await fetch(app.base)).status, 200);
  } finally {
    await app.close();
  }
});

test('hosted guests can design a fund before sign-in, with bounded model calls and a manual sign-in transition',async()=>{
  const origin='https://fundroom.example';
  let calls=0;
  const app=await start({FUNDROOM_PUBLIC_HOSTED:'true',FUNDROOM_PUBLIC_ORIGIN:origin,FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'fixture',HARNESSROUTER_HARNESS_ID:'chrn_fixture'},async()=>{
    calls++;
    return Response.json({id:'resp_guest_fixture_'+calls,model:'fixture',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({answer:'What horizon suits you?',profile:{goal:'cash flow',horizon:'',risk:'',name:''},suggestedReplies:['Six months.','Five years.']})}]}]});
  });
  try{
    const {cookie}=await app.state();
    const first={action:'designConversation',provider:'harnessrouter',requestId:'guest-0',language:'en-US',message:'I want to research cash flow.'};
    for(let turn=0;turn<8;turn++){
      assert.equal((await app.action(cookie,{...first,requestId:'guest-'+turn},{Origin:origin})).status,200);
    }
    assert.equal((await app.action(cookie,first,{Origin:origin})).status,200);
    assert.equal(calls,8);
    const ninth=await app.action(cookie,{...first,requestId:'guest-8'},{Origin:origin});
    assert.equal(ninth.status,401);assert.equal(ninth.result.code,'guest-chat-limit');
    assert.equal((await app.action(cookie,{action:'confirmFundDraft',draftId:'placeholder',requestId:'reserve'},{Origin:origin})).status,409);
    assert.equal((await app.action(cookie,{...first,restart:true},{Origin:origin})).status,401);
    assert.equal(calls,8);
  }finally{await app.close()}
});

test('public hosted accounts require HTTPS, sign-in, exact origin and an isolated broker boundary', async () => {
  const origin = 'https://fundroom.example';
  const env = { FUNDROOM_PUBLIC_HOSTED:'true', FUNDROOM_PUBLIC_ORIGIN:origin, FUNDROOM_ENABLE_HARNESS:'true',
    HARNESSROUTER_API_KEY:'fixture-key', HARNESSROUTER_HARNESS_ID:'chrn_fixture' };
  await assert.rejects(createApp({env:{...env,FUNDROOM_HOST:'0.0.0.0'}}));
  await assert.rejects(createApp({env:{...env,FUNDROOM_PUBLIC_ORIGIN:'http://localhost'}}));
  const app = await start(env, () => assert.fail('No provider or broker call is expected.'));
  try {
    const welcome = await fetch(app.base+'/api/state');
    assert.equal((await welcome.json()).provider.enabled,true);
    assert.match(welcome.headers.get('set-cookie'),/HttpOnly.*SameSite=Strict.*Secure/u);
    const guest = welcome.headers.get('set-cookie').split(';')[0];
    assert.equal((await app.action(guest,{action:'runScenario'},{Origin:origin})).status,401);
    for(const path of ['/api/broker/status','/api/paper/account','/broker.html','/api/mobile/state']) {
      assert.equal((await fetch(app.base+path)).status,404);
    }
    const authArgs = {method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:guest},
      body:JSON.stringify({email:'hosted-test@example.test',password:'long-test-fixture-password',language:'en-US'})};
    assert.equal((await fetch(app.base+'/api/auth/register',{...authArgs,headers:{...authArgs.headers,Origin:'https://other.example'}})).status,403);
    const registered=await fetch(app.base+'/api/auth/register',authArgs);
    assert.equal(registered.status,200);
    const cookie=registered.headers.get('set-cookie').split(';')[0];
    assert.notEqual(cookie,guest);
    const current=await (await fetch(app.base+'/api/auth/session',{headers:{Cookie:cookie}})).json();
    assert.equal(current.user.email,'hosted-test@example.test');
    assert.equal((await app.action(cookie,{action:'createFund',name:'Hosted QA fund',templateId:'growth'},{Origin:origin})).status,200);
    const stranger=await app.state();
    assert.ok(!stranger.body.funds.some(f=>f.name==='Hosted QA fund'));
  } finally { await app.close(); }
});
test('an overdue enabled schedule resumes one synthetic review after restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fundroom-schedule-'));
  const filename = join(directory, 'fundroom.sqlite');
  const env = { FUNDROOM_DB_PATH: filename };
  let app = await start(env);
  try {
    const { cookie, body: { fund } } = await app.state();
    const sessionId = cookie.split('=')[1];
    assert.equal((await app.action(cookie, { action: 'setSchedule', fundId: fund.id, enabled: true, frequency: 'hourly' })).status, 200);
    await app.close();

    const store = openStore(filename);
    const account = store.read(sessionId);
    account.data.funds[0].schedule.nextRunAt = new Date(Date.now() - 60_000).toISOString();
    store.save(sessionId, account.revision, account.data);
    store.close();
    app = await start(env);
    let restored;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      restored = (await app.state(cookie)).body.fund;
      if (restored.schedule.lastRunAt) break;
      await wait(10);
    }
    assert.equal(restored.runs.length, 1);
    assert.equal(restored.runs[0].origin, 'schedule');
    assert.equal(restored.runs[0].provider, 'replay');
    assert.ok(Date.parse(restored.schedule.nextRunAt) > Date.now());
    await app.close();
    app = await start(env);
    assert.equal((await app.state(cookie)).body.fund.runs.length, 1);
  } finally {
    await app.close();
    for (const file of readdirSync(directory)) unlinkSync(join(directory, file));
    rmdirSync(directory);
  }
});

test('the server routes Alpaca GETs to separate data and paper connections', async () => {
  const actual = [];
  const app = await start({
    ALPACA_DATA_KEY_ID: 'data-key', ALPACA_DATA_SECRET_KEY: 'data-secret',
    ALPACA_PAPER_KEY_ID: 'paper-key', ALPACA_PAPER_SECRET_KEY: 'paper-secret',
    FUNDROOM_BROKER_OPERATOR_TOKEN: 'fixture-operator-token-for-paper-snapshot',
  }, async (endpoint, options) => {
    const url = new URL(endpoint);
    const headers = new Headers(options.headers);
    actual.push([url.hostname, options.method, headers.get('APCA-API-KEY-ID')]);
    if (url.hostname === 'data.alpaca.markets') {
      return Response.json({ NVDA: { latestQuote: { bp: 129.9, ap: 130.1, t: new Date().toISOString() } } });
    }
    return Response.json({ status: 'ACTIVE', currency: 'USD', trading_blocked: false, account_number: 'private-number' });
  });
  try {
    const { body } = await app.state();
    assert.equal(body.connections.market.enabled, true);
    const market = await fetch(`${app.base}/api/market/snapshot?symbol=NVDA`);
    assert.equal(market.status, 200);
    assert.equal((await market.json()).ask, 130.1);
    assert.equal((await fetch(`${app.base}/api/paper/account`)).status, 403);
    const paper = await fetch(`${app.base}/api/paper/account`, {headers:{'X-Fundroom-Broker-Token':'fixture-operator-token-for-paper-snapshot'}});
    assert.equal(paper.status, 200);
    const redacted = await paper.json();
    assert.equal(redacted.status, 'ACTIVE');
    assert.equal(JSON.stringify(redacted).includes('private-number'), false);
    assert.deepEqual(actual, [['data.alpaca.markets', 'GET', 'data-key'], ['paper-api.alpaca.markets', 'GET', 'paper-key']]);
    assert.equal((await fetch(`${app.base}/api/paper/account`, { method: 'POST' })).status, 404);
  } finally {
    await app.close();
  }
});
