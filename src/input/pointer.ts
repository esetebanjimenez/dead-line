/** One input path for touch and mouse: pointer events only. */
export function onPress(el: HTMLElement, fn: () => void): void {
  el.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    fn();
  });
}
