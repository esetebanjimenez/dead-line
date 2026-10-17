import { ViewPool } from '../src/render/pool';
import { frameForRamAttack } from '../src/render/project';
import { keyToSlot, slotKeyLabel } from '../src/ui/keys';
import { describe, expect, it } from 'vitest';
import { gameData, validateData } from '../src/data';
import {
  upgradeWall,
  upgradeTower,
  reinforce,
  reinforceFull,
  aliveCount,
  computePressure,
  createWorld,
  deploy,
  livingPlayerUnits,
  repairWall,
  skipPause,
  spawn,
  buildStructure,
  nextStructureCost,
  step,
  tryDeploy,
  TICK_DT,
  type World,
} from '../src/sim';

const run = (w: World, seconds: number, each?: () => void) => {
  for (let i = 0; i < seconds / TICK_DT && w.status === 'playing'; i++) {
    each?.();
    step(w);
  }
};
const rifle = () => gameData.units.find((u) => u.id === 'rifleman')!;

describe('data', () => {
  it('ships valid data', () => expect(() => validateData(gameData)).not.toThrow());
  it('rejects bad data', () => {
    const bad = structuredClone(gameData);
    bad.waves[0].groups[0].kind = 'nope';
    bad.units[0].hp = -1;
    expect(() => validateData(bad)).toThrow(/unknown unit nope/);
  });
});

describe('deployment rules', () => {
  it('consumes a charge and refuses at zero', () => {
    const w = createWorld(gameData);
    let ok = 0;
    for (let i = 0; i < 30 * 10; i++) {
      if (deploy(w, 'rifleman')) ok++;
      w.entities.length = 0;
      step(w);
      if (ok === rifle().maxCharges) break;
    }
    expect(ok).toBe(rifle().maxCharges);
    w.deployCd = {};
    w.globalCd = 0;
    expect(tryDeploy(w, 'rifleman')).toBe('no-charge');
  });
  it('applies per-unit cooldowns only (no global cooldown)', () => {
    const w = createWorld(gameData);
    expect(tryDeploy(w, 'rifleman')).toBe('ok');
    expect(tryDeploy(w, 'shield')).toBe('ok'); // different kind: no global cooldown
    run(w, 0.45);
    expect(tryDeploy(w, 'rifleman')).toBe('cooldown'); // per-unit 0.5s
    run(w, 0.1);
    expect(tryDeploy(w, 'rifleman')).toBe('ok');
  });
  it('refills charges over time', () => {
    const w = createWorld(gameData);
    deploy(w, 'rifleman');
    run(w, rifle().chargeRefill! + 0.2);
    expect(w.charges.rifleman.count).toBe(rifle().maxCharges);
  });
  it('caps living units and frees the slot on death', () => {
    const data = structuredClone(gameData);
    data.config.world.maxUnitsAlive = 2;
    const w = createWorld(data);
    expect(tryDeploy(w, 'rifleman')).toBe('ok');
    run(w, 0.6);
    expect(tryDeploy(w, 'rifleman')).toBe('ok');
    run(w, 0.6);
    expect(tryDeploy(w, 'rifleman')).toBe('unit-limit');
    w.entities[0].dead = true;
    expect(livingPlayerUnits(w)).toBe(1);
    expect(tryDeploy(w, 'rifleman')).toBe('ok');
  });
  it('respects the entity cap', () => {
    const data = structuredClone(gameData);
    data.config.world.entityCap = 1;
    const w = createWorld(data);
    expect(tryDeploy(w, 'rifleman')).toBe('ok');
    run(w, 0.6);
    expect(tryDeploy(w, 'rifleman')).toBe('entity-cap');
    expect(aliveCount(w)).toBe(1);
  });
  it('puts same-kind units in separate hold slots', () => {
    const w = createWorld(gameData);
    for (let i = 0; i < 3; i++) {
      expect(tryDeploy(w, 'rifleman')).toBe('ok');
      run(w, 0.6);
    }
    const xs = w.entities.filter((e) => e.kind === 'rifleman').map((e) => Math.round(e.x));
    expect(new Set(xs).size).toBe(3);
  });
});

