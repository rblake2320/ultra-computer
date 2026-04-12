/**
 * BoundedMap — A Map with a maximum size that evicts oldest entries (LRU-ish).
 * Prevents unbounded memory growth in long-running server processes.
 * 
 * When the map exceeds maxSize, the oldest 20% of entries are evicted.
 * This amortizes the eviction cost rather than evicting on every insert.
 */
export class BoundedMap<K, V> extends Map<K, V> {
  private maxSize: number;
  private evictRatio: number;

  constructor(maxSize: number = 1000, evictRatio: number = 0.2) {
    super();
    this.maxSize = maxSize;
    this.evictRatio = Math.max(0.1, Math.min(0.5, evictRatio));
  }

  set(key: K, value: V): this {
    // If key already exists, just update
    if (this.has(key)) {
      super.set(key, value);
      return this;
    }

    // Evict oldest entries if at capacity
    if (this.size >= this.maxSize) {
      const evictCount = Math.ceil(this.maxSize * this.evictRatio);
      const keys = this.keys();
      for (let i = 0; i < evictCount; i++) {
        const next = keys.next();
        if (next.done) break;
        this.delete(next.value);
      }
    }

    super.set(key, value);
    return this;
  }
}

/**
 * Cap an array at maxSize, keeping the most recent entries.
 * Returns the same array reference (mutated).
 */
export function capArray<T>(arr: T[], maxSize: number): T[] {
  if (arr.length > maxSize) {
    arr.splice(0, arr.length - maxSize);
  }
  return arr;
}
