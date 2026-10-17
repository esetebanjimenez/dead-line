export type Team = 'player' | 'zombie';

export interface UnitDef {
  id: string;
  team: Team;
  name: string;
  hp: number;
  dps: number; // damage per hit = dps * attackInterval
  range: number;
  attackInterval: number; // seconds between attacks
  windup: number; // seconds from attack start to damage landing
  speed: number; // world units per second
  knockback: number; // pixels pushed onto a zombie hit by this unit
  knockbackImmune?: boolean;
  holdInPlace?: boolean; // player only: spawns at its hold slot and never marches out
  unlockWave?: number; // player only: cannot be deployed until this many waves have been cleared
  prefer?: 'highestHp'; // player only: shoots the highest-HP enemy in range instead of the nearest
  plantX?: number; // zombie only: advances past the wall until x <= plantX (or a frontline unit is in range), then stops for good
  plantDelay?: number; // zombie only: seconds of plant-and-aim pause before the first shot
  puddle?: { halfWidth: number; dps: number; duration: number }; // zombie only: attack lands a damaging patch instead of direct damage
  maxAlive?: number; // player only: per-type cap on living units
  holdOffset?: number; // player only: stops this far behind the wall
  deployCooldown?: number; // player only: seconds before this button can be used again
  reward?: number; // zombie only: Scrap dropped on death
  cost?: number; // player only: Scrap price. A unit with a cost is a one-off structure (no charges, built with buildStructure)
  maxCharges?: number; // player only
  chargeRefill?: number; // player only: seconds per charge
  color: number; // placeholder sprite colour
  width: number;
  height: number;
}

export interface WaveGroup {
  kind: string;
  count: number;
  interval: number; // seconds between spawns in this group
  delay: number; // seconds after wave start
}
export interface WaveDef {
  payout: number; // Scrap on clear
  groups: WaveGroup[];
}

export interface GameConfig {
  world: {
    width: number;
    height: number;
    groundY: number;
    baseX: number;
    wallX: number;
    wallHp: number;
    wallTier2: { hp: number; cost: number; unlockWave: number; repairCostMult: number }; // one-time upgrade between waves; also fully repairs
    repairHpPerScrap: number; // wall repair rate between waves (M2: 1 Scrap per 4 HP)
    baseHp: number;
    spawnX: number;
    spawnPlayerX: number;
    entityCap: number;
    maxUnitsAlive: number;
    globalDeployCooldown: number;
    advanceSpeed: number; // player units march right from the gate at this speed until an enemy is in range
    leashX: number; // player units never advance past this x; they hold here and return to it after a fight
    exitStagger: number; // seconds between units leaving the gate
    exitDelay: Record<string, number>; // extra seconds before a kind leaves the gate (so Shields lead the Riflemen)
  };
  feel: {
    hitFlash: number;
    surgeSpeedMult: number;
    surgeDuration: number;
    deathFade: number;
    dropTime: number;
    unitSpacing: number;
    dropHeight: number;
    wallShakePx: number;
    wallShakeTime: number;
    crackThresholds: [number, number];
    pressureRange: number; // glow and arrow start to brighten at this distance from the wall
    pressureRedNearest: number; // urgent when the nearest zombie is this close
    pressureRedCountRange: number; // urgent when pressureRedCount zombies are within this distance
    pressureRedCount: number;
  };
  pacing: { bannerTime: number; wavePause: number; freeRepairAfterWave: number; freeRepairFraction: number }; // free repair: once, when the given wave (1-based) is cleared
}

export interface GameData {
  config: GameConfig;
  units: UnitDef[];
  waves: WaveDef[];
}
