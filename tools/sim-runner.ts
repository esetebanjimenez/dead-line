// Headless balance runner: `pnpm sim`. Runs bot strategies many times with seeded randomness (bots only; the sim is deterministic).
import { gameData } from '../src/data';
import { buildStructure, createWorld, deploy, repairWall, step, type World } from '../src/sim';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

type Bot = (w: World, r: () => number) => void;
// Spam: deploys Riflemen only, as fast as it can (the design's "careless" player).
const spam: Bot = (w) => {
  deploy(w, 'rifleman');
};
// Mix: random 50/50 between Rifleman and Shield, with no plan.
const mix: Bot = (w, r) => {
  if (r() < 0.5) deploy(w, r() < 0.5 ? 'rifleman' : 'shield');
};
// Smart (Designer's Shield-front rules v2): Shield whenever ready and fewer than 3 alive; Rifleman whenever ready once a Shield is alive. Never hold charges.
const smart: Bot = (w) => {
  const shields = w.entities.filter((e) => e.kind === 'shield' && !e.dead).length;
  if (shields < 3) deploy(w, 'shield');
  if (shields >= 1) deploy(w, 'rifleman');
};

// Smart + Sniper: as smart, plus one Sniper held after wave 3 (Designer spec v0.1).
const smartSniper: Bot = (w, r) => {
  smart(w, r);
  if (w.wave >= 3 && !w.entities.some((e) => e.kind === 'sniper' && !e.dead)) deploy(w, 'sniper');
};

function play(bot: Bot, seed: number) {
  const w = createWorld(gameData);
  const r = rng(seed);
  let minWall = 1;
  const waveWall: number[] = [];
  const shieldDeaths: number[] = gameData.waves.map(() => 0);
  const dead = new Set<number>();
  for (let t = 0; w.status === 'playing' && t < 30 * 1800; t++) {
    bot(w, r);
    // All bots spend Scrap on wall repair between waves (spam never repairs).
    if (bot !== spam) {
      repairWall(w);
      // Smart builds the Tower once the wall is full and it has the Scrap.
      if ((bot === smart || bot === smartSniper) && w.wallHp >= w.wallMaxHp) buildStructure(w, 'tower');
    }
    step(w);
    for (const e of w.entities)
      if (e.kind === 'shield' && e.dead && !dead.has(e.id)) {
        dead.add(e.id);
        shieldDeaths[w.wave]++;
      }
    if (w.phase === 'pause' && waveWall[w.wave] === undefined) waveWall[w.wave] = (100 * w.wallHp) / w.wallMaxHp;
    if (w.wave === gameData.waves.length - 1) minWall = Math.min(minWall, w.wallHp / w.wallMaxHp);
  }
  if (w.status === 'won') waveWall[w.wave] = (100 * w.wallHp) / w.wallMaxHp;
  return {
    waveWall,
    shieldDeaths,
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
  ['mix', mix],
  ['smart', smart],
  ['smart+sniper', smartSniper],
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
    console.log(
      `   wave ${k + 1}: cleared=${((100 * reached.length) / N).toFixed(0)}% avgWallAfter=${avg.toFixed(0)}% shieldDeaths=${(res.reduce((a, x) => a + x.shieldDeaths[k], 0) / N).toFixed(1)}`,
    );
  }
}

// Trace: wave 1, smart bot, seed 1.
{
  const w = createWorld(gameData);
  const r = rng(1);
  console.log('trace (smart, wave 1): t, wall HP, units alive, zombies alive, units hit so far');
  for (let t = 0; w.wave === 0 && w.phase !== 'pause' && t < 30 * 120; t++) {
    smart(w, r);
    step(w);
    if (t % 150 === 0) {
      const alive = (team: string) => w.entities.filter((e) => !e.dead && e.team === team).length;
      console.log(`  ${w.time.toFixed(1)}s wall=${w.wallHp.toFixed(0)} units=${alive('player')} zombies=${alive('zombie')}`);
    }
  }
}
