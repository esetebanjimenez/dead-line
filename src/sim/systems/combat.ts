import type { Entity, World } from '../world';

type Target = { kind: 'entity'; e: Entity } | { kind: 'wall' } | { kind: 'base' };

function findTarget(w: World, e: Entity): Target | null {
  const cfg = w.data.config.world;
  const r = e.def.range + (e.kind === 'tower' && w.towerTier === 2 ? w.data.config.world.towerTier2.rangeBonus : 0);
  if (e.team === 'player') {
    let best: Entity | null = null;
    for (const o of w.entities) {
      if (o.dead || o.team !== 'zombie') continue;
      if (Math.abs(o.x - e.x) > r) continue;
      if (!best) best = o;
      else if (e.def.prefer === 'highestHp' ? o.hp > best.hp : Math.abs(o.x - e.x) < Math.abs(best.x - e.x)) best = o;
    }
    return best ? { kind: 'entity', e: best } : null;
  }
  if (e.def.wallOnly) {
    if (w.wallHp > 0) return e.x - cfg.wallX <= r ? { kind: 'wall' } : null;
    return e.x - cfg.baseX <= r ? { kind: 'base' } : null;
  }
  // Zombies hit the nearest thing in their path: frontline units (in front of the wall), then the wall, then units behind it, then the base.
  const nearestUnit = (front: boolean): Entity | null => {
    let best: Entity | null = null;
    for (const o of w.entities) {
      if (o.dead || o.team !== 'player' || (o.wait ?? 0) > 0 || o.x >= e.x) continue;
      if (o.x > cfg.wallX !== front || e.x - o.x > r) continue;
      if (!best || o.x > best.x) best = o;
    }
    return best;
  };
  const front = nearestUnit(true);
  if (front) return { kind: 'entity', e: front };
  // Planting units keep walking past the wall until they reach their plant point.
  if (e.def.plantX !== undefined && !e.planted && e.x > e.def.plantX) return null;
  if (w.wallHp > 0) return e.x - cfg.wallX <= r ? { kind: 'wall' } : null;
  const back = nearestUnit(false);
  if (back) return { kind: 'entity', e: back };
  if (e.x - cfg.baseX <= r) return { kind: 'base' };
  return null;
}

function applyHit(w: World, attacker: Entity, t: Target): void {
  const pd = attacker.def.puddle;
  if (pd) {
    // Ranged puddle attack: the patch lands where the target stood when the telegraph began.
    const x = attacker.aimX ?? (t.kind === 'entity' ? t.e.x : w.data.config.world.wallX);
    w.puddles.push({ x, halfWidth: pd.halfWidth, dps: pd.dps, ttl: pd.duration, age: 0 });
    return;
  }
  const dmg =
    attacker.def.dps *
    attacker.def.attackInterval *
    (attacker.kind === 'tower' && w.towerTier === 2 ? w.data.config.world.towerTier2.damageMult : 1);
  if (t.kind === 'wall') {
    const before = w.wallHp;
    if (attacker.kind === 'ram') {
      attacker.hitWall = true;
      w.ramWallHits[w.wave] = (w.ramWallHits[w.wave] ?? 0) + 1;
    }
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
    if ((e.wait ?? 0) > 0) {
      e.wait! -= dt;
      continue;
    }
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
      if (e.def.plantDelay && !e.planted) {
        e.planted = true;
        e.cooldown = Math.max(e.cooldown, e.def.plantDelay);
      }
      if (e.cooldown <= 0) {
        e.windupLeft = e.def.windup;
        e.aimX = t.kind === 'entity' ? t.e.x : undefined;
        e.aimId = t.kind === 'entity' ? t.e.id : undefined;
      }
      continue;
    }
    if (e.team === 'zombie') {
      e.x -= e.def.speed * speedMult * dt;
    } else if (e.def.cost === undefined && !e.def.holdInPlace) {
      // Player units march out of the gate until an enemy is in range, never past the leash (they walk back to it after a fight).
      const cfg = w.data.config.world;
      if (e.x < cfg.leashX) e.x = Math.min(cfg.leashX, e.x + cfg.advanceSpeed * dt);
      else if (e.x > cfg.leashX) e.x = Math.max(cfg.leashX, e.x - cfg.advanceSpeed * dt);
    }
  }
}

/** Burning patches damage every player unit standing on them. Each patch expires after its duration. */
export function puddleSystem(w: World, dt: number): void {
  for (const p of w.puddles) {
    p.age += dt;
    for (const o of w.entities) {
      if (o.dead || o.team !== 'player' || Math.abs(o.x - p.x) > p.halfWidth) continue;
      o.hp -= p.dps * dt;
      o.hitFlash = Math.max(o.hitFlash, w.data.config.feel.hitFlash);
      if (o.hp <= 0) {
        o.dead = true;
        o.fade = w.data.config.feel.deathFade;
      }
    }
  }
  w.puddles = w.puddles.filter((p) => p.age < p.ttl);
}
