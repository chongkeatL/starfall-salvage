// Circle helpers. Entities are anything with x, y and r.

// Touching edges count as overlap.
export function circlesOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const reach = a.r + b.r;
  return dx * dx + dy * dy <= reach * reach;
}

export function findCollisions(listA, listB) {
  const pairs = [];
  for (const a of listA) {
    for (const b of listB) {
      if (circlesOverlap(a, b)) pairs.push([a, b]);
    }
  }
  return pairs;
}

export function clampToWorld(entity, world, margin = 0) {
  entity.x = Math.min(Math.max(entity.x, margin), world.w - margin);
  entity.y = Math.min(Math.max(entity.y, margin), world.h - margin);
}
