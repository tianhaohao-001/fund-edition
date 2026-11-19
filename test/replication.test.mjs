import assert from 'node:assert/strict';
import test from 'node:test';
import { ARK_DISCLOSURES, SYNTHETIC_DISCLOSURES } from '../web/replication-cases.mjs';
import { analyzeDisclosures, DISCLOSURE_SCHEMA } from '../web/replication-model.mjs';

test('replication fixes model inputs at the public timestamp and scores only a later reporting period', () => {
  const time = '2026-08-20T16:00:00Z';
  const result = analyzeDisclosures(SYNTHETIC_DISCLOSURES, time);
  assert.deepEqual(result.training.map(({ source }) => source), ['Fundroom synthetic disclosure A', 'Fundroom synthetic disclosure B']);
  assert.equal(result.holdout.source, 'Fundroom synthetic disclosure C');
  assert.equal(result.rows.find(({ symbol }) => symbol === 'NVDA').modelWeight, 23.5);
  assert.equal(result.rows.find(({ symbol }) => symbol === 'AMD').modelWeight, null);
  assert.equal(result.comparison.holdoutOnly, 1);
  const edited = structuredClone(SYNTHETIC_DISCLOSURES);
  edited.snapshots[2].holdings[0].weight = 0;
  edited.snapshots[3].holdings[0].weight = 0;
  const afterEdit = analyzeDisclosures(edited, time);
  const modelWeights = ({ rows }) => new Map(rows.map(({ symbol, modelWeight }) => [symbol, modelWeight]));
  assert.deepEqual(modelWeights(result), modelWeights(afterEdit));
  assert.notEqual(result.comparison.bucketedDistance, afterEdit.comparison.bucketedDistance);
});

test('an exact public-at cutoff uses the amendment once it is public and selects the earliest eligible holdout', () => {
  const data = {
    schemaVersion: DISCLOSURE_SCHEMA,
    fundName: 'Test',
    snapshots: [
      { source: 'first filing', reportDate: '2026-01-31', publicAt: '2026-02-10T16:00:00Z', holdings: [{ symbol: 'X', weight: 10 }] },
      { source: 'correction', reportDate: '2026-01-31', publicAt: '2026-02-20T12:30:00-05:00', holdings: [{ symbol: 'X', weight: 35 }] },
      { source: 'next reporting period', reportDate: '2026-02-28', publicAt: '2026-03-15T12:30:00Z', holdings: [{ symbol: 'X', weight: 30 }] },
      { source: 'later amendment', reportDate: '2026-02-28', publicAt: '2026-03-19T12:30:00Z', holdings: [{ symbol: 'X', weight: 21 }] },
    ].reverse(),
  };
  const before = analyzeDisclosures(data, '2026-02-20T17:29:59.999Z');
  assert.equal(before.rows[0].modelWeight, 10);
  assert.equal(before.holdout.source, 'next reporting period');
  const exact = analyzeDisclosures(data, '2026-02-20T17:30:00Z');
  assert.equal(exact.rows[0].modelWeight, 35);
  assert.equal(exact.rows[0].disclosedWeight, 30);
  assert.equal(exact.comparison.bucketedDistance, 5);
  const after = analyzeDisclosures(data, '2026-04-02T12:00:00Z');
  assert.equal(after.training.length, 2);
  assert.equal(after.holdout, null);
  assert.equal(after.rows[0].modelWeight, 28);
  assert.equal(after.comparison, null);
});

test('future filings and malformed imports fail closed before producing a target', () => {
  const result = analyzeDisclosures(SYNTHETIC_DISCLOSURES, '2026-07-13T14:59:59Z');
  assert.deepEqual(result.training, []);
  assert.equal(result.holdout, null);
  const duplicate = structuredClone(SYNTHETIC_DISCLOSURES);
  duplicate.snapshots[0].holdings.push({ symbol: 'nvda', weight: 1 });
  assert.throws(() => analyzeDisclosures(duplicate, '2026-08-20T16:00:00Z'), /invalid or duplicate holding/);
  const impossibleDate = structuredClone(SYNTHETIC_DISCLOSURES);
  impossibleDate.snapshots[0].publicAt = '2026-02-31T12:00:00Z';
  assert.throws(() => analyzeDisclosures(impossibleDate, '2026-08-20T16:00:00Z'), /publicAt must be/);
  const leveraged = structuredClone(SYNTHETIC_DISCLOSURES);
  leveraged.snapshots[0].holdings[0].weight = 99;
  assert.throws(() => analyzeDisclosures(leveraged, '2026-08-20T16:00:00Z'), /at most 100%/);
});

test('the SEC case keeps the original net-asset denominator for five partial holdings', () => {
  const result = analyzeDisclosures(ARK_DISCLOSURES, '2025-07-15T16:00:00Z');
  assert.equal(result.training.length, 2);
  assert.equal(result.holdout.reportDate, '2025-07-31');
  assert.equal(result.holdout.publicAt, '2025-09-24T12:00:00.000Z');
  assert.equal(result.holdout.holdings.get('TSLA'), 9.813995);
  assert.equal(result.modelCovered.toFixed(2), '43.12');
  assert.equal(result.holdout.covered.toFixed(2), '35.64');
  assert.equal(result.comparison.bucketedDistance.toFixed(2), '7.58');
});
