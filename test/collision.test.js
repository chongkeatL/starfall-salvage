import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circlesOverlap, findCollisions, clampToWorld } from '../src/collision.js';

test('circlesOverlap: overlapping circles', () => {
  assert.equal(circlesOverlap({ x: 0, y: 0, r: 3 }, { x: 4, y: 0, r: 3 }), true);
});

test('circlesOverlap: touching edge counts as overlap', () => {
  // 3-4-5 triangle: distance 5 equals r 2 + r 3
  assert.equal(circlesOverlap({ x: 0, y: 0, r: 2 }, { x: 3, y: 4, r: 3 }), true);
});

test('circlesOverlap: separated circles', () => {
  assert.equal(circlesOverlap({ x: 0, y: 0, r: 2 }, { x: 10, y: 0, r: 2 }), false);
});

test('findCollisions returns only overlapping pairs', () => {
  const a1 = { x: 0, y: 0, r: 2 };
  const a2 = { x: 100, y: 100, r: 2 };
  const b1 = { x: 1, y: 0, r: 2 };
  const b2 = { x: 500, y: 500, r: 2 };
  const pairs = findCollisions([a1, a2], [b1, b2]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0][0], a1);
  assert.equal(pairs[0][1], b1);
});

test('findCollisions returns nothing for disjoint lists', () => {
  assert.deepEqual(findCollisions([{ x: 0, y: 0, r: 1 }], [{ x: 50, y: 50, r: 1 }]), []);
  assert.deepEqual(findCollisions([], [{ x: 0, y: 0, r: 1 }]), []);
});

test('clampToWorld clamps to every edge', () => {
  const world = { w: 100, h: 50 };
  const e = { x: -5, y: -5 };
  clampToWorld(e, world);
  assert.deepEqual(e, { x: 0, y: 0 });
  e.x = 500;
  e.y = 500;
  clampToWorld(e, world);
  assert.deepEqual(e, { x: 100, y: 50 });
});

test('clampToWorld respects margin', () => {
  const world = { w: 100, h: 50 };
  const e = { x: 0, y: 100 };
  clampToWorld(e, world, 10);
  assert.deepEqual(e, { x: 10, y: 40 });
});
