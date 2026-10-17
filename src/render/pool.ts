/** Generic object pool. Pure (no Pixi), so churn behaviour can be tested headless. */
export class ViewPool<T> {
  private idle: T[] = [];
  private made = 0;
  private live = 0;

  constructor(private create: () => T) {}

  acquire(): T {
    this.live++;
    const v = this.idle.pop();
    if (v) return v;
    this.made++;
    return this.create();
  }

  release(v: T): void {
    this.live--;
    this.idle.push(v);
  }

  /** Total objects ever constructed. Must stay flat once the pool is warm. */
  get created(): number {
    return this.made;
  }
  get inUse(): number {
    return this.live;
  }
  get pooled(): number {
    return this.idle.length;
  }
}
