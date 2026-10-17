import type { WaveDef } from './types';

// M1 waves, retune v3 from the Game Designer (shambler only).
export const waves: WaveDef[] = [
  { payout: 20, groups: [{ kind: 'shambler', count: 8, interval: 2.0, delay: 0 }] },
  { payout: 30, groups: [{ kind: 'shambler', count: 14, interval: 1.5, delay: 0 }] },
  // Retune v3: 18 shamblers in 2 groups of 9 at 1.3s spacing. Last spawn of group 1 at 10.4s, plus the 10s gap, so delay 20.4.
  {
    payout: 50,
    groups: [
      { kind: 'shambler', count: 9, interval: 1.3, delay: 0 },
      { kind: 'shambler', count: 9, interval: 1.3, delay: 20.4 },
    ],
  },
];
