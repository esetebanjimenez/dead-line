import type { WaveDef } from './types';

// M1 uses one enemy type (shambler). Runner and brute are defined in units.ts for M2.
export const waves: WaveDef[] = [
  { groups: [{ kind: 'shambler', count: 6, interval: 1.6, delay: 0 }] },
  { groups: [{ kind: 'shambler', count: 10, interval: 1.3, delay: 0 }] },
  { groups: [{ kind: 'shambler', count: 8, interval: 1.2, delay: 0 }, { kind: 'shambler', count: 8, interval: 0.9, delay: 14 }] },
];
