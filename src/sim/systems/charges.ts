import type { World } from '../world';

export function chargeSystem(w: World, dt: number): void {
  for (const u of w.data.units) {
    if (u.team !== 'player' || u.cost !== undefined) continue;
    const c = w.charges[u.id];
    if (c.count >= u.maxCharges!) {
      c.timer = 0;
      continue;
    }
    c.timer += dt;
    if (c.timer >= u.chargeRefill!) {
      c.count++;
      c.timer = 0;
    }
  }
}
