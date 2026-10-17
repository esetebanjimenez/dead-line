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
// Smart (Shield-front): 2 Shield troopers first, then Riflemen. The last Shield charge is held until the wall or a Shield is below 50% HP.
const smart: Bot = (w) => {
  const shields = w.entities.filter((e) => e.kind === 'shield' && !e.dead);
  if (shields.length < 2) {
    if (deploy(w, 'shield')) return;
  }
  if (deploy(w, 'rifleman')) return;
  const hurt = w.wallHp / w.wallMaxHp < 0.5 || shields.some((e) => e.hp / e.maxHp < 0.5);
  if (shields.length >= 2 && (hurt || w.charges['shield'].count > 1)) deploy(w, 'shield');
};

function play(bot: Bot, seed: number) {
  const w = createWorld(gameData);
  const r = rng(seed);
  let minWall = 1;
  const waveWall: number[] = [];
  let prev = 0;
  for (let t = 0; w.status === 'playing' && t < 30 * 1800; t++) {
    bot(w, r);
    step(w);
    while (prev < w.wave) waveWall[prev++] = (100 * w.wallHp) / w.wallMaxHp;
    if (w.wave === gameData.waves.length - 1) minWall = Math.min(minWall, w.wallHp / w.wallMaxHp);
  }
  if (w.status === 'won') waveWall[w.wave] = (100 * w.wallHp) / w.wallMaxHp;
  return {
    waveWall,
    status: w.status,
    wave: w.wave + 1,
    wallPct: Math.round((100 * w.wallHp) / w.wallMaxHp),
    minWall,
    scrap: w.scrap,
    time: w.time,
  };
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
  for (let k = 0; k < gameData.waves.length; k++) {
    const reached = res.filter((x) => x.waveWall[k] !== undefined);
    const avg = reached.length ? reached.reduce((a, x) => a + x.waveWall[k], 0) / reached.length : 0;
    console.log(`   wave ${k + 1}: cleared=${((100 * reached.length) / N).toFixed(0)}% avgWallAfter=${avg.toFixed(0)}%`);
  }
}