describe('combat', () => {
  it('is deterministic', () => {
    const a = createWorld(gameData),
      b = createWorld(gameData);
    const bot = (w: World) => () => {
      deploy(w, 'rifleman');
      deploy(w, 'shield');
    };
    run(a, 60, bot(a));
    run(b, 60, bot(b));
    expect(a.wallHp).toBe(b.wallHp);
    expect(a.entities.map((e) => e.x)).toEqual(b.entities.map((e) => e.x));
  });
  it('is lost when the player does nothing', () => {
    const w = createWorld(gameData);
    run(w, 600);
    expect(w.status).toBe('lost');
    expect(w.wallHp).toBe(0);
  });
  it('wall blocks zombies until destroyed', () => {
    const w = createWorld(gameData);
    run(w, 40);
    const z = w.entities.filter((e) => e.team === 'zombie');
    expect(z.length).toBeGreaterThan(0);
    expect(Math.min(...z.map((e) => e.x))).toBeGreaterThanOrEqual(gameData.config.world.wallX);
  });
  it('pays scrap on kills and wave clears', () => {
    const w = createWorld(gameData);
    run(w, 900, () => {
      deploy(w, 'shield');
      deploy(w, 'rifleman');
    });
    expect(w.scrap).toBeGreaterThan(0);
  });
});

describe('seeded replay', () => {
  it('same seeded inputs always give the same outcome', () => {
    const play = (seed: number) => {
      let s = seed;
      const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
      const w = createWorld(gameData);
      run(w, 120, () => {
        if (rnd() < 0.3) deploy(w, rnd() < 0.5 ? 'rifleman' : 'shield');
      });
      return JSON.stringify([w.wallHp, w.baseHp, w.scrap, w.entities.map((e) => [e.id, e.kind, e.x, e.hp])]);
    };
    expect(play(7)).toBe(play(7));
    expect(play(7)).not.toBe(play(8));
  });
});

describe('pressure', () => {
  it('is calm with no zombies and urgent when one is at the wall', () => {
    const w = createWorld(gameData);
    expect(computePressure(w).level).toBe(0);
    run(w, 3 + 90);
    expect(computePressure(w).urgent).toBe(true);
    expect(computePressure(w).level).toBeGreaterThan(0.5);
  });
});

describe('geometry', () => {
  it('Riflemen at their hold slot can reach zombies stopped at the Shield line', () => {
    const wallX = gameData.config.world.wallX;
    const unit = (id: string) => gameData.units.find((u) => u.id === id)!;
    const rifle = unit('rifleman');
    const shield = unit('shield');
    const zombie = unit('shambler');
    const rifleReach = wallX - (rifle.holdOffset ?? 0) + rifle.range;
    const zombieStop = wallX - (shield.holdOffset ?? 0) + zombie.range;
    const margin = rifleReach - zombieStop;
    // Reach must cover the Shield line, but not by so much that Riflemen no longer need it.
    expect(margin).toBeGreaterThanOrEqual(0);
    expect(margin).toBeLessThanOrEqual(25);
  });
});

describe('wall repair (M2)', () => {
  it('costs 1 Scrap per 4 HP, only between waves, and the wall no longer restores for free', () => {
    const w = createWorld(gameData);
    w.phase = 'fighting';
    w.wallHp = 100;
    w.scrap = 30;
    expect(repairWall(w)).toBe(0);
    w.phase = 'pause';
    expect(repairWall(w)).toBe(120);
    expect(w.wallHp).toBe(220);
    expect(w.scrap).toBe(0);
    w.scrap = 1000;
    repairWall(w);
    expect(w.wallHp).toBe(w.wallMaxHp);
    expect(w.scrap).toBe(1000 - 45);
  });
  it('does not auto-restore the wall when the next wave starts', () => {
    const w = createWorld(gameData);
    w.wave = 0;
    w.phase = 'pause';
    w.phaseTimer = 0;
    w.wallHp = 200;
    step(w);
    expect(w.wallHp).toBe(200);
  });
});

