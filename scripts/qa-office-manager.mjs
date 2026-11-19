import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.mjs';

const scratch = await mkdtemp(join(tmpdir(), 'fund-edition-office-manager-'));
const evidence = process.argv[2] ? resolve(process.argv[2]) : scratch;
await mkdir(evidence, {recursive:true});
const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(resolve(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const database = join(scratch, 'workspace.sqlite');
const calls = [];
const application = await createApp({
  env:{
    FUNDROOM_DB_PATH:database, FUNDROOM_BROKER_DB_PATH:':memory:', FUNDROOM_ENABLE_LOCAL_VOICE:'false',
    FUNDROOM_WATCH_ENABLED:'false', FUNDROOM_ENABLE_HARNESS:'true',
    HARNESSROUTER_API_KEY:'local-office-manager-fixture', HARNESSROUTER_HARNESS_ID:'chrn_fixture',
  },
  fetchImpl:async (_url, options) => {
    const input = JSON.parse(JSON.parse(options.body).input);
    assert.equal(input.mode, 'team-advice', 'Unexpected model call');
    calls.push(input);
    const answer = input.language === 'zh-CN' ? input.teammate.name + ' 已核对这只基金的模拟账户。' : input.teammate.name + ' reviewed this fund’s paper account.';
    return Response.json({id:'resp_local_' + calls.length, status:'completed', model:'fixture',
      output:[{type:'message', role:'assistant', content:[{type:'output_text', text:JSON.stringify({answer})}]}]});
  },
});
application.server.listen(0, '127.0.0.1');
await once(application.server, 'listening');
const origin = 'http://127.0.0.1:' + application.server.address().port;
let browser;
const report = {at:new Date().toISOString(), runtime:'Local browser and application, real SQLite. Only the HarnessRouter network boundary uses a response fixture.', cases:[]};

async function saveViewport(page, filename, expectedWidth, expectedHeight) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'Horizontal overflow');
  const bytes = await page.screenshot({path:join(evidence, filename), animations:'disabled'});
  assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), expectedWidth);
  assert.equal(bytes.readUInt32BE(20), expectedHeight);
  assert.ok(bytes.length > 8000, 'Screenshot must contain visible content');
}

function legacyTeam(id, change) {
  // A pre-existing fund can use its own member identifiers and a different seat order.
  const db = new DatabaseSync(database);
  try {
    const row = db.prepare('SELECT session_id, data FROM demo_sessions').all().find(row => JSON.parse(row.data).funds.some(fund => fund.id === id));
    assert.ok(row);
    const state = JSON.parse(row.data), fund = state.funds.find(fund => fund.id === id);
    change(fund.team);
    db.prepare('UPDATE demo_sessions SET data=?,revision=revision+1 WHERE session_id=?').run(JSON.stringify(state), row.session_id);
    return fund;
  } finally { db.close(); }
}

