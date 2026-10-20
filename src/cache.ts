export class BaselineCache<T> {
  private readonly values = new Map<string, Promise<T>>();
  get(key: string, load: () => Promise<T>, reusable: (value: T) => boolean = () => true): Promise<T> {
    const existing = this.values.get(key);
    if (existing) return existing;
    const promise = load();
    this.values.set(key, promise);
    // Transient typed failures and rejected reads must be retried, not fossilized.
    const remove = () => { if (this.values.get(key) === promise) this.values.delete(key); };
    void promise.then(value => { if (this.values.get(key) === promise && !reusable(value)) remove(); }, remove);
    return promise;
  }
  invalidate(prefix = ''): void { for (const key of this.values.keys()) if (key.startsWith(prefix)) this.values.delete(key); }
  get size(): number { return this.values.size; }
}
