// Headless balance runner: `pnpm sim`. Runs bot strategies many times with seeded randomness (bots only; the sim is deterministic).
import { gameData } from '../src/data';
import { createWorld, deploy, step, type World } from '../src/sim';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

type Bot = (w: World, r: () => number) => void;
// Spam: deploys whatever it can, with no plan, picking the unit at random.
const spam: Bot = (w, r) => {
  if (r() < 0.5) deploy(w, r() < 0.5 ? 'rifleman' : 'shield');
};
// Smart: shield trooper first (front slot), riflemen behind, as soon as they are available.
const smart: Bot = (w) => {
  if (!deploy(w, 'shield')) deploy(w, 'rifleman');
};

function play(bot: Bot, seed: number) {
  const w = createWorld(gameData);
  const r = rng(seed);
  let minWall = 1;
  for (let t = 0; w.status === 'playing' && t < 30 * 1800; t++) {
    bot(w, r);
    step(w);
    if (w.wave === gameData.waves.length - 1) minWall = Math.min(minWall, w.wallHp / w.wallMaxHp);
  }
  return { status: w.status, wave: w.wave + 1, wallPct: Math.round((100 * w.wallHp) / w.wallMaxHp), minWall, scrap: w.scrap, time: w.time };
}

const N = 200;
for (const [name, bot] of [
  ['spam', spam],
  ['smart', smart],
] as const) {
  const res = Array.from({ length: N }, (_, i) => play(bot, i + 1));
  const wins = res.filter((x) => x.status === 'won').length;
  const winsWall30 = res.filter((x) => x.status === 'won' && x.wallPct >= 30).length;
  const avgWave = (res.reduce((a, x) => a + x.wave, 0) / N).toFixed(2);
  console.log(
    `${name.padEnd(6)} runs=${N} win%=${((100 * wins) / N).toFixed(0)} win&wall>=30%=${((100 * winsWall30) / N).toFixed(0)} avgFinalWave=${avgWave} avgWallPct=${(res.reduce((a, x) => a + x.wallPct, 0) / N).toFixed(0)} avgScrap=${(res.reduce((a, x) => a + x.scrap, 0) / N).toFixed(0)} avgTime=${(res.reduce((a, x) => a + x.time, 0) / N).toFixed(0)}s`,
  );
}
