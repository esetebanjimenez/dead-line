import type { GameData, Team, UnitDef } from '../data';

export interface Entity {
  id: number;
  team: Team;
  kind: string;
  def: UnitDef;
  x: number;
  prevX: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  windupLeft: number; // < 0 means not winding up
  hitFlash: number;
  dead: boolean;
  fade: number;
}
export interface ChargeState { count: number; timer: number }
export type Phase = 'banner' | 'fighting' | 'pause' | 'done';
export type Status = 'playing' | 'won' | 'lost';
export interface SpawnItem { t: number; kind: string }

export interface World {
  data: GameData;
  time: number;
  tick: number;
  nextId: number;
  entities: Entity[];
  wallHp: number;
  wallMaxHp: number;
  baseHp: number;
  baseMaxHp: number;
  charges: Record<string, ChargeState>;
  wave: number; // 0-based index
  phase: Phase;
  phaseTimer: number;
  waveClock: number;
  spawnQueue: SpawnItem[];
  surgeTimer: number;
  status: Status;
}

export function createWorld(data: GameData): World {
  const charges: Record<string, ChargeState> = {};
  for (const u of data.units) if (u.team === 'player') charges[u.id] = { count: u.maxCharges!, timer: 0 };
  return {
    data, time: 0, tick: 0, nextId: 1, entities: [],
    wallHp: data.config.world.wallHp, wallMaxHp: data.config.world.wallHp,
    baseHp: data.config.world.baseHp, baseMaxHp: data.config.world.baseHp,
    charges, wave: 0, phase: 'banner', phaseTimer: data.config.pacing.bannerTime,
    waveClock: 0, spawnQueue: [], surgeTimer: 0, status: 'playing',
  };
}

export function unitDef(w: World, id: string): UnitDef {
  const d = w.data.units.find((u) => u.id === id);
  if (!d) throw new Error(`unknown unit ${id}`);
  return d;
}

export function aliveCount(w: World): number {
  let n = 0;
  for (const e of w.entities) if (!e.dead) n++;
  return n;
}

export function spawn(w: World, kind: string, x: number): Entity | null {
  if (aliveCount(w) >= w.data.config.world.entityCap) return null;
  const def = unitDef(w, kind);
  const e: Entity = {
    id: w.nextId++, team: def.team, kind, def, x, prevX: x, hp: def.hp, maxHp: def.hp,
    cooldown: 0, windupLeft: -1, hitFlash: 0, dead: false, fade: 0,
  };
  w.entities.push(e);
  return e;
}

/** Player action. Returns false if no charge, game over, or entity cap reached. */
export function deploy(w: World, kind: string): boolean {
  if (w.status !== 'playing') return false;
  const c = w.charges[kind];
  if (!c || c.count <= 0) return false;
  if (!spawn(w, kind, w.data.config.world.spawnPlayerX)) return false;
  c.count--;
  return true;
}
