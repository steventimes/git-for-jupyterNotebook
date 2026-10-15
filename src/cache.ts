export class BaselineCache<T> {
  private readonly values = new Map<string, Promise<T>>();
  get(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.values.get(key);
    if (existing) return existing;
    const promise = load();
    this.values.set(key, promise);
    // Rejections may be transient; typed error results remain cached until invalidation.
    void promise.catch(() => { if (this.values.get(key) === promise) this.values.delete(key); });
    return promise;
  }
  invalidate(prefix = ''): void { for (const key of this.values.keys()) if (key.startsWith(prefix)) this.values.delete(key); }
  get size(): number { return this.values.size; }
}
