import type { World } from '../sim';

/** Toggle with the P key. Shows fps, entity count against the cap, and sim step cost. */
export class PerfOverlay {
  private el = document.getElementById('perf')!;
  private frames = 0;
  private last = performance.now();
  private fps = 0;
  simMs = 0;
  constructor() {
    if (new URLSearchParams(location.search).has('perf')) this.el.style.display = 'block'; // touch-friendly: add ?perf to the URL
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'p') this.el.style.display = this.el.style.display === 'block' ? 'none' : 'block';
    });
  }
  frame(w: World, views?: { active: number; pooled: number }): void {
    this.frames++;
    const now = performance.now();
    if (now - this.last >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.last));
      this.frames = 0;
      this.last = now;
      if (this.el.style.display === 'block') {
        const alive = w.entities.filter((e) => !e.dead).length + w.stress.length;
        this.el.textContent = `fps ${this.fps}\nentities ${alive}/${w.data.config.world.entityCap}\nsim ${this.simMs.toFixed(2)} ms/tick${views ? `\nviews ${views.active} active, ${views.pooled} pooled (${views.active + views.pooled} total)` : ''}${w.stress.length ? `\nSTRESS ${w.stress.length}` : ''}`;
      }
    }
  }
}
