import type { WaveDef } from './types';

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
  // Wave 6: composition is a programmer assumption (spec says "3 mixed groups"): cavalry rush, archer screen, then the Hammer Knight push.
  {
    payout: 120,
    groups: [
      { kind: 'shambler', count: 8, interval: 1.4, delay: 0 },
      { kind: 'runner', count: 3, interval: 2.5, delay: 6 },
      { kind: 'shambler', count: 8, interval: 1.4, delay: 20 },
      { kind: 'spitter', count: 3, interval: 3, delay: 24 },
      { kind: 'shambler', count: 6, interval: 1.4, delay: 40 },
      { kind: 'brute', count: 1, interval: 1, delay: 44 },
      { kind: 'spitter', count: 2, interval: 3, delay: 46 },
    ],
  },
];
