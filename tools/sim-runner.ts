// Headless balance runner: `pnpm sim`. Plays the data with a simple "deploy whenever possible" bot.
import { gameData } from '../src/data';
import { createWorld, deploy, step } from '../src/sim';

const w = createWorld(gameData);
let ticks = 0;
while (w.status === 'playing' && ticks < 30 * 3600) {
  deploy(w, 'shield');
  deploy(w, 'rifleman');
  step(w);
  ticks++;
}
console.log(`result=${w.status} time=${w.time.toFixed(1)}s wave=${w.wave + 1}/${gameData.waves.length} wallHp=${w.wallHp} baseHp=${w.baseHp}`);
