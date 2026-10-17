/** Slot ids in button order; slot i is bound to the key String(i + 1). */
export function keyToSlot(key: string, slots: readonly string[]): string | null {
  if (!/^[1-9]$/.test(key)) return null;
  return slots[Number(key) - 1] ?? null;
}

export function slotKeyLabel(slotId: string, slots: readonly string[]): string {
  const i = slots.indexOf(slotId);
  return i < 0 ? '' : String(i + 1);
}
