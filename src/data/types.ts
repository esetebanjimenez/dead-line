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
    repairHpPerScrap: number; // wall repair rate between waves (M2: 1 Scrap per 4 HP)
    baseHp: number;
    spawnX: number;
    spawnPlayerX: number;
    entityCap: number;
    maxUnitsAlive: number;
    globalDeployCooldown: number;
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
  pacing: { bannerTime: number; wavePause: number };
}

export interface GameData {
  config: GameConfig;
  units: UnitDef[];
  waves: WaveDef[];
}
