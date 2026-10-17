import { describe, expect, it } from 'vitest';
import { gameData, validateData } from '../src/data';
import { createWorld, deploy, step, aliveCount, TICK_DT } from '../src/sim';

const run = (w: ReturnType<typeof createWorld>, seconds: number, each?: () => void) => {
  for (let i = 0; i < seconds / TICK_DT && w.status === 'playing'; i++) { each?.(); step(w); }
};

describe('data', () => {
  it('ships valid data', () => expect(() => validateData(gameData)).not.toThrow());
  it('rejects bad data', () => {
    const bad = structuredClone(gameData);
    bad.waves[0].groups[0].kind = 'nope';
    bad.units[0].hp = -1;
    expect(() => validateData(bad)).toThrow(/unknown unit nope/);
  });
});

describe('deploy charges', () => {
  it('consumes a charge and refuses at zero', () => {
    const w = createWorld(gameData);
    const max = gameData.units.find((u) => u.id === 'rifleman')!.maxCharges!;
    for (let i = 0; i < max; i++) expect(deploy(w, 'rifleman')).toBe(true);
    expect(deploy(w, 'rifleman')).toBe(false);
  });
  it('refills over time', () => {
    const w = createWorld(gameData);
    deploy(w, 'rifleman');
    const refill = gameData.units.find((u) => u.id === 'rifleman')!.chargeRefill!;
    run(w, refill + 0.2);
    expect(w.charges.rifleman.count).toBe(gameData.units.find((u) => u.id === 'rifleman')!.maxCharges);
  });
  it('respects the entity cap', () => {
    const data = structuredClone(gameData);
    data.config.world.entityCap = 2;
    const w = createWorld(data);
    expect(deploy(w, 'rifleman')).toBe(true);
    expect(deploy(w, 'rifleman')).toBe(true);
    expect(deploy(w, 'rifleman')).toBe(false);
    expect(aliveCount(w)).toBe(2);
  });
});

describe('combat', () => {
  it('is deterministic', () => {
    const a = createWorld(gameData), b = createWorld(gameData);
    const bot = (w: typeof a) => () => { deploy(w, 'rifleman'); deploy(w, 'shield'); };
    run(a, 60, bot(a)); run(b, 60, bot(b));
    expect(a.wallHp).toBe(b.wallHp);
    expect(a.entities.map((e) => e.x)).toEqual(b.entities.map((e) => e.x));
  });
  it('is lost when the player does nothing', () => {
    const w = createWorld(gameData);
    run(w, 300);
    expect(w.status).toBe('lost');
    expect(w.wallHp).toBe(0);
  });
  it('can be won by redeploying as charges refill', () => {
    const w = createWorld(gameData);
    run(w, 600, () => { deploy(w, 'shield'); deploy(w, 'rifleman'); });
    expect(w.status).toBe('won');
  });
  it('wall blocks zombies until destroyed', () => {
    const w = createWorld(gameData);
    run(w, 25);
    const z = w.entities.filter((e) => e.team === 'zombie');
    expect(z.length).toBeGreaterThan(0);
    expect(Math.min(...z.map((e) => e.x))).toBeGreaterThanOrEqual(gameData.config.world.wallX);
  });
});
