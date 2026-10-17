import { describe, expect, it } from 'vitest';
import { gameData, validateData } from '../src/data';
import {
  aliveCount,
  computePressure,
  createWorld,
  deploy,
  livingPlayerUnits,
  repairWall,
  skipPause,
  spawn,
  buildStructure,
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
  it('applies global and per-unit cooldowns', () => {
    const w = createWorld(gameData);
    expect(tryDeploy(w, 'rifleman')).toBe('ok');
    expect(tryDeploy(w, 'shield')).toBe('cooldown'); // global 0.4s
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

describe('tower (M2)', () => {
  it('costs 60 Scrap, allows one at a time, and is not a deployable charge unit', () => {
    const w = createWorld(gameData);
    expect(buildStructure(w, 'tower')).toBe('no-scrap');
    w.scrap = 130;
    expect(buildStructure(w, 'tower')).toBe('ok');
    expect(w.scrap).toBe(70);
    expect(buildStructure(w, 'tower')).toBe('built');
    expect(w.charges['tower']).toBeUndefined();
    expect(livingPlayerUnits(w)).toBe(0);
    const t = w.entities.find((e) => e.kind === 'tower')!;
    expect(t.x).toBeLessThan(gameData.config.world.wallX);
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
