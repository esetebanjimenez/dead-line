import { Application, Container, Graphics } from 'pixi.js';
import type { Entity, World } from '../sim';

interface View { root: Container; body: Graphics; bar: Graphics; used: boolean }

/** Placeholder renderer: coloured boxes with health bars. Reads sim state only. */
export class Renderer {
  app = new Application();
  private world!: Container;
  private views = new Map<number, View>();
  private pool: View[] = [];
  private wall = new Graphics();
  private base = new Graphics();
  private lw = 1000;
  private lh = 400;

  async init(host: HTMLElement, w: World): Promise<void> {
    this.lw = w.data.config.world.width;
    this.lh = w.data.config.world.height;
    await this.app.init({ background: 0x5fa83a, resizeTo: host, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    this.world = new Container();
    this.app.stage.addChild(this.world);
    const g = new Graphics();
    const gy = w.data.config.world.groundY;
    g.rect(0, gy - 10, this.lw, this.lh - gy + 10).fill(0x3f7f2e);
    g.rect(0, gy + 6, this.lw, 40).fill(0xa8a39a);
    g.rect(w.data.config.world.spawnX - 60, 0, 60, this.lh).fill({ color: 0x6a4a7c, alpha: 0.12 });
    this.world.addChild(g, this.base, this.wall);
    this.base.rect(w.data.config.world.baseX - 30, gy - 70, 36, 76).fill(0x7c8fa3).stroke({ color: 0x222222, width: 2 });
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
    if (v) { v.root.visible = true; return v; }
    const root = new Container();
    const body = new Graphics();
    const bar = new Graphics();
    root.addChild(body, bar);
    this.world.addChild(root);
    return { root, body, bar, used: true };
  }

  private build(v: View, e: Entity): void {
    const d = e.def;
    v.body.clear();
    v.body.rect(-d.width / 2, -d.height, d.width, d.height).fill(d.color).stroke({ color: 0x222222, width: 2 });
    if (e.team === 'player') v.body.rect(-d.width / 2, -d.height, d.width, 5).fill(0xd8343a); // team red band
    else v.body.circle(-4, -d.height + 10, 3).fill(0xd8343a); // zombie eye
  }

  render(w: World, alpha: number): void {
    const gy = w.data.config.world.groundY;
    for (const v of this.views.values()) v.used = false;
    for (const e of w.entities) {
      let v = this.views.get(e.id);
      if (!v) { v = this.acquire(); this.build(v, e); this.views.set(e.id, v); }
      v.used = true;
      const x = e.prevX + (e.x - e.prevX) * alpha;
      v.root.position.set(x, gy);
      v.root.scale.x = e.team === 'zombie' ? 1 : -1;
      v.root.alpha = e.dead ? Math.max(0, e.fade / w.data.config.feel.deathFade) : 1;
      v.body.alpha = e.hitFlash > 0 ? 0.55 : 1;
      v.bar.clear();
      if (!e.dead && e.hp < e.maxHp) {
        const bw = Math.max(20, e.def.width);
        v.bar.rect(-bw / 2, -e.def.height - 9, bw, 4).fill(0x000000);
        v.bar.rect(-bw / 2, -e.def.height - 9, bw * Math.max(0, e.hp / e.maxHp), 4).fill(e.team === 'player' ? 0x6bd36b : 0xd8343a);
      }
    }
    for (const [id, v] of this.views) {
      if (!v.used) { v.root.visible = false; this.pool.push(v); this.views.delete(id); }
    }
    const cfg = w.data.config.world;
    const f = w.wallHp / w.wallMaxHp;
    this.wall.clear();
    if (w.wallHp > 0) {
      const h = 60 + 20 * f;
      this.wall.rect(cfg.wallX - 8, gy - h, 16, h).fill(f > 0.66 ? 0xc9a96b : f > 0.33 ? 0xb08d55 : 0x8a6b3e).stroke({ color: 0x222222, width: 2 });
    }
  }
}
