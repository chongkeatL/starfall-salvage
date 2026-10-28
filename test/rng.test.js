import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRngState, nextFloat, nextInt, pick } from '../src/rng.js';

function sequence(seed, n) {
  const rng = makeRngState(seed);
  return Array.from({ length: n }, () => nextFloat(rng));
}

test('same seed gives the same sequence', () => {
  assert.deepEqual(sequence(12345, 100), sequence(12345, 100));
});

test('different seeds give different sequences', () => {
  assert.notDeepEqual(sequence(1, 20), sequence(2, 20));
});

test('nextFloat stays in [0, 1)', () => {
  for (const v of sequence(7, 1000)) {
    assert.ok(v >= 0 && v < 1);
  }
});

test('nextInt is inclusive on both ends and stays in range', () => {
  const rng = makeRngState(99);
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const v = nextInt(rng, 1, 3);
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 3);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test('pick returns an element of the array', () => {
  const rng = makeRngState(5);
  const items = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i++) {
    assert.ok(items.includes(pick(rng, items)));
  }
});

test('state lives in rng.s and advances', () => {
  const rng = makeRngState(42);
  const before = rng.s;
  nextFloat(rng);
  assert.notEqual(rng.s, before);
});