describe('tower (M2, M4 slots)', () => {
  it('slot 1 costs 60 Scrap and the Tower is not a deployable charge unit', () => {
    const w = createWorld(gameData);
    expect(buildStructure(w, 'tower')).toBe('no-scrap');
    w.scrap = 130;
    expect(buildStructure(w, 'tower')).toBe('ok');
    expect(w.scrap).toBe(70);
    expect(w.charges['tower']).toBeUndefined();
    expect(livingPlayerUnits(w)).toBe(0);
    const t = w.entities.find((e) => e.kind === 'tower')!;
    expect(t.x).toBeLessThan(gameData.config.world.wallX);
  });
  it('slot 2 costs the configured extra price, then the cap is reached', () => {
    const extra = gameData.config.world.towerExtraSlotCosts;
    expect(extra).toEqual([90]);
    const w = createWorld(gameData);
    w.scrap = 60 + extra[0] + 500;
    expect(nextStructureCost(w, 'tower')).toBe(60);
    expect(buildStructure(w, 'tower')).toBe('ok');
    expect(nextStructureCost(w, 'tower')).toBe(extra[0]);
    w.scrap = extra[0] - 1;
    expect(buildStructure(w, 'tower')).toBe('no-scrap');
    w.scrap = extra[0] + 5;
    expect(buildStructure(w, 'tower')).toBe('ok');
    expect(w.scrap).toBe(5);
    expect(nextStructureCost(w, 'tower')).toBeNull();
    w.scrap = 1000;
    expect(buildStructure(w, 'tower')).toBe('built');
    expect(w.scrap).toBe(1000);
    const xs = w.entities.filter((e) => e.kind === 'tower').map((e) => e.x);
    expect(xs.length).toBe(2);
    expect(Math.abs(xs[0] - xs[1])).toBeGreaterThanOrEqual(gameData.units.find((u) => u.id === 'tower')!.width);
  });
  it('a destroyed tower frees its slot at the slot-appropriate price', () => {
    const w = createWorld(gameData);
    w.scrap = 1000;
    buildStructure(w, 'tower');
    buildStructure(w, 'tower');
    w.entities.find((e) => e.kind === 'tower')!.dead = true;
    expect(nextStructureCost(w, 'tower')).toBe(gameData.config.world.towerExtraSlotCosts[0]);
  });
  it('validates extra slot costs', () => {
    const bad = structuredClone(gameData);
    bad.config.world.towerExtraSlotCosts = [0];
    expect(() => validateData(bad)).toThrow(/towerExtraSlotCosts/);
  });
});

describe('fire archer puddle (M2)', () => {
  it('hits the nearest frontline unit, lands a patch after the telegraph, and the patch hurts then expires', () => {
    const w = createWorld(gameData);
    w.phase = 'done'; // keep the wave system out of the way
    const back = spawn(w, 'rifleman', 150)!;
    const shield = spawn(w, 'shield', 300)!;
    const arch = spawn(w, 'spitter', 440)!;
    run(w, 0.2);
    expect(arch.planted).toBe(true);
    expect(arch.aimId).toBeUndefined(); // plant-and-aim pause: no shot yet
    run(w, 1);
    expect(arch.aimId).toBe(shield.id);
    expect(shield.hp).toBe(shield.maxHp);
    run(w, 1);
    expect(w.puddles.length).toBe(1);
    expect(shield.hp).toBeLessThan(shield.maxHp);
    expect(back.hp).toBe(back.maxHp);
    run(w, 3);
    expect(w.puddles.every((p) => p.age < p.ttl)).toBe(true);
  });
});

