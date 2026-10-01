/**
 * A small in-process LRU with a time-to-live, bounded both by entry count and
 * by a caller-supplied weight (roughly bytes), so a handful of huge values
 * cannot crowd the heap the way an entry count alone would allow.
 *
 * A Map keeps insertion order, so re-inserting on read moves an entry to the
 * young end and the first key is always the least recently used.
 */
export type LruOptions<V> = {
  maxEntries: number;
  ttlMs: number;
  /** Upper bound on the summed weight of everything held. */
  maxWeight?: number;
  weigh?: (value: V) => number;
  now?: () => number;
};

type Slot<V> = { value: V; expires: number; weight: number };

export class TtlLru<K, V> {
  private readonly map = new Map<K, Slot<V>>();
  private total = 0;
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly maxWeight: number;
  private readonly weigh: (value: V) => number;
  private readonly now: () => number;

  constructor(opts: LruOptions<V>) {
    this.maxEntries = Math.max(1, opts.maxEntries);
    this.ttlMs = opts.ttlMs;
    this.maxWeight = opts.maxWeight ?? Number.POSITIVE_INFINITY;
    this.weigh = opts.weigh ?? (() => 1);
    this.now = opts.now ?? Date.now;
  }

  get size(): number {
    return this.map.size;
  }

  get weight(): number {
    return this.total;
  }

  get(key: K): V | undefined {
    const slot = this.map.get(key);
    if (!slot) return undefined;
    if (slot.expires <= this.now()) {
      this.remove(key, slot);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, slot);
    return slot.value;
  }

  set(key: K, value: V, ttlMs: number = this.ttlMs): void {
    const old = this.map.get(key);
    if (old) this.remove(key, old);
    const weight = Math.max(0, this.weigh(value));
    // A single value heavier than the whole budget is not worth evicting
    // everything else for.
    if (weight > this.maxWeight) return;
    this.map.set(key, { value, expires: this.now() + ttlMs, weight });
    this.total += weight;
    while (this.map.size > this.maxEntries || this.total > this.maxWeight) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.remove(oldest.value, this.map.get(oldest.value)!);
    }
  }

  delete(key: K): void {
    const slot = this.map.get(key);
    if (slot) this.remove(key, slot);
  }

  clear(): void {
    this.map.clear();
    this.total = 0;
  }

  private remove(key: K, slot: Slot<V>): void {
    this.map.delete(key);
    this.total -= slot.weight;
  }
}
