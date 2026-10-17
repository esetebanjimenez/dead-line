import type { World } from '../sim';
import { tryDeploy, repairWall } from '../sim';
import { onPress } from '../input/pointer';

export class Hud {
  private buttons = new Map<string, { el: HTMLButtonElement; n: HTMLElement; fill: HTMLElement }>();
  private bannerEl = document.getElementById('banner')!;
  private endEl = document.getElementById('end')!;
  private lastWave = -1;
  private repair!: { el: HTMLButtonElement; n: HTMLElement };

  constructor(
    private getWorld: () => World,
    onRestart: () => void,
  ) {
    const hud = document.getElementById('hud')!;
    const w = getWorld();
    let key = 1;
    for (const u of w.data.units.filter((x) => x.team === 'player')) {
      const el = document.createElement('button');
      el.className = 'deploy';
      el.innerHTML = `<div class="fill"></div><span>${u.name}</span><span class="n"></span><span style="font-size:10px">[${key}]</span>`;
      const n = el.querySelector('.n') as HTMLElement;
      const fill = el.querySelector('.fill') as HTMLElement;
      const press = () => {
        if (tryDeploy(this.getWorld(), u.id) !== 'ok') {
          el.classList.remove('shake');
          void el.offsetWidth;
          el.classList.add('shake');
        }
      };
      onPress(el, press);
      window.addEventListener('keydown', (e) => {
        if (e.key === String(key)) press();
      });
      key++;
      hud.appendChild(el);
      this.buttons.set(u.id, { el, n, fill });
    }
    const rep = document.createElement('button');
    rep.className = 'deploy';
    rep.innerHTML = '<span>Repair</span><span class="n"></span><span style="font-size:10px">[R]</span>';
    const repN = rep.querySelector('.n') as HTMLElement;
    const doRepair = () => void repairWall(this.getWorld());
    onPress(rep, doRepair);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') doRepair();
    });
    hud.appendChild(rep);
    this.repair = { el: rep, n: repN };
    onPress(document.getElementById('restart')!, onRestart);
  }

  update(w: World): void {
    for (const u of w.data.units) {
      const b = this.buttons.get(u.id);
      if (!b) continue;
      const c = w.charges[u.id];
      b.n.textContent = `${c.count}/${u.maxCharges}`;
      b.el.classList.toggle('empty', c.count === 0);
      b.fill.style.setProperty('--p', c.count >= u.maxCharges! ? '1' : String(c.timer / u.chargeRefill!));
    }
    this.repair.n.textContent = `${Math.floor(w.scrap)}`;
    this.repair.el.classList.toggle('empty', !(w.phase === 'pause' || w.phase === 'banner') || w.wallHp >= w.wallMaxHp || w.scrap < 1);
    document.getElementById('wave')!.textContent = `${w.wave + 1}/${w.data.waves.length}`;
    (document.getElementById('wallbar') as HTMLElement).style.width = `${(100 * w.wallHp) / w.wallMaxHp}%`;
    const bf = w.baseHp / w.baseMaxHp;
    const baseBar = document.getElementById('basebar') as HTMLElement;
    baseBar.style.width = `${100 * bf}%`;
    // Red only means danger: green when healthy, amber when hurt, red below 33%.
    baseBar.style.background = bf < 0.33 ? '#d8343a' : bf < 0.7 ? '#f0a020' : '#4fb04f';
    const showBanner = w.phase === 'banner' && w.status === 'playing';
    this.bannerEl.style.display = showBanner ? 'block' : 'none';
    if (showBanner && this.lastWave !== w.wave) {
      this.lastWave = w.wave;
      const counts = new Map<string, number>();
      for (const g of w.data.waves[w.wave].groups) counts.set(g.kind, (counts.get(g.kind) ?? 0) + g.count);
      const list = [...counts].map(([k, n]) => `${n}x ${w.data.units.find((u) => u.id === k)!.name}`).join(', ');
      this.bannerEl.innerHTML = `WAVE ${w.wave + 1}<div style="font-size:16px;font-weight:700">Incoming: ${list}</div>`;
    }
    this.endEl.style.display = w.status === 'playing' ? 'none' : 'flex';
    if (w.status !== 'playing') document.getElementById('endtext')!.textContent = w.status === 'won' ? 'Line held!' : 'Base overrun';
  }

  reset(): void {
    this.lastWave = -1;
  }
}
