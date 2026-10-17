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
  wait?: number; // player units: seconds left inside the gate before walking out (untargetable, not drawn)
  waitTotal?: number;
  planted?: boolean; // ranged zombies with plantX: true once stopped
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
  wallTier: 1 | 2;
  towerTier: 1 | 2;
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
  reinforceCd: number;
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
    wallTier: 1,
    towerTier: 1,
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
    reinforceCd: 0,
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
  const gap = def.cost !== undefined ? def.width + 8 : w.data.config.feel.unitSpacing; // structures are wide: space them by their width
  for (let slot = 0; ; slot++) if (!taken.has(Math.round(base - slot * gap))) return base - slot * gap;
}

export function livingPlayerUnits(w: World): number {
  let n = 0;
  for (const e of w.entities) if (!e.dead && e.team === 'player' && e.def.cost === undefined && !e.def.holdInPlace) n++;
  return n;
}

export type DeployResult = 'locked' | 'ok' | 'no-charge' | 'cooldown' | 'unit-limit' | 'entity-cap' | 'game-over';

/** Player action. Charges, per-unit cooldown, global cooldown, and the alive-unit limit all apply. */
export function tryDeploy(w: World, kind: string): DeployResult {
  if (w.status !== 'playing') return 'game-over';
  const ud = unitDef(w, kind);
  if (ud.unlockWave !== undefined && w.wave < ud.unlockWave) return 'locked';
  const c = w.charges[kind];
  if (!c || c.count <= 0) return 'no-charge';
  if (w.globalCd > 0 || (w.deployCd[kind] ?? 0) > 0) return 'cooldown';
  if (!ud.holdInPlace && livingPlayerUnits(w) >= w.data.config.world.maxUnitsAlive) return 'unit-limit';
  const cap = unitDef(w, kind).maxAlive;
  if (cap !== undefined && w.entities.filter((e) => !e.dead && e.kind === kind).length >= cap) return 'unit-limit';
  const def = unitDef(w, kind);
  const cfg = w.data.config.world;
  const mobile = def.cost === undefined && !def.holdInPlace;
  const e = spawn(w, kind, mobile ? cfg.spawnPlayerX : holdX(w, kind));
  if (!e) return 'entity-cap';
  if (mobile) {
    // Units leave the gate one by one: the kind's own delay, and at least one stagger after the last unit still inside.
    let last = -Infinity;
    for (const o of w.entities) if (!o.dead && o.team === 'player' && (o.wait ?? 0) > 0) last = Math.max(last, o.wait!);
    e.wait = Math.max(cfg.exitDelay[kind] ?? 0, last + cfg.exitStagger);
    e.waitTotal = e.wait;
  }
  c.count--;
  w.deployCd[kind] = unitDef(w, kind).deployCooldown ?? 0;
  w.globalCd = w.data.config.world.globalDeployCooldown;
  return 'ok';
}

/** Between waves only (pause or banner). Spends Scrap at 1 per `repairHpPerScrap` HP, up to full HP. Returns HP restored. */
export function repairWall(w: World): number {
  if (w.status !== 'playing' || (w.phase !== 'pause' && w.phase !== 'banner')) return 0;
  const rate = w.data.config.world.repairHpPerScrap / (w.wallTier === 2 ? w.data.config.world.wallTier2.repairCostMult : 1);
  const missing = w.wallMaxHp - w.wallHp;
  const hp = Math.min(missing, Math.floor(w.scrap) * rate);
  if (hp <= 0) return 0;
  w.wallHp += hp;
  w.scrap -= Math.ceil(hp / rate);
  return hp;
}

/** Player action: upgrade the wall to tier 2 between waves, once, after the unlock wave. Costs Scrap and fully repairs. */
export function upgradeWall(w: World): 'ok' | 'locked' | 'owned' | 'no-scrap' | 'bad-phase' {
  const t2 = w.data.config.world.wallTier2;
  if (w.wallTier === 2) return 'owned';
  if (w.status !== 'playing' || (w.phase !== 'pause' && w.phase !== 'banner')) return 'bad-phase';
  if (w.wave < t2.unlockWave) return 'locked';
  if (w.scrap < t2.cost) return 'no-scrap';
  w.scrap -= t2.cost;
  w.wallTier = 2;
  w.wallMaxHp = t2.hp;
  w.wallHp = Math.min(t2.hp, w.wallHp + t2.hp * t2.upgradeHealFraction);
  return 'ok';
}

