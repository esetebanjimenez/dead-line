import type { WaveDef } from './types';

// M1 waves, retune v2 from the Game Designer (shambler only).
export const waves: WaveDef[] = [
  { payout: 20, groups: [{ kind: 'shambler', count: 8, interval: 2.0, delay: 0 }] },
  { payout: 30, groups: [{ kind: 'shambler', count: 14, interval: 1.5, delay: 0 }] },
  // Two groups of 12 at 1.0s spacing. The first group's last spawn is at 11s, plus the 8s gap = 19s.
  {
    payout: 50,
    groups: [
      { kind: 'shambler', count: 12, interval: 1.0, delay: 0 },
      { kind: 'shambler', count: 12, interval: 1.0, delay: 19 },
    ],
  },
];
