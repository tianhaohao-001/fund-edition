import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candleAt } from '../web/market-atmosphere.mjs';

test('the decorative tape opens at the previous close and only records reached trades', () => {
  for (const seed of [12, 31, 53, 87]) {
    for (let index = -19; index < 49; index++) {
      let previous = candleAt(index, 0, seed);
      assert.equal(previous.open, candleAt(index - 1, 1, seed).close);
      assert.equal(previous.open, previous.high);
      assert.equal(previous.open, previous.low);
      assert.equal(previous.open, previous.close);
      for (let tick = 1; tick <= 35; tick++) {
        const bar = candleAt(index, tick / 35, seed);
        assert.equal(bar.open, previous.open);
        assert.ok(bar.low <= Math.min(bar.open, bar.close));
        assert.ok(bar.high >= Math.max(bar.open, bar.close));
        assert.ok(bar.high >= previous.high);
        assert.ok(bar.low <= previous.low);
        previous = bar;
      }
      assert.deepEqual(candleAt(index, 2, seed), previous);
    }
  }
});

test('each deterministic lane has losing bars and an upward long-term path', () => {
  for (const seed of [46, 73, 38, 87, 12, 31, 53]) {
    const bars = Array.from({length: 125}, (_, index) => candleAt(index, 1, seed));
    assert.ok(bars.filter(bar => bar.close < bar.open).length > 25);
    assert.ok(bars.at(-1).close - bars[0].open > 65);
    assert.deepEqual(candleAt(34, 1, seed), bars[34]);
  }
});
