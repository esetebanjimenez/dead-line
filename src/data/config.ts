import type { GameConfig } from './types';

export const config: GameConfig = {
  world: {
    width: 1000,
    height: 400,
    groundY: 320,
    baseX: 40,
    wallX: 260,
    wallHp: 400,
    repairHpPerScrap: 4,
    baseHp: 500,
    spawnX: 1000,
    spawnPlayerX: 80,
    entityCap: 150,
    maxUnitsAlive: 8,
    globalDeployCooldown: 0.4,
  },
  // From Feel Spec v0.2 (placeholders).
  feel: {
    hitFlash: 0.06,
    surgeSpeedMult: 1.15,
    surgeDuration: 3,
    deathFade: 0.4,
    dropTime: 0.15,
    unitSpacing: 16,
    dropHeight: 40,
    wallShakePx: 2,
    wallShakeTime: 0.08,
    crackThresholds: [0.66, 0.33],
    pressureRange: 400,
    pressureRedNearest: 100,
    pressureRedCountRange: 150,
    pressureRedCount: 4,
  },
  pacing: { bannerTime: 3, wavePause: 10, freeRepairAfterWave: 5, freeRepairFraction: 0.25 },
};