describe('fire archer approach (M2)', () => {
  it('walks past the wall to x 350, then plants and shoots the wall after the 1s pause', () => {
    const w = createWorld(gameData);
    w.phase = 'done';
    const arch = spawn(w, 'spitter', 440)!;
    run(w, 0.5);
    expect(arch.x).toBeLessThan(440); // did not stop at wall range (x 430)
    run(w, 4);
    expect(arch.x).toBeLessThan(351);
    expect(arch.x).toBeGreaterThan(348);
    run(w, 1.2);
    expect(arch.aimX).toBeUndefined();
    expect(arch.planted).toBe(true);
    expect(w.puddles.length + (arch.windupLeft >= 0 ? 1 : 0)).toBeGreaterThan(0);
  });
});

describe('wave pause (M2)', () => {
  it('lasts the configured pause and can be skipped without touching charges', () => {
    expect(gameData.config.pacing.wavePause).toBe(10);
    const w = createWorld(gameData);
    w.phase = 'pause';
    w.phaseTimer = 10;
    w.charges['rifleman'].count = 1;
    w.charges['rifleman'].timer = 5;
    expect(skipPause(w)).toBe(true);
    expect(w.charges['rifleman'].count).toBe(1);
    step(w);
    expect(w.phase).toBe('banner');
    expect(skipPause(w)).toBe(false);
  });
});

describe('gate walk-out (M2)', () => {
  it('Shield leaves first, Rifleman 0.3s later, staggered 0.15s, marches at 90 and holds at the leash', () => {
    const w = createWorld(gameData);
    w.phase = 'done';
    expect(deploy(w, 'shield')).toBe(true);
    w.globalCd = 0;
    expect(deploy(w, 'rifleman')).toBe(true);
    const [s, r] = w.entities;
    expect(s.wait).toBe(0);
    expect(r.wait).toBeCloseTo(0.3, 5);
    run(w, 0.2);
    expect(s.x).toBeGreaterThan(gameData.config.world.spawnPlayerX);
    expect(r.x).toBe(gameData.config.world.spawnPlayerX);
    run(w, 10);
    expect(s.x).toBe(gameData.config.world.leashX);
    expect(r.x).toBe(gameData.config.world.leashX);
  });
  it('a waiting unit cannot be targeted', () => {
    const w = createWorld(gameData);
    w.phase = 'done';
    const u = spawn(w, 'rifleman', 100)!;
    u.wait = 5;
    spawn(w, 'shambler', 110);
    run(w, 1);
    expect(u.hp).toBe(u.maxHp);
  });
});

describe('sniper (M2)', () => {
  it('is locked until wave 4, holds at x 180 and shoots the highest-HP enemy in range', () => {
    const w = createWorld(gameData);
    expect(tryDeploy(w, 'sniper')).toBe('locked');
    w.wave = 3;
    w.phase = 'done';
    expect(tryDeploy(w, 'sniper')).toBe('ok');
    const sn = w.entities.find((e) => e.kind === 'sniper')!;
    expect(sn.wait).toBeUndefined();
    expect(sn.x).toBe(180);
    const small = spawn(w, 'runner', 300)!;
    const big = spawn(w, 'brute', 400)!;
    run(w, 1.5);
    expect(sn.x).toBe(180);
    expect(big.hp).toBeLessThan(big.maxHp);
    expect(small.hp).toBe(small.maxHp);
  });
});

