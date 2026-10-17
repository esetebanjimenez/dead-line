import type { World } from './world';
import { chargeSystem } from './systems/charges';
import { waveSystem } from './systems/waves';
import { combatSystem } from './systems/combat';

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;

/** Advance the simulation by one fixed tick. Deterministic: no randomness, no rendering. */
export function step(w: World, dt: number = TICK_DT): void {
  if (w.status !== 'playing') return;
  w.time += dt;
  w.tick++;
  for (const e of w.entities) e.prevX = e.x;
  w.surgeTimer = Math.max(0, w.surgeTimer - dt);
  chargeSystem(w, dt);
  waveSystem(w, dt);
  combatSystem(w, dt);
  for (const e of w.entities) if (e.dead) e.fade -= dt;
  w.entities = w.entities.filter((e) => !e.dead || e.fade > 0);
  if (w.baseHp <= 0) w.status = 'lost';
}
