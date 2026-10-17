/** Slot ids in button order; slot i is bound to the key String(i + 1). A slot in `disabled` (dimmed button) ignores its key. */
export function keyToSlot(key: string, slots: readonly string[], disabled?: ReadonlySet<string>): string | null {
  if (!/^[1-9]$/.test(key)) return null;
  const id = slots[Number(key) - 1] ?? null;
  return id !== null && disabled?.has(id) ? null : id;
}

export function slotKeyLabel(slotId: string, slots: readonly string[]): string {
  const i = slots.indexOf(slotId);
  return i < 0 ? '' : String(i + 1);
}
