import type { World } from '../sim';

/** Toggle with the P key. Shows fps, entity count against the cap, and sim step cost. */
export class PerfOverlay {
  private el = document.getElementById('perf')!;
  private frames = 0;
  private last = performance.now();
  private fps = 0;
  simMs = 0;
  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'p') this.el.style.display = this.el.style.display === 'block' ? 'none' : 'block';
    });
  }
  frame(w: World): void {
    this.frames++;
    const now = performance.now();
    if (now - this.last >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.last));
      this.frames = 0;
      this.last = now;
      if (this.el.style.display === 'block') {
        const alive = w.entities.filter((e) => !e.dead).length;
        this.el.textContent = `fps ${this.fps}\nentities ${alive}/${w.data.config.world.entityCap}\nsim ${this.simMs.toFixed(2)} ms/tick`;
      }
    }
  }
}
