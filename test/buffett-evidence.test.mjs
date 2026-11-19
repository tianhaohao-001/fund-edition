import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sourceText = readFileSync(new URL('../data/buffett-study/history.json', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const history = JSON.parse(sourceText);
const digest = '93fdd69f20e8dbe73e282cbf296b18d6d7f81cc4541c4818528f4c211a8283d8';
const observedDates = ['2016-12-30', '2017-03-31', '2017-06-30', '2017-09-29'];
const fillDates = ['2017-01-03', '2017-04-03', '2017-07-03', '2017-10-02'];

test('frozen history has the registered scope, calendar and next-session raw opening prices', () => {
  assert.equal(createHash('sha256').update(sourceText).digest('hex'), digest);
  assert.equal(history.security.ticker, 'AZO');
  assert.deepEqual(history.snapshots.map(s => s.closeAt.slice(0, 10)), observedDates);
  assert.equal(history.bars.length, 251);
  assert.equal(new Set(history.bars.map(b => b.date)).size, 251);
  assert.deepEqual(history.bars.map(b => b.date), history.bars.map(b => b.date).sort());
  assert.equal(history.bars.at(-1).close, 711.37);
  const holidays = new Set(['2017-01-02', '2017-01-16', '2017-02-20', '2017-04-14', '2017-05-29', '2017-07-04', '2017-09-04', '2017-11-23', '2017-12-25']);
  const observed = new Set(history.bars.map(b => b.date));
  const missing = [];
  for (let day = new Date('2017-01-01T00:00Z'); day.getUTCFullYear() === 2017; day.setUTCDate(day.getUTCDate() + 1)) {
    const session = day.toISOString().slice(0, 10);
    if (day.getUTCDay() % 6 !== 0 && !holidays.has(session) && !observed.has(session)) missing.push(session);
  }
  assert.deepEqual(missing, ['2017-11-08']);
  assert.deepEqual(history.design.missingMarketDates, missing);
  const nextBars = history.snapshots.map(s => history.bars.find(b => Date.parse(b.openAt) > Date.parse(s.asOf)));
  assert.deepEqual(nextBars.map(b => b.date), fillDates);
  assert.deepEqual(nextBars.map(b => b.open), [795.58, 720.50, 570.85, 595.65]);
  assert.equal(nextBars[2].closeAt, '2017-07-03T17:00:00Z');
  assert.equal(history.bars.find(b => b.date === '2017-11-24').closeAt, '2017-11-24T18:00:00Z');
});

test('every filing component and observation precedes the decision, and known accrual dates are preserved', () => {
  const sources = new Map(history.sources.map(s => [s.id, s]));
  for (const snapshot of history.snapshots) {
    const cutoff = Date.parse(snapshot.asOf);
    assert.ok(Date.parse(snapshot.closeAt) < Date.parse(snapshot.closeAvailableAt));
    assert.equal(cutoff - Date.parse(snapshot.closeAvailableAt), 45 * 60_000);
    const closes = history.bars.filter(b => Date.parse(b.availableAt) <= cutoff);
    assert.equal(closes.at(-1).close, snapshot.close);
    for (const evidence of snapshot.evidence) {
      const components = evidence.sourceIds.map(id => Date.parse(sources.get(id).availableAt));
      assert.ok(components.every(time => time <= cutoff));
      assert.equal(Math.max(...components), Date.parse(evidence.availableAt));
      assert.ok(Date.parse(evidence.periodEnd) < Date.parse(evidence.availableAt));
      assert.ok(Date.parse(evidence.periodStart) <= Date.parse(evidence.periodEnd));
    }
  }
  assert.equal(sources.get('fy17-release').availableAt, '2017-09-19T11:00:21.000Z');
  assert.ok(history.sources.filter(s => s.form === '10-K').every(s => s.periodEnd === '2016-08-27'));
});

test('original cash flow classification, quarterly length, and separate lagged-cash-flow availability', () => {
  const get = (s, label) => s.evidence.find(e => e.label.includes(label));
  const quarters = history.snapshots.slice(0, 3);
  assert.deepEqual(quarters.map(s => get(s, 'cash from continuing').value), [1700.557, 1642.541, 1555.061]);
  assert.deepEqual(quarters.map(s => get(s, 'free cash flow proxy').value), [1200.507, 1124.238, 1008.258]);
  for (const [i, s] of quarters.entries()) {
    const fcf = get(s, 'free cash flow proxy');
    const growth = get(s, 'Sales growth');
    assert.equal((Date.parse(growth.periodEnd) - Date.parse(growth.periodStart)) / 86_400_000 + 1, (i + 1) * 84);
    assert.equal(+(get(s, 'cash from continuing').value - get(s, 'capital spending').value).toFixed(3), fcf.value);
    assert.deepEqual(fcf.sourceIds, ['fy16', 'q' + (i + 1)]);
    assert.match(fcf.formula, /63.731m/);
  }
  const last = history.snapshots.at(-1);
  assert.equal(get(last, 'GAAP diluted earnings').value, 44.07);
  const lag = get(last, 'free cash flow proxy');
  assert.deepEqual([lag.periodEnd, lag.availableAt, lag.value], ['2017-05-06', '2017-06-14T20:33:53.000Z', 1008.258]);
});
