import assert from 'node:assert/strict';
import test from 'node:test';
import { setLanguage } from '../web/i18n.mjs';
import { meetingMarkup } from '../web/team-meeting.mjs';
import { TEAM_TEMPLATES } from '../web/team-templates.mjs';
import { CANDIDATES } from '../web/team.mjs';
import { teamSystemText } from '../web/team-copy.mjs';

test('meeting localizes authored roles, stance and execution while retaining model and user words', () => {
  const output = 'Original analyst opinion about cash.';
  const custom = 'My custom duty: wait.';
  const stamped = '2026-11-18T08:00:00Z';
  const engineReason = 'The manager chose to hold the portfolio.';
  const duty = CANDIDATES.find(x => x.id === 'inez-rao').duty;
  const events = [
    {seq:1, actor:'Inez Rao', stage:'started', text:duty},
    {seq:2, actor:'Inez Rao', stage:'completed', text:output, responseId:'receipt-a'},
    {seq:3, actor:'engine', stage:'completed', text:engineReason},
  ].map(e => ({...e, at:stamped}));
  const activity = {events, status:'complete', kind:'runScenario'};
  const context = {run:{execution:{reason:engineReason, code:'manager-hold'},reviews:[{name:'Inez Rao',sentiment:'caution'}]}};
  try {
    setLanguage('zh-CN');
    for (const {duty} of [...CANDIDATES, ...TEAM_TEMPLATES.flatMap(x => x.roster)]) assert.match(teamSystemText(duty), /[\u4e00-\u9fff]/u);
    assert.equal(teamSystemText(custom), custom);
    const html = meetingMarkup(activity, context, 2);
    assert.match(html, /谨慎/);
    assert.match(html, /经理决定持有，本轮不下单/);
    assert.ok(html.includes(output) && html.includes('receipt-a'));
    assert.ok(!html.includes(engineReason) && !html.includes(duty));
    setLanguage('en-US');
    assert.ok(meetingMarkup(activity, context, 2).includes(engineReason));
    assert.equal(teamSystemText(duty), duty);
  } finally { setLanguage('zh-CN'); }
});
