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
];
