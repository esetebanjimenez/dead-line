// Headless balance runner: `pnpm sim`. Runs bot strategies many times with seeded randomness (bots only; the sim is deterministic).
import { gameData } from '../src/data';
import { buildStructure, createWorld, deploy, reinforce, repairWall, step, upgradeTower, upgradeWall, type World } from '../src/sim';

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

// Smart + Sniper: as smart, plus both Sniper slots held after wave 3 (Designer spec v0.1).
const smartSniper: Bot = (w, r) => {
  smart(w, r);
  // Holds both Sniper slots (maxAlive 2): deploys whenever a charge is ready and a slot is free (tryDeploy enforces the cap).
  if (w.wave >= 3) deploy(w, 'sniper');
};

// Smart + Sniper + wall tier 2: buys the wall upgrade as soon as it can afford it after wave 3 (the upgrade also fully repairs).
const smartT2: Bot = (w, r) => {
  upgradeWall(w);
  // M4 Module C: once the wall is tier 2 and a Tower stands, buy Tower tier 2 whenever affordable (the Tower upgrade applies to every Tower).
  if (w.wallTier === 2 && w.entities.some((e) => e.kind === 'tower' && !e.dead)) upgradeTower(w);
  // M4 Module A: Reinforce when running low (<= 2 ready charges across the units it can use) and not saving for the wall upgrade.
  if (w.phase === 'fighting' && !(w.wallTier !== 2 && w.wave >= gameData.config.world.wallTier2.unlockWave)) {
    let ready = 0;
    for (const u of gameData.units)
      if (u.team === 'player' && u.cost === undefined && (u.unlockWave === undefined || w.wave >= u.unlockWave))
        ready += w.charges[u.id].count;
    if (ready <= 2) reinforce(w);
  }
  smartSniper(w, r);
};

// Mix + wall tier 2: same random deploys, but buys the wall upgrade after wave 3 when it can.
const mixT2: Bot = (w, r) => {
  upgradeWall(w);
  mix(w, r);
};

function play(bot: Bot, seed: number) {
  const w = createWorld(gameData);
  const r = rng(seed);
  let minWall = 1;
  const waveWall: number[] = [];
  const shieldDeaths: number[] = gameData.waves.map(() => 0);
  const dead = new Set<number>();
  const lost: number[] = gameData.waves.map(() => 0); // player units lost per wave
  const lostSeen = new Set<number>();
  const peakScrapW: number[] = gameData.waves.map(() => 0);
  const peakEnt: number[] = gameData.waves.map(() => 0);
  const ramBorn = new Map<number, number>();
  const ramTimes: number[][] = gameData.waves.map(() => []); // seconds from spawn to reaching the wall, per wave
  const ramReached = new Set<number>();
  for (let t = 0; w.status === 'playing' && t < 30 * 1800; t++) {
    bot(w, r);
    // All bots spend Scrap on wall repair between waves (spam never repairs).
    if (bot !== spam) {
      repairWall(w);
      // Smart builds the Tower once the wall is full and it has the Scrap.
      // The tier 2 bot saves for the wall upgrade first (the Tower comes after).
      const saving = bot === smartT2 && w.wallTier !== 2 && w.wave >= gameData.config.world.wallTier2.unlockWave;
      if ((bot === smart || bot === smartSniper || bot === smartT2) && w.wallHp >= w.wallMaxHp && !saving) buildStructure(w, 'tower');
    }
    step(w);
    peakScrapW[w.wave] = Math.max(peakScrapW[w.wave], w.scrap);
    peakEnt[w.wave] = Math.max(peakEnt[w.wave], w.entities.length);
    for (const e of w.entities) {
      if (e.team === 'player' && e.def.cost === undefined && e.dead && !lostSeen.has(e.id)) {
        lostSeen.add(e.id);
        lost[w.wave]++;
      }
      if (e.kind === 'ram') {
        if (!ramBorn.has(e.id)) ramBorn.set(e.id, w.time);
        if (!ramReached.has(e.id) && e.x - e.def.range <= gameData.config.world.wallX + 1) {
          ramReached.add(e.id);
          ramTimes[w.wave].push(w.time - ramBorn.get(e.id)!);
        }
      }
    }
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
    lost,
    peakScrapW,
    peakEnt,
    ramTimes,
    status: w.status,
    wave: w.wave + 1,
    wallPct: Math.round((100 * w.wallHp) / w.wallMaxHp),
    minWall,
    scrap: w.scrap,
    time: w.time,
  };
}

const N = 200;
const SIM_ONLY = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SIM_ONLY; // e.g. SIM_ONLY=smart+sniper+t2 pnpm sim
const deterministic = new Set<Bot>([spam, smart, smartSniper, smartT2]); // no randomness: every run is identical, so a few runs suffice
for (const [name, bot] of [
  ['spam', spam],
  ['mix', mix],
  ['mix+t2', mixT2],
  ['smart', smart],
  ['smart+sniper', smartSniper],
  ['smart+sniper+t2', smartT2],
] as const) {
  if (SIM_ONLY && !SIM_ONLY.split(',').includes(name)) continue;
  const N_RUNS = deterministic.has(bot) ? 5 : N;
  const res = Array.from({ length: N_RUNS }, (_, i) => play(bot, i + 1));
  const wins = res.filter((x) => x.status === 'won').length;
  const winsWall30 = res.filter((x) => x.status === 'won' && x.wallPct >= 30).length;
  const avgWave = (res.reduce((a, x) => a + x.wave, 0) / N_RUNS).toFixed(2);
  console.log(
    `${name.padEnd(6)} runs=${N_RUNS} win%=${((100 * wins) / N_RUNS).toFixed(0)} win&wall>=30%=${((100 * winsWall30) / N_RUNS).toFixed(0)} avgFinalWave=${avgWave} avgWallPct=${(res.reduce((a, x) => a + x.wallPct, 0) / N_RUNS).toFixed(0)} avgScrap=${(res.reduce((a, x) => a + x.scrap, 0) / N_RUNS).toFixed(0)} avgTime=${(res.reduce((a, x) => a + x.time, 0) / N_RUNS).toFixed(0)}s`,
  );
  const avgOf = (f: (x: (typeof res)[number]) => number) => res.reduce((a, x) => a + f(x), 0) / N_RUNS;
  const ramT = (k: number) => {
    const t = res.flatMap((x) => x.ramTimes[k]);
    return t.length
      ? t
          .slice(0, 6)
          .map((v) => v.toFixed(0) + 's')
          .join('/')
      : '-';
  };
  for (let k = 0; k < gameData.waves.length; k++) {
    const reached = res.filter((x) => x.waveWall[k] !== undefined);
    const avg = reached.length ? reached.reduce((a, x) => a + x.waveWall[k], 0) / reached.length : 0;
    console.log(
      `   wave ${k + 1}: cleared=${((100 * reached.length) / N_RUNS).toFixed(0)}% avgWallAfter=${avg.toFixed(0)}% shieldDeaths=${avgOf((x) => x.shieldDeaths[k]).toFixed(1)} unitsLost=${avgOf((x) => x.lost[k]).toFixed(1)} peakScrap=${Math.max(...res.map((x) => x.peakScrapW[k])).toFixed(0)} peakEntities=${Math.max(...res.map((x) => x.peakEnt[k]))} ramToWall=${ramT(k)}`,
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
