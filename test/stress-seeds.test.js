import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStress } from '../scripts/stress-test.js';

// Edge values plus a spread; each runs under every invariant in the stress harness.
const EDGE_SEEDS = [0, 1, 2, 3, 7, 42, 99, 1000, 65535, 65536, 2147483647, 2147483648, 3735928559, 4294967294, 4294967295];
const SPREAD_SEEDS = Array.from({ length: 25 }, (_, i) => (i + 1) * 7919);
const TICKS = 3000;

for (const seed of [...EDGE_SEEDS, ...SPREAD_SEEDS]) {
  test(`stress seed ${seed} holds every invariant for ${TICKS} ticks`, () => {
    const result = runStress({ seed, ticks: TICKS });
    assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.violation));
  });
}

test('extra seeds are reproducible', () => {
  for (const seed of [0, 4294967295, 7919]) {
    assert.equal(runStress({ seed, ticks: 1500 }).hash, runStress({ seed, ticks: 1500 }).hash);
  }
});
