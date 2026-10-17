import type { World } from '../sim';
import {
  nextStructureCost,
  tryDeploy,
  repairWall,
  buildStructure,
  skipPause,
  upgradeWall,
  upgradeTower,
  reinforce,
  reinforceFull,
} from '../sim';
import { onPress } from '../input/pointer';
import { keyToSlot } from './keys';

export class Hud {
  private buttons = new Map<string, { el: HTMLButtonElement; n: HTMLElement; fill: HTMLElement }>();
  private bannerEl = document.getElementById('banner')!;
  private endEl = document.getElementById('end')!;
  private lastWave = -1;
  private skip!: { el: HTMLButtonElement; n: HTMLElement };
  private tower?: { el: HTMLButtonElement; n: HTMLElement; id: string };
  private towerUp!: { el: HTMLButtonElement; n: HTMLElement };
  private upgrade!: { el: HTMLButtonElement; n: HTMLElement };
  private reinforceBtn!: { el: HTMLButtonElement; fill: HTMLElement; label: HTMLElement };
  private disabled = new Set<string>(); // slot ids whose button is dimmed: clicks and hotkeys are ignored
  private repair!: { el: HTMLButtonElement; n: HTMLElement };

  constructor(
    private getWorld: () => World,
    onRestart: () => void,
  ) {
    const hud = document.getElementById('hud')!;
    const w = getWorld();
    // Base-safe art URLs (dev and the /dead-line/ production build): index.html can't use BASE_URL, so wire the Scrap icons here.
    const base = import.meta.env.BASE_URL;
    document.documentElement.style.setProperty('--scrap-small', `url(${base}art/icon_scrap_small_00.png)`);
    const scrapIcon = document.getElementById('scrapicon') as HTMLImageElement | null;
    if (scrapIcon) {
      scrapIcon.srcset = `${base}art/icon_scrap_00.png 1x, ${base}art/icon_scrap_00@2x.png 2x`;
      scrapIcon.src = `${base}art/icon_scrap_00.png`;
    }
    const playerUnits = w.data.units.filter((x) => x.team === 'player' && x.cost === undefined);
    const towerDef = w.data.units.find((x) => x.cost !== undefined);
    const slots = [...playerUnits.map((x) => x.id), ...(towerDef ? [towerDef.id] : []), 'reinforce'];
    const slotActions = new Map<string, () => void>();
    window.addEventListener('keydown', (e) => {
      const id = keyToSlot(e.key, slots, this.disabled);
      if (id) slotActions.get(id)?.();
    });
    for (const u of playerUnits) {
      const el = document.createElement('button');
      el.className = 'deploy';
      el.innerHTML = `<div class="fill"></div><span>${u.name}</span><span class="n"></span><span data-k style="font-size:10px">[${slots.indexOf(u.id) + 1}]</span>`;
      el.style.backgroundImage = `url(${import.meta.env.BASE_URL}art/icon_${u.id}_00.png)`;
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
      slotActions.set(u.id, press);
      hud.appendChild(el);
      this.buttons.set(u.id, { el, n, fill });
    }
    const tw = w.data.units.find((x) => x.cost !== undefined);
    if (tw) {
      const tb = document.createElement('button');
      tb.className = 'deploy';
      tb.innerHTML = `<span>${tw.name}</span><span class="n cost">${tw.cost}</span><span data-k style="font-size:10px">[${slots.indexOf(tw.id) + 1}]</span>`;
      tb.style.backgroundImage = `url(${import.meta.env.BASE_URL}art/icon_${tw.id}_00.png)`;
      const build = () => {
        if (buildStructure(this.getWorld(), tw.id) !== 'ok') {
          tb.classList.remove('shake');
          void tb.offsetWidth;
          tb.classList.add('shake');
        }
      };
      onPress(tb, build);
      slotActions.set(tw.id, build);
      hud.appendChild(tb);
      this.tower = { el: tb, n: tb.querySelector('.n') as HTMLElement, id: tw.id };
    }
    const rf = w.data.config.world.reinforce;
    const rb = document.createElement('button');
    rb.className = 'deploy';
    rb.innerHTML = `<div class="fill"></div><span>Reinforce</span><span class="n cost">${rf.cost}</span><span data-k style="font-size:10px">[${slots.indexOf('reinforce') + 1}]</span>`;
    rb.style.backgroundImage = `url(${import.meta.env.BASE_URL}art/icon_reinforce_00.png)`;
    const doReinforce = () => {
      if (rb.classList.contains('empty')) return; // dimmed: ignore
      if (reinforce(this.getWorld()) !== 'ok') {
        rb.classList.remove('shake');
        void rb.offsetWidth;
        rb.classList.add('shake');
      }
    };
    onPress(rb, doReinforce);
    slotActions.set('reinforce', doReinforce);
    hud.appendChild(rb);
    this.reinforceBtn = { el: rb, fill: rb.querySelector('.fill') as HTMLElement, label: rb.querySelector('span') as HTMLElement };
    const go = document.createElement('button');
    go.className = 'deploy';
    go.style.display = 'none';
    go.innerHTML = '<span>Start wave</span><span class="n"></span><span style="font-size:10px">[Space]</span>';
    const goN = go.querySelector('.n') as HTMLElement;
    const doSkip = () => void skipPause(this.getWorld());
    onPress(go, doSkip);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') doSkip();
    });
    hud.appendChild(go);
    this.skip = { el: go, n: goN };
    const rep = document.createElement('button');
    rep.className = 'deploy';
    rep.innerHTML = '<span>Repair</span><span class="n cost"></span><span style="font-size:10px">[R]</span>';
    const repN = rep.querySelector('.n') as HTMLElement;
    const doRepair = () => void repairWall(this.getWorld());
    onPress(rep, doRepair);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') doRepair();
    });
    hud.appendChild(rep);
    this.repair = { el: rep, n: repN };
    const up = document.createElement('button');
    up.className = 'deploy';
    up.innerHTML = `<span>Wall II</span><span class="n cost">${w.data.config.world.wallTier2.cost}</span><span data-k style="font-size:10px">[U]</span>`;
    const doUpgrade = () => {
      if (upgradeWall(this.getWorld()) !== 'ok') {
        up.classList.remove('shake');
        void up.offsetWidth;
        up.classList.add('shake');
      }
    };
    onPress(up, doUpgrade);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'u' || e.key === 'U') doUpgrade();
    });
    hud.appendChild(up);
    this.upgrade = { el: up, n: up.querySelector('.n') as HTMLElement };
    const tu = document.createElement('button');
    tu.className = 'deploy';
    tu.style.backgroundImage = `url(${base}art/icon_tower_t2_00.png)`;
    tu.innerHTML = `<span>Tower II</span><span class="n cost">${w.data.config.world.towerTier2.cost}</span><span data-k style="font-size:10px">[T]</span>`;
    const doTowerUpgrade = () => {
      if (upgradeTower(this.getWorld()) !== 'ok') {
        tu.classList.remove('shake');
        void tu.offsetWidth;
        tu.classList.add('shake');
      }
    };
    onPress(tu, doTowerUpgrade);
    window.addEventListener('keydown', (e) => {
      if (e.key === 't' || e.key === 'T') doTowerUpgrade();
    });
    hud.appendChild(tu);
    this.towerUp = { el: tu, n: tu.querySelector('.n') as HTMLElement };
    onPress(document.getElementById('restart')!, onRestart);
  }

  update(w: World): void {
    for (const u of w.data.units) {
      const b = this.buttons.get(u.id);
      if (!b) continue;
      const c = w.charges[u.id];
      b.n.textContent = `${c.count}/${u.maxCharges}`;
      b.el.classList.toggle('empty', c.count === 0 || (u.unlockWave !== undefined && w.wave < u.unlockWave));
      if (u.unlockWave !== undefined) b.el.style.display = w.wave < u.unlockWave ? 'none' : '';
      b.fill.style.setProperty('--p', c.count >= u.maxCharges! ? '1' : String(c.timer / u.chargeRefill!));
    }
    if (this.tower) {
      const t = this.tower;
      const next = nextStructureCost(w, t.id); // null = every slot built
      this.tower.n.textContent = next === null ? 'Max' : String(next);
      this.tower.n.classList.toggle('cost', next !== null);
      this.tower.n.classList.toggle('lock', next === null);
      this.tower.el.classList.toggle('empty', next === null || w.scrap < next);
    }
    {
      const rf = w.data.config.world.reinforce;
      const full = w.status === 'playing' && w.phase === 'fighting' && reinforceFull(w);
      const off = w.status !== 'playing' || w.phase !== 'fighting' || w.reinforceCd > 0 || w.scrap < rf.cost || full;
      this.reinforceBtn.label.textContent = full && w.reinforceCd <= 0 ? 'Charges full' : 'Reinforce';
      this.reinforceBtn.el.classList.toggle('empty', off);
      if (off) this.disabled.add('reinforce');
      else this.disabled.delete('reinforce');
      this.reinforceBtn.fill.style.setProperty('--p', String(rf.cooldown > 0 ? 1 - w.reinforceCd / rf.cooldown : 1));
    }
    this.skip.el.style.display = w.phase === 'pause' && w.status === 'playing' ? '' : 'none';
    this.skip.n.textContent = `${Math.ceil(w.phaseTimer)}s`;
    const t2 = w.data.config.world.wallTier2;
    const t2Locked = w.wave < t2.unlockWave;
    this.upgrade.el.style.display = w.wallTier === 1 ? '' : 'none';
    this.upgrade.n.textContent = t2Locked ? `Wave ${t2.unlockWave}` : `${t2.cost}`;
    this.upgrade.n.classList.toggle('cost', !t2Locked);
    this.upgrade.n.classList.toggle('lock', t2Locked);
    this.upgrade.el.classList.toggle('empty', t2Locked || !(w.phase === 'pause' || w.phase === 'banner') || w.scrap < t2.cost);
    const tt2 = w.data.config.world.towerTier2;
    const ttLocked = w.wave < tt2.unlockWave;
    this.towerUp.el.style.display = w.towerTier === 1 ? '' : 'none';
    this.towerUp.n.textContent = ttLocked ? `Wave ${tt2.unlockWave}` : `${tt2.cost}`;
    this.towerUp.n.classList.toggle('cost', !ttLocked);
    this.towerUp.n.classList.toggle('lock', ttLocked);
    this.towerUp.el.classList.toggle('empty', ttLocked || !(w.phase === 'pause' || w.phase === 'banner') || w.scrap < tt2.cost);
    this.repair.n.textContent = `${Math.floor(w.scrap)}`;
    this.repair.el.classList.toggle('empty', !(w.phase === 'pause' || w.phase === 'banner') || w.wallHp >= w.wallMaxHp || w.scrap < 1);
    document.getElementById('scrap')!.textContent = `${Math.floor(w.scrap)}`;
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
