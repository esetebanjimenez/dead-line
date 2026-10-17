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
  age: number;
}
export interface ChargeState {
  count: number;
  timer: number;
}
export type Phase = 'banner' | 'fighting' | 'pause' | 'done';
export type Status = 'playing' | 'won' | 'lost';
export interface SpawnItem {
  t: number;
  kind: string;
}

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
  scrap: number;
  deployCd: Record<string, number>;
  globalCd: number;
  wallShake: number;
  status: Status;
}

export function createWorld(data: GameData): World {
  const charges: Record<string, ChargeState> = {};
  for (const u of data.units) if (u.team === 'player') charges[u.id] = { count: u.maxCharges!, timer: 0 };
  return {
    data,
    time: 0,
    tick: 0,
    nextId: 1,
    entities: [],
    wallHp: data.config.world.wallHp,
    wallMaxHp: data.config.world.wallHp,
    baseHp: data.config.world.baseHp,
    baseMaxHp: data.config.world.baseHp,
    charges,
    wave: 0,
    phase: 'banner',
    phaseTimer: data.config.pacing.bannerTime,
    waveClock: 0,
    spawnQueue: [],
    surgeTimer: 0,
    scrap: 0,
    deployCd: {},
    globalCd: 0,
    wallShake: 0,
    status: 'playing',
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
    id: w.nextId++,
    team: def.team,
    kind,
    def,
    x,
    prevX: x,
    hp: def.hp,
    maxHp: def.hp,
    cooldown: 0,
    windupLeft: -1,
    hitFlash: 0,
    dead: false,
    fade: 0,
    age: 0,
  };
  w.entities.push(e);
  return e;
}

/** First hold slot (nearest the wall) not already taken by a living unit of this kind. */
function holdX(w: World, kind: string): number {
  const def = unitDef(w, kind);
  const base = w.data.config.world.wallX - (def.holdOffset ?? 0);
  const taken = new Set<number>();
  for (const e of w.entities) if (!e.dead && e.kind === kind) taken.add(Math.round(e.x));
  const gap = w.data.config.feel.unitSpacing;
  for (let slot = 0; ; slot++) if (!taken.has(Math.round(base - slot * gap))) return base - slot * gap;
}

export function livingPlayerUnits(w: World): number {
  let n = 0;
  for (const e of w.entities) if (!e.dead && e.team === 'player') n++;
  return n;
}

export type DeployResult = 'ok' | 'no-charge' | 'cooldown' | 'unit-limit' | 'entity-cap' | 'game-over';

/** Player action. Charges, per-unit cooldown, global cooldown, and the alive-unit limit all apply. */
export function tryDeploy(w: World, kind: string): DeployResult {
  if (w.status !== 'playing') return 'game-over';
  const c = w.charges[kind];
  if (!c || c.count <= 0) return 'no-charge';
  if (w.globalCd > 0 || (w.deployCd[kind] ?? 0) > 0) return 'cooldown';
  if (livingPlayerUnits(w) >= w.data.config.world.maxUnitsAlive) return 'unit-limit';
  const cap = unitDef(w, kind).maxAlive;
  if (cap !== undefined && w.entities.filter((e) => !e.dead && e.kind === kind).length >= cap) return 'unit-limit';
  if (!spawn(w, kind, holdX(w, kind))) return 'entity-cap';
  c.count--;
  w.deployCd[kind] = unitDef(w, kind).deployCooldown ?? 0;
  w.globalCd = w.data.config.world.globalDeployCooldown;
  return 'ok';
}

export function deploy(w: World, kind: string): boolean {
  return tryDeploy(w, kind) === 'ok';
}
