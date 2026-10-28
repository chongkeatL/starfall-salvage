// Seeded mulberry32. All state lives in rng.s so a run can be replayed from a seed.

export function makeRngState(seed) {
  return { s: seed >>> 0 };
}

export function nextFloat(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Inclusive on both ends.
export function nextInt(rng, min, max) {
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

export function pick(rng, arr) {
  return arr[nextInt(rng, 0, arr.length - 1)];
}
