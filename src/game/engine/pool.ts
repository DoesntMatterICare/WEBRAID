/**
 * Fixed-capacity object pool. `active` is a dense array; release by index while
 * iterating backwards (swap-remove), so no per-frame allocation happens.
 */
export class Pool<T> {
  readonly active: T[] = [];
  private free: T[] = [];

  constructor(
    private readonly factory: () => T,
    private readonly max: number,
    prealloc = 0,
  ) {
    for (let i = 0; i < prealloc; i++) this.free.push(factory());
  }

  obtain(): T | null {
    let item = this.free.pop();
    if (!item) {
      if (this.active.length >= this.max) return null;
      item = this.factory();
    }
    this.active.push(item);
    return item;
  }

  releaseAt(index: number): void {
    const item = this.active[index]!;
    const last = this.active.pop()!;
    if (index < this.active.length) this.active[index] = last;
    this.free.push(item);
  }

  clear(): void {
    while (this.active.length) this.free.push(this.active.pop()!);
  }
}