describe('wall tier 2 (M2)', () => {
  it('is locked until wave 4, costs 350, adds 50% of 650 HP once, and repairs cost 1.5x', () => {
    const w = createWorld(gameData);
    w.phase = 'pause';
    w.scrap = 500;
    w.wave = 3;
    expect(upgradeWall(w)).toBe('locked');
    expect(w.wallTier).toBe(1);
    expect(w.scrap).toBe(500);
    w.wave = 4;
    w.wallHp = 100;
    expect(upgradeWall(w)).toBe('ok');
    expect(w.scrap).toBe(150);
    expect(w.wallMaxHp).toBe(650);
    expect(w.wallHp).toBe(425); // 100 + 325
    expect(upgradeWall(w)).toBe('owned');
    w.wallHp = 650 - 60;
    repairWall(w);
    expect(w.wallHp).toBe(650);
    expect(w.scrap).toBe(150 - 23); // 60 HP at 1 Scrap per 4/1.5 HP = 22.5, rounded up
  });
  it('cannot be bought mid-wave or without Scrap', () => {
    const w = createWorld(gameData);
    w.wave = 4;
    w.scrap = 500;
    w.phase = 'fighting';
    expect(upgradeWall(w)).toBe('bad-phase');
    w.phase = 'pause';
    w.scrap = 349;
    expect(upgradeWall(w)).toBe('no-scrap');
  });
});

describe('hotkeys', () => {
  it('maps each digit to its own slot only', () => {
    const slots = ['rifleman', 'shield', 'sniper', 'tower'];
    expect(keyToSlot('1', slots)).toBe('rifleman');
    expect(keyToSlot('2', slots)).toBe('shield');
    expect(keyToSlot('3', slots)).toBe('sniper');
    expect(keyToSlot('4', slots)).toBe('tower');
    expect(keyToSlot('5', slots)).toBeNull();
    const withR = [...slots, 'reinforce'];
    expect(keyToSlot('5', withR)).toBe('reinforce');
    expect(slotKeyLabel('reinforce', withR)).toBe('5');
    expect(keyToSlot('5', withR, new Set(['reinforce']))).toBeNull(); // dimmed button ignores its hotkey
    expect(keyToSlot('4', withR, new Set(['reinforce']))).toBe('tower');
    expect(keyToSlot('r', slots)).toBeNull();
    expect(slotKeyLabel('sniper', slots)).toBe('3');
  });
});

describe('pool churn (render view pool)', () => {
  it('keeps created flat while in-use rises and falls around 156 entities', () => {
    const pool = new ViewPool(() => ({ id: Math.random() }));
    const held: { id: number }[] = [];
    let peak = 0;
    // Warm up to the target population, then churn ~10 per second for 60 s at 30 Hz.
    for (let i = 0; i < 156; i++) held.push(pool.acquire());
    const warm = pool.created;
    expect(warm).toBe(156);
    let rising = false;
    let sawRise = false;
    let sawFall = false;
    let last = pool.inUse;
    for (let tick = 0; tick < 1800; tick++) {
      // Every third tick: kill 1 and spawn 1 (10 per second); every 100 ticks drift +-6 around 156.
      if (tick % 3 === 0) {
        const v = held.pop();
        if (v) pool.release(v);
        held.unshift(pool.acquire());
      }
      const phase = Math.floor(tick / 100) % 2;
      if (tick % 100 === 50) {
        for (let k = 0; k < 6; k++) {
          if (phase === 0) {
            const v = held.pop();
            if (v) pool.release(v);
          } else held.push(pool.acquire());
        }
      }
      peak = Math.max(peak, pool.inUse);
      if (pool.inUse > last) sawRise = rising = true;
      if (pool.inUse < last) sawFall = true;
      last = pool.inUse;
      expect(pool.inUse).toBe(held.length);
    }
    expect(rising).toBe(true);
    expect(sawRise && sawFall).toBe(true);
    expect(pool.created).toBeLessThanOrEqual(warm + 6); // only the drift peak may add objects
    expect(peak).toBeLessThanOrEqual(162);
  });
});

describe('150-entity benchmark', () => {
  it('averages under 2 ms per tick with 150 entities over 1000 ticks', () => {
    const w = createWorld(gameData);
    w.phase = 'fighting';
    w.wallHp = w.wallMaxHp = 1e9;
    w.baseHp = w.baseMaxHp = 1e9;
    const cap = w.data.config.world.entityCap;
    for (let i = 0; i < cap; i++) {
      spawn(w, i % 2 ? 'shambler' : 'rifleman', 100 + (i % 30) * 10);
    }
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      step(w);
      // Keep the population at the cap so every tick is a full-load tick.
      while (aliveCount(w) < cap && spawn(w, 'shambler', 1000)) {
        /* refill */
      }
    }
    const avg = (performance.now() - t0) / 1000;
    expect(aliveCount(w)).toBeGreaterThan(100);
    expect(avg).toBeLessThan(2);
  });
});

