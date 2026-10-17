import type { UnitDef } from './types';

// PLACEHOLDER numbers for M1. The Game Designer owns balance; edit values here only.
export const units: UnitDef[] = [
  { id: 'rifleman', team: 'player', name: 'Rifleman', hp: 60, damage: 8, range: 230, attackInterval: 0.8, windup: 0.15, speed: 60, knockback: 8, holdOffset: 70, maxCharges: 4, chargeRefill: 6, color: 0x6b7f3a, width: 22, height: 34 },
  { id: 'shield', team: 'player', name: 'Shield trooper', hp: 180, damage: 6, range: 60, attackInterval: 1.0, windup: 0.2, speed: 45, knockback: 0, holdOffset: 14, maxCharges: 2, chargeRefill: 10, color: 0x7c8fa3, width: 26, height: 36 },
  { id: 'shambler', team: 'zombie', name: 'Shambler', hp: 50, damage: 6, range: 26, attackInterval: 1.2, windup: 0.4, speed: 22, knockback: 0, color: 0x9bcb3c, width: 22, height: 32 },
  { id: 'runner', team: 'zombie', name: 'Runner', hp: 30, damage: 5, range: 24, attackInterval: 0.9, windup: 0.2, speed: 55, knockback: 0, color: 0xb8e04a, width: 18, height: 30 },
  { id: 'brute', team: 'zombie', name: 'Brute', hp: 260, damage: 20, range: 34, attackInterval: 1.8, windup: 0.7, speed: 14, knockback: 0, knockbackImmune: true, color: 0x7a5a3a, width: 40, height: 52 },
];
