import type { GameData } from './types';

/** Throws with a readable list of problems. Run at build time and on startup. */
export function validateData(d: GameData): void {
  const errs: string[] = [];
  const ids = new Set<string>();
  const num = (v: unknown, name: string, min = 0) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min) errs.push(`${name} must be a number >= ${min}`);
  };
  for (const u of d.units) {
    if (ids.has(u.id)) errs.push(`duplicate unit id ${u.id}`);
    ids.add(u.id);
    for (const k of ['hp', 'dps', 'range', 'attackInterval', 'windup', 'speed', 'knockback'] as const) num(u[k], `${u.id}.${k}`);
    if (u.hp <= 0) errs.push(`${u.id}.hp must be > 0`);
    if (u.attackInterval <= 0) errs.push(`${u.id}.attackInterval must be > 0`);
    if (u.team === 'player') {
      num(u.maxCharges, `${u.id}.maxCharges`, 1);
      num(u.chargeRefill, `${u.id}.chargeRefill`, 0.1);
      num(u.holdOffset, `${u.id}.holdOffset`, -200); // negative = frontline, in front of the wall
      num(u.deployCooldown, `${u.id}.deployCooldown`);
    }
  }
  if (d.waves.length === 0) errs.push('at least one wave required');
  d.waves.forEach((w, i) => {
    for (const g of w.groups) {
      const u = d.units.find((x) => x.id === g.kind);
      if (!u) errs.push(`wave ${i + 1}: unknown unit ${g.kind}`);
      else if (u.team !== 'zombie') errs.push(`wave ${i + 1}: ${g.kind} is not a zombie`);
      num(g.count, `wave ${i + 1} count`, 1);
      num(g.interval, `wave ${i + 1} interval`);
      num(g.delay, `wave ${i + 1} delay`);
    }
  });
  const c = d.config.world;
  num(c.maxUnitsAlive, 'maxUnitsAlive', 1);
  num(c.globalDeployCooldown, 'globalDeployCooldown');
  if (c.entityCap < 1) errs.push('entityCap must be >= 1');
  if (c.wallX <= c.baseX) errs.push('wallX must be right of baseX');
  if (errs.length) throw new Error('Invalid game data:\n - ' + errs.join('\n - '));
}