/** Player action (M4 Module C): upgrade every Tower (existing and future) to tier 2 between waves, once, after the unlock wave. */
export function upgradeTower(w: World): 'ok' | 'locked' | 'owned' | 'no-scrap' | 'bad-phase' {
  const t2 = w.data.config.world.towerTier2;
  if (w.towerTier === 2) return 'owned';
  if (w.status !== 'playing' || (w.phase !== 'pause' && w.phase !== 'banner')) return 'bad-phase';
  if (w.wave < t2.unlockWave) return 'locked';
  if (w.scrap < t2.cost) return 'no-scrap';
  w.scrap -= t2.cost;
  w.towerTier = 2;
  return 'ok';
}

/** Player action (M4 Module A): during a wave, pay Scrap to refill every deploy charge to max. Has its own cooldown. */
/** True when every unlocked deploy charge is already full (locked units such as the Sniper before their wave do not count). The HUD reads this too. */
export function reinforceFull(w: World): boolean {
  for (const u of w.data.units) {
    if (u.team !== 'player' || u.cost !== undefined) continue;
    if (u.unlockWave !== undefined && w.wave < u.unlockWave) continue;
    if (w.charges[u.id].count < u.maxCharges!) return false;
  }
  return true;
}

export function reinforce(w: World): 'ok' | 'no-scrap' | 'cooldown' | 'bad-phase' | 'full' {
  const r = w.data.config.world.reinforce;
  if (w.status !== 'playing' || w.phase !== 'fighting') return 'bad-phase';
  if (w.reinforceCd > 0) return 'cooldown';
  if (reinforceFull(w)) return 'full'; // nothing to refill: never spend Scrap or start the cooldown
  if (w.scrap < r.cost) return 'no-scrap';
  w.scrap -= r.cost;
  w.reinforceCd = r.cooldown;
  for (const u of w.data.units) {
    if (u.team !== 'player' || u.cost !== undefined) continue;
    if (u.unlockWave !== undefined && w.wave < u.unlockWave) continue; // never grant a locked unit's charge early
    const c = w.charges[u.id];
    c.count = u.maxCharges!;
    c.timer = 0;
  }
  return 'ok';
}

/** Player action: end the between-wave pause early. Does not touch charges or timers. */
export function skipPause(w: World): boolean {
  if (w.status !== 'playing' || w.phase !== 'pause') return false;
  w.phaseTimer = 0;
  return true;
}

export type BuildResult = 'ok' | 'no-scrap' | 'built' | 'game-over' | 'entity-cap';

/** Slots a costed structure can occupy at once: its own purchase plus the configured extra slots. */
export function structureSlots(w: World): number {
  return 1 + w.data.config.world.towerExtraSlotCosts.length;
}

/** Scrap price of the next slot of this structure, or null when every slot is built. Slot 1 costs the unit's own cost. */
export function nextStructureCost(w: World, kind: string): number | null {
  const def = unitDef(w, kind);
  if (def.cost === undefined) return null;
  const alive = w.entities.filter((e) => !e.dead && e.kind === kind).length;
  if (alive >= structureSlots(w)) return null;
  return alive === 0 ? def.cost : w.data.config.world.towerExtraSlotCosts[alive - 1];
}

/** Player action: build a Scrap structure (the Tower). Slots are capped (see towerExtraSlotCosts); each slot has its own price. */
export function buildStructure(w: World, kind: string): BuildResult {
  if (w.status !== 'playing') return 'game-over';
  const def = unitDef(w, kind);
  if (def.cost === undefined) return 'game-over';
  const cost = nextStructureCost(w, kind);
  if (cost === null) return 'built';
  if (w.scrap < cost) return 'no-scrap';
  if (!spawn(w, kind, holdX(w, kind))) return 'entity-cap';
  w.scrap -= cost;
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
