import type { WaveDef, WaveGroup } from './types';

/** Spreads `count` spawns of one kind evenly between two times (a single spawn lands at `from`). */
function spread(kind: string, count: number, from: number, to: number): WaveGroup {
  return { kind, count, interval: count > 1 ? Math.round(((to - from) / (count - 1)) * 100) / 100 : 1, delay: from };
}

function buildWave(n: number, payout: number, counts: Record<string, number>): WaveDef {
  const window = 42 + 5 * (n - 6);
  const third = Math.round(window * (2 / 3));
  const groups: WaveGroup[] = [];
  const add = (kind: string, from: number, to: number) => {
    if (counts[kind]) groups.push(spread(kind, counts[kind]!, from, to));
  };
  add('shambler', 0, window - 6);
  add('runner', 6, window - 10);
  add('spitter', 10, window - 8);
  add('brute', Math.round(window * 0.45), window - 4);
  add('ram', third, window);
  return { payout, groups };
}

// M1 waves, retune v5 from the Game Designer (shambler only).
export const waves: WaveDef[] = [
  { payout: 20, groups: [{ kind: 'shambler', count: 6, interval: 2.5, delay: 0 }] },
  { payout: 30, groups: [{ kind: 'shambler', count: 11, interval: 1.8, delay: 0 }] },
  // Retune v5: 16 shamblers in 2 groups of 8 at 1.6s spacing. Group 1's last spawn is at 11.2s, plus the 10s gap, so delay 21.2.
  {
    payout: 50,
    groups: [
      { kind: 'shambler', count: 8, interval: 1.6, delay: 0 },
      { kind: 'shambler', count: 8, interval: 1.6, delay: 21.2 },
    ],
  },
  // M2 waves 4 to 6 (Kingdom ids: shambler = Footman, runner = Light Cavalry, brute = Hammer Knight, spitter = Fire Archer).
  {
    payout: 70,
    groups: [
      { kind: 'shambler', count: 10, interval: 1.5, delay: 0 },
      { kind: 'runner', count: 4, interval: 3, delay: 8 },
    ],
  },
  {
    payout: 90,
    groups: [
      { kind: 'shambler', count: 12, interval: 1.5, delay: 0 },
      { kind: 'spitter', count: 3, interval: 4, delay: 6 },
      { kind: 'brute', count: 1, interval: 1, delay: 14 },
    ],
  },
  // Wave 6 (smaller, Designer request): composition is a programmer assumption: footman rush, cavalry, archer screen, then the Hammer Knight push.
  {
    payout: 120,
    groups: [
      { kind: 'shambler', count: 6, interval: 1.4, delay: 0 },
      { kind: 'runner', count: 3, interval: 2.5, delay: 6 },
      { kind: 'shambler', count: 6, interval: 1.4, delay: 20 },
      { kind: 'spitter', count: 2, interval: 3, delay: 24 },
      { kind: 'shambler', count: 4, interval: 1.4, delay: 38 },
      { kind: 'brute', count: 1, interval: 1, delay: 42 },
    ],
  },
  // M3 waves 7 to 10 (Designer spec v0.1 Module A). Window = wave 6 window (42s) + 5s per wave; Rams in the back third, staggered.
  buildWave(7, 138, { shambler: 12, runner: 4, spitter: 3, brute: 1 }),
  buildWave(8, 159, { shambler: 12, runner: 5, spitter: 3, brute: 2, ram: 1 }),
  buildWave(9, 183, { shambler: 10, runner: 5, spitter: 3, brute: 2, ram: 1 }),
  buildWave(10, 210, { shambler: 14, runner: 6, spitter: 3, brute: 2, ram: 3 }),
];
