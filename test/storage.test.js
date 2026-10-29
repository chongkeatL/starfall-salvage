import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBest, saveBest } from '../src/storage.js';

const KEY = 'starfallSalvage.best.v1';

function fakeStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

const boom = () => {
  throw new Error('storage blocked');
};
const unreadable = () => ({ getItem: boom, setItem: (k, v) => v });
const unwritable = (initial) => ({ ...fakeStore(initial), setItem: boom });
const blocked = () => ({ getItem: boom, setItem: boom });

// memoryBest is module state with no reset export, and a successful read overwrites it.
// Loading an empty fake store puts it back to 0. Tests in this file run one at a time.
function resetMemory() {
  assert.equal(loadBest(fakeStore()), 0);
}

test('empty store loads as 0', () => {
  assert.equal(loadBest(fakeStore()), 0);
});

test('a saved best loads back and uses the versioned key', () => {
  resetMemory();
  const store = fakeStore();
  saveBest(500, store);
  assert.equal(store.map.get(KEY), '500');
  assert.equal(loadBest(store), 500);
});

test('a lower or equal score never overwrites the best', () => {
  resetMemory();
  const store = fakeStore({ [KEY]: '500' });
  saveBest(499, store);
  saveBest(500, store);
  assert.equal(store.map.get(KEY), '500');
  saveBest(501, store);
  assert.equal(store.map.get(KEY), '501');
});

const GARBAGE = ['abc', 'NaN', 'Infinity', '-Infinity', '-5', '-0.5', 'true', '{}', '1e999', null, undefined];

for (const raw of GARBAGE) {
  test(`garbage in the store loads as 0: ${String(raw)}`, () => {
    resetMemory();
    const store = { getItem: () => raw, setItem: () => {} };
    assert.equal(loadBest(store), 0);
  });
}

const BAD_SCORES = [-1, -0.001, NaN, Infinity, -Infinity, '500', null, undefined, {}];

for (const score of BAD_SCORES) {
  test(`saveBest ignores a bad score: ${String(score)}`, () => {
    resetMemory();
    const store = fakeStore({ [KEY]: '40' });
    assert.equal(saveBest(score, store), false);
    assert.equal(store.map.get(KEY), '40');
    assert.equal(loadBest(store), 40);
  });
}

test('a bad score does not poison memory either', () => {
  resetMemory();
  saveBest(NaN, blocked());
  saveBest(Infinity, blocked());
  assert.equal(loadBest(blocked()), 0);
});

test('a throwing getItem with a working setItem does not throw and memory still works', () => {
  resetMemory();
  const store = unreadable();
  assert.doesNotThrow(() => loadBest(store));
  assert.doesNotThrow(() => saveBest(300, store));
  assert.equal(loadBest(store), 300);
  assert.doesNotThrow(() => saveBest(100, store));
  assert.equal(loadBest(store), 300);
});

test('a throwing setItem does not throw and leaves the stored best alone', () => {
  resetMemory();
  const store = unwritable({ [KEY]: '40' });
  assert.doesNotThrow(() => saveBest(900, store));
  assert.equal(store.map.get(KEY), '40');
  assert.equal(loadBest(fakeStore({ [KEY]: '40' })), 40);
});

test('when both getItem and setItem throw, nothing throws, save is false and memory holds the best', () => {
  resetMemory();
  const store = blocked();
  assert.equal(loadBest(store), 0);
  assert.equal(saveBest(250, store), false);
  assert.equal(loadBest(store), 250);
  assert.equal(saveBest(100, store), false);
  assert.equal(loadBest(store), 250);
  assert.equal(saveBest(251, store), false);
  assert.equal(loadBest(store), 251);
});

test('a readable store is the source of truth over memory', () => {
  resetMemory();
  saveBest(700, blocked());
  assert.equal(loadBest(blocked()), 700);
  assert.equal(loadBest(fakeStore({ [KEY]: '20' })), 20);
  assert.equal(loadBest(blocked()), 20);
});

test('a throwing property accessor on the store still does not throw', () => {
  resetMemory();
  const hostile = {
    get getItem() {
      throw new Error('blocked');
    },
    setItem: boom,
  };
  assert.doesNotThrow(() => loadBest(hostile));
  assert.doesNotThrow(() => saveBest(10, hostile));
});