async function runCase(language, width, height, customId) {
  const context = await browser.newContext({locale:language, viewport:{width,height}, isMobile:width < 500, hasTouch:width < 500, serviceWorkers:'block'});
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [], sent = [];
  page.on('pageerror', err => errors.push(err.message));
  const read = () => page.evaluate(async () => (await fetch('/api/state')).json());
  try {
    await page.goto(origin + '/studio?lang=' + language);
    await page.locator('.receiver-opening').waitFor();
    await page.locator('[data-action=prepare-team]').click();
    await page.locator('[data-action=confirm-team]').click();
    const office = page.locator('[data-office-id]');
    await office.waitFor();
    const id = await office.getAttribute('data-office-id');
    let fund = (await read()).funds.find(item => item.id === id);
    const initialManager = fund.team.find(member => member.role === 'manager');
    const chat = page.locator('#studio-chat'), room = page.locator('section[data-office-room][data-fund-id]');
    const recipient = chat.locator('[data-form=chat] [name=memberId]');
    assert.equal(await recipient.inputValue(), initialManager.id, 'Formation should open the manager');
    const colleague = fund.team.find(member => member.role !== 'manager' && member.desk !== 'bench');
    assert.ok(colleague);
    if (customId) fund = legacyTeam(id, team => {
      team.find(seat => seat.role === 'manager').id = 'custom-manager-seat';
      team.reverse();
    });
    const manager = fund.team.find(member => member.role === 'manager');
    await page.evaluate(({id, seat}) => sessionStorage.setItem('fund-edition.desk.' + id, seat), {id, seat:colleague.id});
    await page.reload();
    await chat.waitFor();
    assert.equal(await chat.getAttribute('data-paired-seat'), manager.id);
    assert.equal(await chat.getAttribute('data-seat-role'), 'manager');
    assert.equal(await recipient.inputValue(), manager.id);
    assert.ok((await chat.innerText()).includes(manager.name));
    assert.equal(await room.getAttribute('data-fund-id'), id);
    assert.ok(await room.isVisible());
    assert.equal(await room.locator('xpath=ancestor::details').count(), 0, 'Room is part of the normal office, including before any click');
    const staff = member => room.locator('[data-office-member="' + member.id + '"]');
    const seatName = member => staff(member).locator('[data-action=select-member]');
    const activate = element => width < 500 ? element.tap() : element.click();
    for (const member of fund.team) {
      assert.ok(await staff(member).isVisible());
      assert.ok((await seatName(member).innerText()).includes(member.name.split(' ')[0]), 'Names identify their actual colleagues');
      assert.ok(await staff(member).locator('[data-seat-handle]').isVisible());
    }
    await saveViewport(page, language + '-manager.png', width, height);
    const clearAt = [];
    for (const checkWidth of width === 390 ? [320,390] : [width]) {
      await page.setViewportSize({width:checkWidth,height});
      await room.scrollIntoViewIfNeeded();
      const collisions = await room.evaluate(element => {
        const openLabels = [...element.querySelectorAll('.crew-station.crew-vacant .crew-station-tag')];
        const names = [...element.querySelectorAll('.crew-station .office-seat-name')];
        const result = [];
        for (const label of openLabels) for (const name of names) {
          const a = label.getBoundingClientRect(), b = name.getBoundingClientRect();
          const overlapX = Math.min(a.right,b.right) - Math.max(a.left,b.left);
          const overlapY = Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top);
          if (overlapX > 1 && overlapY > 1) result.push([label.textContent.trim(),name.textContent.trim(),overlapX,overlapY]);
        }
        return result;
      });
      assert.deepEqual(collisions, [], 'An open desk is covering a teammate name at ' + checkWidth);
      clearAt.push(checkWidth);
    }
    await saveViewport(page, language + '-room.png', width, height);

    async function send(trigger, who, expectedText) {
      const response = page.waitForResponse(response => {
        const request = response.request();
        return response.url() === origin + '/api/action' && request.method() === 'POST' && request.postDataJSON()?.action === 'sendChat';
      });
      await trigger();
      const reply = await response;
      assert.equal(reply.status(), 200, (await reply.text()).slice(0,200));
      const request = reply.request().postDataJSON();
      const state = await reply.json(), updated = state.funds.find(fund => fund.id === id);
      assert.equal(request.fundId, id); assert.equal(request.memberId, who.id); assert.equal(request.provider, 'harnessrouter');
      if (expectedText) assert.equal(request.message, expectedText);
      assert.equal(updated.chat.at(-2).text, request.message);
      assert.equal(updated.chat.at(-2).memberId, who.id);
      assert.equal(updated.chat.at(-1).memberId, who.id);
      const input = calls.findLast(call => call.question === request.message && call.language === language);
      assert.ok(input); assert.equal(input.teammate.role, who.role); assert.equal(input.teammate.name, who.name);
      assert.equal(input.mandate, updated.mandate); assert.equal(input.account.cash, updated.portfolio.cashCents / 100);
      assert.deepEqual(input.confirmedRoster.map(seat => seat.name), updated.team.map(seat => seat.name));
      assert.equal(input.latestDecision, null, 'Fresh funds have no prior trading decision');
      await chat.getByText(updated.chat.at(-1).text, {exact:true}).first().waitFor();
      sent.push({fundId:id, recipient:who.id, role:who.role, message:request.message, responseId:updated.chat.at(-1).responseId});
      return request.message;
    }
    async function writeDraft(message) {
      const form = chat.locator('[data-form=chat]');
      const text = form.locator('textarea');
      if (!(await form.isVisible())) await chat.locator('[data-action=open-crew-chat]').click();
      if (!(await text.isVisible())) await form.locator('[data-action=toggle-typing]').click();
      await text.fill(message);
    }
    async function typeTo(message) {
      await writeDraft(message);
      await chat.locator('[data-form=chat] [type=submit]').click();
    }
    const suggestion = await send(() => chat.locator('[data-action=ask-manager-update]').click(), manager);
    const first = language === 'zh-CN' ? '请说明目前的模拟现金。' : 'What cash is available in my paper fund?';
    await send(() => typeTo(first), manager, first);
    assert.ok(calls.at(-1).conversation.some(turn => turn.text === suggestion), 'Manager history reaches the model');
    assert.ok(await room.locator('[data-action=toggle-recruit]').first().isVisible());
    await room.locator('[data-action=toggle-recruit]').first().click();
    await page.locator('#studio-recruit').waitFor();
    await page.locator('#studio-recruit [data-action=toggle-recruit]').click();
    const managerDraft = language === 'zh-CN' ? '经理私下待发的现金问题' : 'Unsent manager cash question';
    const colleagueDraft = language === 'zh-CN' ? '同事私下待发的调查问题' : 'Unsent specialist research question';
    const draftText = chat.locator('[data-form=chat] textarea');
    await writeDraft(managerDraft);
    const composingElement = await draftText.elementHandle();
    const target = colleague.desk === 'risk' ? 'research' : 'risk';
    const handle = staff(colleague).locator('[data-seat-handle]');
    if (width < 500) await handle.tap();
    else await handle.press('Enter');
    const destination = room.locator('[data-seat-destination="' + target + '"]');
    const moveResponse = page.waitForResponse(response =>
      response.url() === origin + '/api/action' && response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'updateMember');
    await activate(destination);
    const moved = await moveResponse;
    assert.equal(moved.status(), 200);
    const move = moved.request().postDataJSON();
    assert.deepEqual([move.fundId,move.memberId,move.desk],[id,colleague.id,target]);
    const saved = await moved.json();
    assert.equal(saved.funds.find(f => f.id === id).team.find(m => m.id === colleague.id).desk, target);
    await room.locator('[data-current-desk="' + target + '"][data-office-member="' + colleague.id + '"]').waitFor();
    assert.equal(await recipient.inputValue(), manager.id, 'Moving someone does not open their conversation');
    assert.equal(await draftText.inputValue(), managerDraft, 'The current unsent message survives a move');
    assert.ok(await composingElement.evaluate(el => el.isConnected), 'The manager composer survives the room update');
    await composingElement.dispose();
    await activate(seatName(colleague));
    await page.waitForFunction(seat => document.querySelector('#studio-chat')?.dataset.pairedSeat === seat, colleague.id);
    assert.equal(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('member'), colleague.id);
    assert.equal(await recipient.inputValue(), colleague.id);
    assert.equal(await draftText.inputValue(), '', 'A colleague must not receive the manager draft');
    await writeDraft(colleagueDraft);
    await activate(seatName(manager));
    assert.equal(await recipient.inputValue(), manager.id);
    assert.equal(await draftText.inputValue(), managerDraft);
    await activate(seatName(colleague));
    assert.equal(await recipient.inputValue(), colleague.id);
    assert.equal(await draftText.inputValue(), colleagueDraft);
    const second = language === 'zh-CN' ? '你会核查哪些公开资料？' : 'Which public sources would you review?';
    await send(() => typeTo(second), colleague, second);
    assert.equal(calls.at(-1).teammate.desk, target, 'The conversation model sees the new desk');
    assert.equal(calls.at(-1).teammate.role, colleague.role, 'The saved member role remains distinct from the workstation');
    assert.ok(calls.at(-1).conversation.every(turn => turn.text !== first), 'Manager conversation cannot leak into the specialist context');
    await page.reload(); await chat.waitFor();
    assert.equal(await recipient.inputValue(), colleague.id, 'Explicit desk survives an address refresh');
    await chat.getByText(second, {exact:true}).waitFor();
    await page.locator('[data-action=return-manager]').click();
    await chat.getByText(first, {exact:true}).waitFor();
    assert.equal(await chat.getByText(second, {exact:true}).count(), 0);
    assert.equal(await recipient.inputValue(), manager.id);
    assert.equal(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('member'), null);
    if (language === 'zh-CN') {
      legacyTeam(id, team => {
        team.find(seat => seat.id === manager.id).desk = 'bench';
        team.find(seat => seat.id === colleague.id).desk = 'bench';
      });
      await page.reload();
      await chat.waitFor();
      assert.equal(await recipient.inputValue(), manager.id, 'A legacy benched manager remains the fund contact');
      const prompt = '现在基金还有多少模拟现金？';
      await send(() => typeTo(prompt), manager, prompt);
      assert.equal(calls.at(-1).teammate.desk, 'bench');
      await send(() => chat.locator('[data-action=ask-manager-update]').click(), manager);
      assert.equal(calls.at(-1).teammate.desk, 'bench', 'Overview suggestion reaches the historical manager too');
      await activate(seatName(colleague));
      await page.waitForFunction(id => document.querySelector('#studio-chat')?.dataset.pairedSeat === id, colleague.id);
      assert.equal(await chat.locator('[data-form=chat]').count(), 0, 'A benched specialist still requires assignment');
      await chat.locator('[data-action=return-manager]').click();
      await chat.getByText(prompt,{exact:true}).waitFor();
    }
    assert.deepEqual(errors, []);
    report.cases.push({language,width,height,fundId:id,managerId:manager.id,selectedSpecialist:colleague.id,legacySelectionIgnored:true,
      permanentRoom:true,unobstructedRoomLabelsAt:clearAt,movedDesk:target,unsubmittedDraftsIsolated:true,explicitChoiceRestored:true,individualThreadsVerified:true,roomsAndRecruitmentReachable:true,legacyBenchedManager:language === 'zh-CN',requests:sent,errors});
  } finally { await context.close(); }
}
try {
  browser = await chromium.launch({channel:'msedge', headless:true});
  await runCase('en-US',1440,900,true);
  await runCase('zh-CN',390,844,false);
  report.passed = true;
} catch (error) {
  report.passed = false; report.error = error.message; throw error;
} finally {
  await writeFile(join(evidence,'office-manager-qa.json'), JSON.stringify(report,null,2));
  console.log('Office manager evidence: ' + evidence);
  await browser?.close();
  await new Promise(done=>application.server.close(done));
}
