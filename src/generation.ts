export class Generation {
  private value = 0;
  private disposed = false;
  next(): number { return ++this.value; }
  current(value: number): boolean { return !this.disposed && value === this.value; }
  dispose(): void { this.disposed = true; this.value++; }
}
