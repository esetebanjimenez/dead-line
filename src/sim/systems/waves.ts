import { aliveCount, spawn, type World } from '../world';

function startWave(w: World): void {
  const q = [];
  for (const g of w.data.waves[w.wave].groups) for (let i = 0; i < g.count; i++) q.push({ t: g.delay + i * g.interval, kind: g.kind });
  q.sort((a, b) => a.t - b.t);
  w.spawnQueue = q;
  w.waveClock = 0;
  w.phase = 'fighting';
}

function zombiesAlive(w: World): number {
  let n = 0;
  for (const e of w.entities) if (!e.dead && e.team === 'zombie') n++;
  return n;
}

export function waveSystem(w: World, dt: number): void {
  const p = w.data.config.pacing;
  switch (w.phase) {
    case 'banner':
      w.phaseTimer -= dt;
      if (w.phaseTimer <= 0) startWave(w);
      break;
    case 'fighting': {
      w.waveClock += dt;
      while (w.spawnQueue.length && w.spawnQueue[0].t <= w.waveClock) {
        // If at the entity cap, hold the zombie back until there is room.
        if (aliveCount(w) >= w.data.config.world.entityCap) break;
        const s = w.spawnQueue.shift()!;
        spawn(w, s.kind, w.data.config.world.spawnX);
      }
      if (w.spawnQueue.length === 0 && zombiesAlive(w) === 0) {
        w.scrap += w.data.waves[w.wave].payout;
        if (w.wave >= w.data.waves.length - 1) {
          w.phase = 'done';
          w.status = 'won';
        } else {
          w.phase = 'pause';
          w.phaseTimer = p.wavePause;
        }
      }
      break;
    }
    case 'pause':
      w.phaseTimer -= dt;
      if (w.phaseTimer <= 0) {
        w.wave++;
        w.wallHp = w.wallMaxHp; // M1 rule: the wall restores between waves (scrap repair is M2)
        w.phase = 'banner';
        w.phaseTimer = p.bannerTime;
      }
      break;
    case 'done':
      break;
  }
}