describe('leash geometry', () => {
  it('a Rifleman held at the leash x 420 can hit an Archer planted at x 350', () => {
    const w = createWorld(gameData);
    w.phase = 'fighting';
    const r = spawn(w, 'rifleman', gameData.config.world.leashX)!;
    const a = spawn(w, 'spitter', 350)!;
    expect(Math.abs(r.x - a.x)).toBeLessThanOrEqual(r.def.range);
    const hp = a.hp;
    for (let i = 0; i < 150; i++) step(w);
    expect(a.hp).toBeLessThan(hp);
  });
});

describe('Battering Ram (M3)', () => {
  it('ignores player units and attacks only the wall', () => {
    const w = createWorld(gameData);
    w.phase = 'fighting';
    const wallX = gameData.config.world.wallX;
    const ram = spawn(w, 'ram', wallX + 20)!;
    const rifle = spawn(w, 'rifleman', wallX + 10)!;
    rifle.wait = 0;
    const hp0 = rifle.hp;
    const wall0 = w.wallHp;
    for (let i = 0; i < 90; i++) step(w);
    expect(rifle.hp).toBe(hp0);
    expect(w.wallHp).toBeLessThan(wall0);
    expect(ram.def.wallOnly).toBe(true);
  });
  it('wave 10 holds 3 Rams and stays under the entity cap', () => {
    const last = gameData.waves[9]!;
    const rams = last.groups.filter((g) => g.kind === 'ram').reduce((n, g) => n + g.count, 0);
    expect(rams).toBe(3);
    const total = last.groups.reduce((n, g) => n + g.count, 0);
    expect(total).toBe(28);
    expect(total + 11).toBeLessThan(gameData.config.world.entityCap);
  });
  it('free wall repairs fire after waves 5 and 8', () => {
    expect(gameData.config.pacing.freeRepairAfterWaves).toEqual([5, 8]);
  });
});

describe('reinforce (M4 module A)', () => {
  const fighting = () => {
    const w = createWorld(gameData);
    w.phase = 'fighting';
    return w;
  };
  it('is refused outside a wave, without Scrap, and on cooldown; config drives cost and cooldown', () => {
    const cfg = gameData.config.world.reinforce;
    const w = createWorld(gameData);
    w.scrap = 500;
    expect(reinforce(w)).toBe('bad-phase');
    w.phase = 'fighting';
    w.charges['rifleman'].count = 0;
    w.scrap = cfg.cost - 1;
    expect(reinforce(w)).toBe('no-scrap');
    w.scrap = 500;
    expect(reinforce(w)).toBe('ok');
    expect(w.scrap).toBe(500 - cfg.cost);
    expect(reinforce(w)).toBe('cooldown');
    expect(w.scrap).toBe(500 - cfg.cost);
    expect(cfg.cooldown).toBe(15);
    run(w, cfg.cooldown + 0.1);
    w.phase = 'fighting';
    w.charges['rifleman'].count = 0;
    expect(w.reinforceCd).toBe(0);
    expect(reinforce(w)).toBe('ok');
  });
  it('is refused without spending Scrap when every unlocked charge is full, and never grants a locked Sniper charge', () => {
    const w = fighting();
    w.scrap = 500;
    expect(reinforceFull(w)).toBe(true);
    expect(reinforce(w)).toBe('full');
    expect(w.scrap).toBe(500);
    expect(w.reinforceCd).toBe(0);
    w.charges['sniper'].count = 0; // locked before its wave: does not count
    expect(reinforce(w)).toBe('full');
    expect(w.charges['sniper'].count).toBe(0);
    w.charges['shield'].count = 0;
    expect(reinforce(w)).toBe('ok');
    expect(w.charges['sniper'].count).toBe(0);
  });
  it('refills every deploy charge to max and resets timers, never touching the Tower', () => {
    const w = fighting();
    w.scrap = 200;
    for (const id of Object.keys(w.charges)) w.charges[id] = { count: 0, timer: 1 };
    expect(reinforce(w)).toBe('ok');
    for (const u of gameData.units) {
      if (u.team !== 'player' || u.cost !== undefined) continue;
      if (u.unlockWave !== undefined && w.wave < u.unlockWave) continue; // locked: untouched
      expect(w.charges[u.id]).toEqual({ count: u.maxCharges, timer: 0 });
    }
    expect(w.charges['tower']).toBeUndefined();
  });
  it('is refused after game over', () => {
    const w = fighting();
    w.scrap = 200;
    w.status = 'lost';
    expect(reinforce(w)).toBe('bad-phase');
  });
  it('validates config', () => {
    const bad = structuredClone(gameData);
    bad.config.world.reinforce.cost = 0;
    expect(() => validateData(bad)).toThrow(/reinforce.cost/);
  });
});

