import type { Entity, World } from '../world';

type Target = { kind: 'entity'; e: Entity } | { kind: 'wall' } | { kind: 'base' };

function findTarget(w: World, e: Entity): Target | null {
  const cfg = w.data.config.world;
  const r = e.def.range;
  if (e.team === 'player') {
    let best: Entity | null = null;
    for (const o of w.entities) {
      if (o.dead || o.team !== 'zombie') continue;
      if (Math.abs(o.x - e.x) > r) continue;
      if (!best || Math.abs(o.x - e.x) < Math.abs(best.x - e.x)) best = o;
    }
    return best ? { kind: 'entity', e: best } : null;
  }
  // Zombies hit the nearest thing in their path: frontline units (in front of the wall), then the wall, then units behind it, then the base.
  const nearestUnit = (front: boolean): Entity | null => {
    let best: Entity | null = null;
    for (const o of w.entities) {
      if (o.dead || o.team !== 'player' || o.x >= e.x) continue;
      if (o.x > cfg.wallX !== front || e.x - o.x > r) continue;
      if (!best || o.x > best.x) best = o;
    }
    return best;
  };
  const front = nearestUnit(true);
  if (front) return { kind: 'entity', e: front };
  if (w.wallHp > 0) return e.x - cfg.wallX <= r ? { kind: 'wall' } : null;
  const back = nearestUnit(false);
  if (back) return { kind: 'entity', e: back };
  if (e.x - cfg.baseX <= r) return { kind: 'base' };
  return null;
}

function applyHit(w: World, attacker: Entity, t: Target): void {
  const dmg = attacker.def.dps * attacker.def.attackInterval;
  if (t.kind === 'wall') {
    const before = w.wallHp;
    w.wallShake = w.data.config.feel.wallShakeTime;
    w.wallHp = Math.max(0, w.wallHp - dmg);
    if (before > 0 && w.wallHp === 0) w.surgeTimer = w.data.config.feel.surgeDuration;
  } else if (t.kind === 'base') {
    w.baseHp = Math.max(0, w.baseHp - dmg);
  } else {
    const v = t.e;
    v.hp -= dmg;
    v.hitFlash = w.data.config.feel.hitFlash;
    if (v.team === 'zombie' && !v.def.knockbackImmune) v.x = Math.min(w.data.config.world.spawnX, v.x + attacker.def.knockback);
    if (v.hp <= 0) {
      v.dead = true;
      v.fade = w.data.config.feel.deathFade;
      if (v.team === 'zombie') w.scrap += v.def.reward ?? 0;
    }
  }
}

export function combatSystem(w: World, dt: number): void {
  const speedMult = w.surgeTimer > 0 ? w.data.config.feel.surgeSpeedMult : 1;
  for (const e of w.entities) {
    if (e.dead) continue;
    e.cooldown = Math.max(0, e.cooldown - dt);
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    const t = findTarget(w, e);
    if (e.windupLeft >= 0) {
      // Winding up: hold still, land the hit when the windup completes.
      e.windupLeft -= dt;
      if (e.windupLeft <= 0) {
        const t2 = findTarget(w, e);
        if (t2) applyHit(w, e, t2);
        e.windupLeft = -1;
        e.cooldown = e.def.attackInterval;
      }
      continue;
    }
    if (t) {
      if (e.cooldown <= 0) e.windupLeft = e.def.windup;
      continue;
    }
    if (e.team === 'zombie') e.x -= e.def.speed * speedMult * dt;
    // Player units hold position (they spawn at their hold slot).
  }
}
