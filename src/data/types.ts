export type Team = 'player' | 'zombie';

export interface UnitDef {
  id: string;
  team: Team;
  name: string;
  hp: number;
  damage: number;
  range: number;
  attackInterval: number; // seconds between attacks
  windup: number; // seconds from attack start to damage landing
  speed: number; // world units per second
  knockback: number; // pixels pushed onto a zombie hit by this unit
  knockbackImmune?: boolean;
  holdOffset?: number; // player only: stops this far behind the wall
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
    baseHp: number;
    spawnX: number;
    spawnPlayerX: number;
    entityCap: number;
  };
  feel: {
    hitFlash: number;
    surgeSpeedMult: number;
    surgeDuration: number;
    deathFade: number;
  };
  pacing: { bannerTime: number; wavePause: number };
}

export interface GameData {
  config: GameConfig;
  units: UnitDef[];
  waves: WaveDef[];
}
