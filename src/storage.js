// Best-score persistence. Storage can be missing or throw (blocked cookies, private
// windows), so every access is guarded and an in-memory best backs it up.

const KEY = 'starfallSalvage.best.v1';

let memoryBest = 0;

function getStore(storage) {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function parseBest(raw) {
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n >= 0 ? n : 0;
}

function readBest(storage) {
  try {
    const store = getStore(storage);
    if (!store) return { ok: false, value: 0 };
    return { ok: true, value: parseBest(store.getItem(KEY)) };
  } catch {
    return { ok: false, value: 0 };
  }
}

export function loadBest(storage) {
  const read = readBest(storage);
  if (!read.ok) return memoryBest;
  memoryBest = read.value;
  return read.value;
}

export function saveBest(score, storage) {
  if (!Number.isFinite(score) || score < 0) return false;
  const read = readBest(storage);
  const current = read.ok ? read.value : memoryBest;
  if (score <= current) return read.ok;

  memoryBest = Math.max(memoryBest, score);
  try {
    const store = getStore(storage);
    if (!store) return false;
    store.setItem(KEY, String(score));
    return read.ok;
  } catch {
    return false;
  }
}
