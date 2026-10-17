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
  aimId?: number; // target entity of the telegraph (drawing only)
  aimX?: number; // set while winding up a puddle attack: where the patch will land
}
export interface Puddle {
  x: number;
  halfWidth: number;
  dps: number;
  ttl: number;
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
  /** Render-only dummies for `?stress=N` load testing. The sim never reads or updates them. */
  stress: Entity[];
  puddles: Puddle[];
}

export function createWorld(data: GameData): World {
  const charges: Record<string, ChargeState> = {};
  for (const u of data.units) if (u.team === 'player' && u.cost === undefined) charges[u.id] = { count: u.maxCharges!, timer: 0 };
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
    stress: [],
    puddles: [],
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
  for (const e of w.entities) if (!e.dead && e.team === 'player' && e.def.cost === undefined) n++;
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

/** Between waves only (pause or banner). Spends Scrap at 1 per `repairHpPerScrap` HP, up to full HP. Returns HP restored. */
export function repairWall(w: World): number {
  if (w.status !== 'playing' || (w.phase !== 'pause' && w.phase !== 'banner')) return 0;
  const rate = w.data.config.world.repairHpPerScrap;
  const missing = w.wallMaxHp - w.wallHp;
  const hp = Math.min(missing, Math.floor(w.scrap) * rate);
  if (hp <= 0) return 0;
  w.wallHp += hp;
  w.scrap -= Math.ceil(hp / rate);
  return hp;
}

export type BuildResult = 'ok' | 'no-scrap' | 'built' | 'game-over' | 'entity-cap';

/** Player action: build a Scrap structure (the Tower). One slot: refused while one is alive. */
export function buildStructure(w: World, kind: string): BuildResult {
  if (w.status !== 'playing') return 'game-over';
  const def = unitDef(w, kind);
  if (def.cost === undefined) return 'game-over';
  if (w.entities.some((e) => !e.dead && e.kind === kind)) return 'built';
  if (w.scrap < def.cost) return 'no-scrap';
  if (!spawn(w, kind, holdX(w, kind))) return 'entity-cap';
  w.scrap -= def.cost;
  return 'ok';
}

export function deploy(w: World, kind: string): boolean {
  return tryDeploy(w, kind) === 'ok';
}

/** Fill `w.stress` with `n` render-only dummies (mixed kinds) for performance testing. No effect on the sim. */
export function fillStress(w: World, n: number): void {
  const kinds = ['shambler', 'rifleman', 'shield'];
  const cfg = w.data.config.world;
  w.stress = [];
  for (let i = 0; i < n; i++) {
    const kind = kinds[i % kinds.length];
    const def = unitDef(w, kind);
    const x = cfg.baseX + 40 + ((i * 97) % (cfg.spawnX - cfg.baseX - 80));
    w.stress.push({
      id: 1_000_000 + i,
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
      age: 1,
    });
  }
}

/** Gently sway the dummies so interpolation and sprite updates are exercised. */
export function stressStep(w: World): void {
  for (const e of w.stress) {
    e.prevX = e.x;
    e.x += Math.sin(w.time * 2 + e.id) * 0.8;
    e.hitFlash = Math.sin(w.time * 5 + e.id) > 0.95 ? 0.1 : 0;
  }
}
