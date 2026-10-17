import type { World } from './world';

export interface Pressure {
  nearest: number; // distance of the closest living zombie to the wall (Infinity if none)
  closeCount: number; // zombies within pressureRedCountRange of the wall
  level: number; // 0..1, rises as the nearest zombie approaches
  urgent: boolean;
}

/** Row pressure for the single M1 lane. Read-only; the renderer turns it into a red glow and an arrow. */
export function computePressure(w: World): Pressure {
  const f = w.data.config.feel;
  const wallX = w.data.config.world.wallX;
  let nearest = Infinity;
  let closeCount = 0;
  for (const e of w.entities) {
    if (e.dead || e.team !== 'zombie') continue;
    const d = Math.max(0, e.x - wallX);
    if (d < nearest) nearest = d;
    if (d <= f.pressureRedCountRange) closeCount++;
  }
  const level = Number.isFinite(nearest) ? Math.min(1, Math.max(0, 1 - nearest / f.pressureRange)) : 0;
  const urgent = nearest <= f.pressureRedNearest || closeCount >= f.pressureRedCount;
  return { nearest, closeCount, level, urgent };
}
