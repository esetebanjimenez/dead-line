import { describe, expect, it } from 'vitest';
import { gameData, validateData } from '../src/data';
import { aliveCount, computePressure, createWorld, deploy, livingPlayerUnits, step, tryDeploy, TICK_DT, type World } from '../src/sim';

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

describe('pressure', () => {
  it('is calm with no zombies and urgent when one is at the wall', () => {
    const w = createWorld(gameData);
    expect(computePressure(w).level).toBe(0);
    run(w, 3 + 90);
    expect(computePressure(w).urgent).toBe(true);
    expect(computePressure(w).level).toBeGreaterThan(0.5);
  });
});
