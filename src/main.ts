import { gameData, validateData } from './data';
import { createWorld, step, TICK_DT, type World } from './sim';
import { Renderer } from './render/renderer';
import { PerfOverlay } from './render/perf';
import { Hud } from './ui/hud';

async function main(): Promise<void> {
  validateData(gameData);
  let world: World = createWorld(gameData);
  const renderer = new Renderer();
  await renderer.init(document.getElementById('stage')!, world);
  const perf = new PerfOverlay();
  const hud: Hud = new Hud(
    () => world,
    () => {
      world = createWorld(gameData);
      hud.reset();
    },
  );

  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    // Clamp so a backgrounded tab does not trigger a huge catch-up burst.
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    const t0 = performance.now();
    let steps = 0;
    while (acc >= TICK_DT && steps < 5) {
      step(world);
      acc -= TICK_DT;
      steps++;
    }
    if (steps === 5) acc = 0; // drop any backlog instead of spiralling after a long stall
    if (steps) perf.simMs = (performance.now() - t0) / steps;
    renderer.render(world, Math.min(1, acc / TICK_DT));
    hud.update(world);
    perf.frame(world);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
void main();
