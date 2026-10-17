import type { WaveDef } from './types';

// M1 waves from the Game Designer (shambler only).
export const waves: WaveDef[] = [
  { payout: 20, groups: [{ kind: 'shambler', count: 8, interval: 2.5, delay: 0 }] },
  { payout: 30, groups: [{ kind: 'shambler', count: 14, interval: 2.0, delay: 0 }] },
  // Two groups of 10 at 1.6s spacing. The first group's last spawn is at 9 * 1.6 = 14.4s, plus the 10s gap = 24.4s.
  {
    payout: 50,
    groups: [
      { kind: 'shambler', count: 10, interval: 1.6, delay: 0 },
      { kind: 'shambler', count: 10, interval: 1.6, delay: 24.4 },
    ],
  },
];
