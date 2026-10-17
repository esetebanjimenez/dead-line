import { Application, Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { BAND_NEAR_Y, CANVAS_H, CANVAS_W, MAX_JITTER_X, X_SCALE, BAND_FAR_Y, depthOf, poseOf, project, wallClearance } from './project';
import { computePressure, type Entity, type World } from '../sim';

interface View {
  root: Container;
  body: Graphics;
  bar: Graphics;
  sprite: Sprite;
  used: boolean;
}

/** Placeholder renderer: coloured boxes with health bars. Reads sim state only. */
export class Renderer {
  app = new Application();
  private world!: Container;
  private views = new Map<number, View>();
  private pool: View[] = [];
  private wall = new Graphics();
  private wallSprites: Sprite[] = [];
  private base = new Graphics();
  private pressure = new Graphics();
  private fx = new Graphics();
  private lw = CANVAS_W;
  private lh = CANVAS_H;
  private tex = new Map<string, Texture>();

  private async loadArt(): Promise<void> {
    const kinds: Record<string, string[]> = {
      rifleman: ['idle', 'walkA', 'walkB', 'attack', 'hit', 'death'],
      shield: ['idle', 'walkA', 'walkB', 'attack', 'death'],
      tower: ['idle'],
      sniper: ['idle', 'attack', 'death'],
      firearcher: ['idle', 'walkA', 'walkB', 'attack', 'death'],
      cavalry: ['idle', 'walkA', 'walkB', 'attack', 'death'],
      hammerknight: ['idle', 'walkA', 'walkB', 'attack', 'death'],
      footman: ['idle', 'walkA', 'walkB', 'attack', 'death'],
      footman2: ['idle', 'attack', 'death'],
    };
    const base = import.meta.env.BASE_URL + 'art/';
    try {
      this.tex.set('env', await Assets.load<Texture>(`${base}env_kingdom_bg.png`));
    } catch {
      /* fall back to flat ground */
    }
    try {
      this.tex.set('base', await Assets.load<Texture>(`${base}base_t1_intact_00.png`));
    } catch {
      /* fall back to the placeholder box */
    }
    for (const st of ['intact', 'damaged66', 'damaged33']) {
      const name = `wall_t1_${st}_00`;
      try {
        this.tex.set(name, await Assets.load<Texture>(`${base}${name}.png`));
      } catch {
        /* fall back to drawn palisade */
      }
    }
    for (const [k, anims] of Object.entries(kinds))
      for (const a of anims) {
        const name = `${k}_t1_${a}_00`;
        try {
          this.tex.set(name, await Assets.load<Texture>(`${base}${name}.png`));
        } catch {
          /* missing art falls back to the placeholder box */
        }
      }
  }

  /** Art key for an entity: Shamblers alternate between two skins by id. */
  private artKind(e: Entity): string {
    if (e.kind === 'spitter') return 'firearcher';
    if (e.kind === 'brute' && this.tex.has('hammerknight_t1_idle_00')) return 'hammerknight';
    if (e.kind === 'shambler' && this.tex.has('footman_t1_idle_00'))
      return e.id % 2 === 1 && this.tex.has('footman2_t1_idle_00') ? 'footman2' : 'footman';
    if (e.kind === 'runner' && this.tex.has('cavalry_t1_idle_00')) return 'cavalry';
    return e.kind;
  }

  private texFor(kind: string, pose: string): Texture | undefined {
    return this.tex.get(`${kind}_t1_${pose}_00`) ?? this.tex.get(`${kind}_t1_idle_00`);
  }

  async init(host: HTMLElement, w: World): Promise<void> {
    await this.app.init({
      background: 0x4a6847,
      resizeTo: host,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    host.appendChild(this.app.canvas);
    await this.loadArt();
    this.world = new Container();
    this.app.stage.addChild(this.world);
    const g = new Graphics();
    g.rect(0, BAND_FAR_Y - 60, this.lw, this.lh - BAND_FAR_Y + 60).fill(0x587a3e);
    g.rect(0, BAND_FAR_Y - 20, this.lw, 200).fill(0x6e8a4c);
    this.world.sortableChildren = true;
    const env = this.tex.get('env');
    if (env) {
      const bg = new Sprite(env);
      bg.width = CANVAS_W;
      bg.height = CANVAS_H;
      bg.zIndex = -10;
      this.world.addChild(bg);
      g.visible = false;
    }
    this.world.addChild(g, this.base, this.wall, this.pressure, this.fx);
    this.fx.zIndex = 5000;
    const baseTex = this.tex.get('base');
    if (baseTex) {
      const bs = new Sprite(baseTex);
      bs.anchor.set(0.5, 1);
      // Keep the whole gate on screen: centre it at least half its width from the left edge.
      bs.position.set(Math.max(w.data.config.world.baseX * X_SCALE, baseTex.width / 2 + 4), 575);
      this.world.addChild(bs);
    } else
      this.base
        .rect(w.data.config.world.baseX * X_SCALE - 38, 520 - 90, 46, 96)
        .fill(0x7c8fa3)
        .stroke({ color: 0x222222, width: 2 });
    this.app.renderer.on('resize', () => this.fit());
    this.fit();
  }

  private fit(): void {
    const s = Math.min(this.app.screen.width / this.lw, this.app.screen.height / this.lh);
    this.world.scale.set(s);
    this.world.position.set((this.app.screen.width - this.lw * s) / 2, (this.app.screen.height - this.lh * s) / 2 - 20);
  }

  private acquire(): View {
    const v = this.pool.pop();
    if (v) {
      v.root.visible = true;
      return v;
    }
    const root = new Container();
    const body = new Graphics();
    const bar = new Graphics();
    const sprite = new Sprite();
    sprite.anchor.set(0.5, 1);
    const shadow = new Graphics();
    shadow.ellipse(0, -2, 26, 6).fill({ color: 0x000000, alpha: 0.28 });
    root.addChild(shadow, body, sprite, bar);
    this.world.addChild(root);
    return { root, body, bar, sprite, used: true };
  }

  private build(v: View, e: Entity): void {
    const d = e.def;
    v.body.clear();
    v.body.visible = true;
    v.sprite.visible = false;
    if (this.texFor(this.artKind(e), 'idle')) {
      v.body.visible = false;
      v.sprite.visible = true;
      return;
    }
    v.body
      .rect(-d.width / 2, -d.height, d.width, d.height)
      .fill(d.color)
      .stroke({ color: 0x222222, width: 2 });
    if (e.team === 'player')
      v.body.rect(-d.width / 2, -d.height, d.width, 5).fill(0xd8343a); // team red band
    else v.body.circle(-4, -d.height + 10, 3).fill(0xd8343a); // zombie eye
  }

  /** For the perf overlay: sprite views in use and idle views waiting in the pool. */
  get viewStats(): { active: number; pooled: number } {
    return { active: this.views.size, pooled: this.pool.length };
  }

  render(w: World, alpha: number): void {
    const gy = 520;
    for (const v of this.views.values()) v.used = false;
    const list = w.stress.length ? w.entities.concat(w.stress) : w.entities;
    for (const e of list) {
      let v = this.views.get(e.id);
      if (!v) {
        v = this.acquire();
        this.build(v, e);
        this.views.set(e.id, v);
      }
      v.used = true;
      const x = e.prevX + (e.x - e.prevX) * alpha;
      const f = w.data.config.feel;
      const drop = e.waitTotal !== undefined ? 0 : (1 - Math.min(1, e.age / f.dropTime)) * f.dropHeight;
      const dep = depthOf(e.id);
      const p = project(dep, x + (((e.id * 7) % 13) / 12 - 0.5) * MAX_JITTER_X);
      if (e.team === 'zombie' || e.def.cost !== undefined) p.x += wallClearance(x, w.data.config.world.wallX); // walkers pass through the gate line without a visual jump
      v.root.position.set(p.x, p.y - drop * p.scale);
      v.root.zIndex = Math.round(p.z * 1000);
      // Sprites face right in the art. Zombies move left, so they are mirrored; player units face right.
      const face = e.team === 'zombie' ? -1 : 1;
      v.root.scale.set(p.scale * face, p.scale);
      if (v.sprite.visible) {
        const t = this.texFor(this.artKind(e), poseOf(e, w.time));
        if (t) v.sprite.texture = t;
        const bob = (e.def.speed > 0 || e.prevX !== e.x) && !e.dead ? Math.sin(w.time * 9 + e.id) * 2 : 0;
        v.sprite.y = bob;
      }
      v.root.alpha = e.dead
        ? Math.max(0, e.fade / w.data.config.feel.deathFade)
        : e.waitTotal !== undefined
          ? (e.wait ?? 0) > 0
            ? 0
            : Math.min(1, (e.age - e.waitTotal) / 0.2)
          : 1;
      v.body.alpha = v.sprite.alpha = e.hitFlash > 0 ? 0.55 : 1;
      v.bar.clear();
      if (!e.dead && e.hp < e.maxHp) {
        const bw = Math.max(20, e.def.width);
        const by = v.sprite.visible ? -(v.sprite.texture.height - 8) : -e.def.height - 9;
        v.bar.rect(-bw / 2, by, bw, 4).fill(0x000000);
        v.bar.rect(-bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), 4).fill(e.team === 'player' ? 0x6bd36b : 0xd8343a);
      }
    }
    for (const [id, v] of this.views) {
      if (!v.used) {
        v.root.visible = false;
        this.pool.push(v);
        this.views.delete(id);
      }
    }
    const cfg = w.data.config.world;
    // Pressure cue: red glow on the wall plus a row-edge arrow that brightens as zombies close in.
    const pr = computePressure(w);
    this.pressure.clear();
    if (w.status === 'playing' && pr.level > 0) {
      const col = pr.urgent ? 0xff2a2a : 0xffb02a;
      if (w.wallHp > 0) this.pressure.ellipse(cfg.wallX * X_SCALE, gy, 40, 120).fill({ color: 0xff2a2a, alpha: 0.15 + 0.45 * pr.level });
      const pulse = pr.urgent ? 0.8 + 0.2 * Math.sin(w.time * 14) : 1;
      const ax = this.lw - 24;
      const ay = gy - 20;
      this.pressure
        .poly([ax - 26, ay, ax + 8, ay - 20, ax + 8, ay + 20])
        .fill({ color: col, alpha: (0.3 + 0.7 * pr.level) * pulse })
        .stroke({ color: 0x222222, width: 2 });
    }
    // Fire Archer effects: burning patches span the whole band depth; the telegraph arc ends at the target's drawn position.
    this.fx.clear();
    for (const pd of w.puddles) {
      const k = 1 - pd.age / pd.ttl;
      const cx = pd.x * X_SCALE + wallClearance(pd.x, w.data.config.world.wallX);
      const hw = pd.halfWidth * X_SCALE;
      const mid = (BAND_NEAR_Y + BAND_FAR_Y) / 2;
      this.fx
        .ellipse(cx, mid + 8, hw, (BAND_NEAR_Y - BAND_FAR_Y) / 2 + 12)
        .fill({ color: 0xff7a1a, alpha: 0.18 + 0.32 * k })
        .stroke({ color: 0xffc040, width: 2, alpha: 0.5 * k });
    }
    for (const e of w.entities) {
      if (e.dead || !e.def.puddle || e.windupLeft < 0 || e.aimId === undefined) continue;
      const a = this.views.get(e.id);
      const b = this.views.get(e.aimId);
      if (!a || !b) continue;
      const k = 1 - Math.max(0, e.windupLeft) / e.def.windup;
      const sx = a.root.position.x;
      const sy = a.root.position.y - 20;
      const tx = b.root.position.x;
      const ty = b.root.position.y;
      const cx = (sx + tx) / 2;
      const cy = Math.min(sy, ty) - 90;
      this.fx
        .moveTo(sx, sy)
        .quadraticCurveTo(cx, cy, tx, ty)
        .stroke({ color: 0xffd23a, width: 3, alpha: 0.35 + 0.5 * k });
      this.fx.circle(tx, ty, 8 + 10 * k).stroke({ color: 0xff8a1a, width: 2, alpha: 0.5 + 0.4 * k });
    }
    const f = w.wallHp / w.wallMaxHp;
    this.wall.clear();
    const wx = cfg.wallX * X_SCALE;
    const top = BAND_FAR_Y - 30;
    const bot = 655;
    // Frontline marker: a sandbag line where Shield troopers land.
    for (let y = top + 20; y < bot; y += 44) this.wall.roundRect(wx + 40, y, 26, 8, 4).fill({ color: 0xb79c6a, alpha: 0.7 });

    const wst = f <= 0.33 ? 'damaged33' : f <= 0.66 ? 'damaged66' : 'intact';
    const wtex = this.tex.get(`wall_t1_${wst}_00`);
    if (wtex) {
      const rows = [1, 0.5, 0];
      while (this.wallSprites.length < rows.length) {
        const sp = new Sprite();
        sp.anchor.set(0.5, 1);
        this.world.addChild(sp);
        this.wallSprites.push(sp);
      }
      const fe = w.data.config.feel;
      const sx = w.wallShake > 0 ? (Math.floor(w.time * 60) % 2 ? fe.wallShakePx : -fe.wallShakePx) : 0;
      rows.forEach((d, i) => {
        const p = project(d, cfg.wallX);
        const sp = this.wallSprites[i]!;
        sp.visible = w.wallHp > 0;
        sp.texture = wtex;
        sp.position.set(p.x + sx, p.y + 6);
        sp.scale.set(p.scale);
        sp.zIndex = Math.round(p.z * 1000) + 1;
        if (w.wallHp > 0) this.wall.ellipse(p.x, p.y + 4, 70 * p.scale, 9 * p.scale).fill({ color: 0x000000, alpha: 0.25 });
      });
    } else if (w.wallHp > 0) {
      const fe = w.data.config.feel;
      const sx = w.wallShake > 0 ? (Math.floor(w.time * 60) % 2 ? fe.wallShakePx : -fe.wallShakePx) : 0;
      const x0 = wx - 12 + sx;
      const h = bot - top;
      // Band-wide palisade: front face plus a lighter top face.
      this.wall.rect(x0, top, 24, h).fill(0xc9a96b).stroke({ color: 0x222222, width: 2 });
      this.wall
        .poly([x0, top, x0 + 24, top, x0 + 34, top - 14, x0 + 10, top - 14])
        .fill(0xe0c88c)
        .stroke({ color: 0x222222, width: 2 });
      for (let y = top + 30; y < bot; y += 30)
        this.wall
          .moveTo(x0, y)
          .lineTo(x0 + 24, y)
          .stroke({ color: 0x8a7040, width: 1 });
      // Crack overlays at the configured HP thresholds.
      if (f <= fe.crackThresholds[0])
        this.wall
          .moveTo(x0 + 3, top + 20)
          .lineTo(x0 + 18, top + h * 0.35)
          .lineTo(x0 + 8, top + h * 0.55)
          .lineTo(x0 + 16, top + h * 0.8)
          .stroke({ color: 0x3a2a14, width: 3 });
      if (f <= fe.crackThresholds[1])
        this.wall
          .moveTo(x0 + 20, top + h * 0.15)
          .lineTo(x0 + 6, top + h * 0.45)
          .lineTo(x0 + 18, top + h * 0.65)
          .lineTo(x0 + 8, bot - 10)
          .stroke({ color: 0x3a2a14, width: 4 });
    }
  }
}