describe('frameForRamAttack', () => {
  it('idles as the wind-up, strikes around the hit, then returns to idle', () => {
    expect(frameForRamAttack(0.5, 0, 1).frame).toBe('idle');
    expect(frameForRamAttack(0.05, 0, 1).frame).toBe('attack');
    expect(frameForRamAttack(-1, 1, 1)).toEqual({ frame: 'attack', since: 0 });
    expect(frameForRamAttack(-1, 0.5, 1).frame).toBe('idle');
  });
});

describe('tower tier 2 (M4 Module C)', () => {
  const setup = () => {
    const w = createWorld(gameData);
    w.phase = 'pause';
    w.scrap = 1000;
    w.wave = 5;
    return w;
  };
  it('is locked until wave 5, costs 150 once, and refuses mid-wave or without Scrap', () => {
    const w = setup();
    w.wave = 4;
    expect(upgradeTower(w)).toBe('locked');
    expect(w.towerTier).toBe(1);
    expect(w.scrap).toBe(1000);
    w.wave = 5;
    w.phase = 'fighting';
    expect(upgradeTower(w)).toBe('bad-phase');
    w.phase = 'pause';
    w.scrap = 149;
    expect(upgradeTower(w)).toBe('no-scrap');
    w.scrap = 400;
    expect(upgradeTower(w)).toBe('ok');
    expect(w.scrap).toBe(250);
    expect(w.towerTier).toBe(2);
    expect(upgradeTower(w)).toBe('owned');
    expect(w.scrap).toBe(250);
  });
  it('adds +30 range and +50% damage, to an existing Tower and one built afterwards', () => {
    const hitsAt = (tier: 1 | 2, dist: number) => {
      const w = setup();
      w.phase = 'fighting';
      w.towerTier = tier;
      buildStructure(w, 'tower');
      const tw = w.entities.find((e) => e.kind === 'tower')!;
      const z = spawn(w, 'shambler', tw.x + dist)!;
      z.def = { ...z.def, speed: 0 };
      const hp0 = z.hp;
      run(w, 0.5);
      return hp0 - z.hp;
    };
    expect(hitsAt(1, 220)).toBe(0); // out of the tier 1 range 200
    expect(hitsAt(2, 220)).toBeGreaterThan(0); // inside 230
    expect(hitsAt(2, 235)).toBe(0);
    expect(hitsAt(2, 100)).toBeCloseTo(hitsAt(1, 100) * 1.5, 5);
    // existing Tower picks it up on purchase
    const w = setup();
    buildStructure(w, 'tower');
    upgradeTower(w);
    expect(w.towerTier).toBe(2);
    expect(w.entities.filter((e) => e.kind === 'tower').length).toBe(1);
  });
});
