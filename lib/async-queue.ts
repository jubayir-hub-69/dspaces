/**
 * Unbounded async queue. enqueue() never waits on consumers or I/O.
 */
export class AsyncQueue<T> {
  private readonly items: T[] = [];
  private readonly waiters: Array<(item: T | undefined) => void> = [];
  private closed = false;

  enqueue(item: T): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(item);
      return;
    }
    this.items.push(item);
  }

  async dequeue(): Promise<T | undefined> {
    if (this.items.length > 0) {
      return this.items.shift();
    }
    if (this.closed) return undefined;
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.(undefined);
    }
  }

  get size(): number {
    return this.items.length;
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
