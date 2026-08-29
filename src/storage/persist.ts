// Раскладка данных по ключам: чанки переводов/повторений и корзины примеров.
import type { StorageAdapter } from './adapter';
import {
  BUCKET_MAX_CHARS,
  Bucket,
  ExamplePair,
  IX_CHUNK_WORDS,
  compressBucket,
  decompressBucket,
  packIx,
} from './codec';

export type WriteFn = (key: string, value: string | null) => void;

/** Чанковое хранилище «id -> значение» (для tr_* и srs_*). */
export class ChunkStore<V> {
  private chunks = new Map<number, Map<number, V>>();
  private chunkOf = new Map<number, number>();
  private nextChunk = 0;

  constructor(
    private prefix: string,
    private pack: (entries: Iterable<[number, V]>) => string,
    private maxChars: number,
    private write: WriteFn,
  ) {}

  /** Загрузка из значений ключей `${prefix}_${n}` -> распарсенные записи. */
  load(parsed: Map<number, [number, V][]>): void {
    for (const [n, entries] of parsed) {
      const m = new Map<number, V>();
      for (const [id, v] of entries) {
        m.set(id, v);
        this.chunkOf.set(id, n);
      }
      this.chunks.set(n, m);
      this.nextChunk = Math.max(this.nextChunk, n + 1);
    }
  }

  get(id: number): V | undefined {
    const n = this.chunkOf.get(id);
    return n === undefined ? undefined : this.chunks.get(n)?.get(id);
  }

  has(id: number): boolean {
    return this.chunkOf.has(id);
  }

  *entries(): IterableIterator<[number, V]> {
    for (const m of this.chunks.values()) yield* m.entries();
  }

  get size(): number {
    let n = 0;
    for (const m of this.chunks.values()) n += m.size;
    return n;
  }

  set(id: number, value: V): void {
    const cur = this.chunkOf.get(id);
    if (cur !== undefined) {
      const m = this.chunks.get(cur)!;
      m.set(id, value);
      const packed = this.pack(m.entries());
      if (packed.length <= this.maxChars || m.size === 1) {
        this.write(this.key(cur), packed);
        return;
      }
      // чанк переполнен — забрать слово и перенести в открытый чанк
      m.delete(id);
      this.chunkOf.delete(id);
      this.write(this.key(cur), this.pack(m.entries()));
    }
    this.place(id, value);
  }

  delete(id: number): void {
    const cur = this.chunkOf.get(id);
    if (cur === undefined) return;
    const m = this.chunks.get(cur)!;
    m.delete(id);
    this.chunkOf.delete(id);
    if (m.size === 0) {
      this.chunks.delete(cur);
      this.write(this.key(cur), null);
    } else {
      this.write(this.key(cur), this.pack(m.entries()));
    }
  }

  private place(id: number, value: V): void {
    // пробуем последний (открытый) чанк, иначе создаём новый
    const last = this.lastChunkNo();
    if (last !== undefined) {
      const m = this.chunks.get(last)!;
      m.set(id, value);
      const packed = this.pack(m.entries());
      if (packed.length <= this.maxChars) {
        this.chunkOf.set(id, last);
        this.write(this.key(last), packed);
        return;
      }
      m.delete(id);
    }
    const n = this.nextChunk++;
    const m = new Map<number, V>([[id, value]]);
    this.chunks.set(n, m);
    this.chunkOf.set(id, n);
    this.write(this.key(n), this.pack(m.entries()));
  }

  private lastChunkNo(): number | undefined {
    let last: number | undefined;
    for (const n of this.chunks.keys()) if (last === undefined || n > last) last = n;
    return last;
  }

  private key(n: number): string {
    return `${this.prefix}_${n}`;
  }
}

/** Корзины примеров d_* с ленивой загрузкой и индексом ix_*. */
export class BucketStore {
  ix: (number | null)[];
  private cache = new Map<number, Bucket>();
  private nextBucket = 0;

  constructor(
    private adapter: StorageAdapter,
    private write: WriteFn,
  ) {
    this.ix = new Array<number | null>(0);
  }

  loadIx(ix: (number | null)[]): void {
    this.ix = ix;
    for (const n of ix) if (n !== null && n >= this.nextBucket) this.nextBucket = n + 1;
  }

  bucketNos(): number[] {
    const set = new Set<number>();
    for (const n of this.ix) if (n !== null) set.add(n);
    return [...set].sort((a, b) => a - b);
  }

  private async ensureBucket(n: number): Promise<Bucket> {
    let b = this.cache.get(n);
    if (!b) {
      const raw = await this.adapter.getItem(`d_${n}`);
      b = raw ? decompressBucket(raw) : {};
      this.cache.set(n, b);
    }
    return b;
  }

  async getExamples(id: number): Promise<ExamplePair[]> {
    const n = this.ix[id];
    if (n === null || n === undefined) return [];
    const b = await this.ensureBucket(n);
    return b[id] ?? [];
  }

  getCachedExamples(id: number): ExamplePair[] | undefined {
    const n = this.ix[id];
    if (n === null || n === undefined) return [];
    return this.cache.get(n)?.[id];
  }

  async loadAll(): Promise<void> {
    const missing = this.bucketNos().filter((n) => !this.cache.has(n));
    if (missing.length === 0) return;
    const values = await this.adapter.getItems(missing.map((n) => `d_${n}`));
    for (const n of missing) {
      const raw = values[`d_${n}`];
      this.cache.set(n, raw ? decompressBucket(raw) : {});
    }
  }

  async setExamples(id: number, pairs: ExamplePair[]): Promise<void> {
    const cur = this.ix[id];
    if (pairs.length === 0) {
      if (cur === null || cur === undefined) return;
      const b = await this.ensureBucket(cur);
      delete b[id];
      this.writeBucket(cur, b);
      this.setIx(id, null);
      return;
    }
    if (cur !== null && cur !== undefined) {
      const b = await this.ensureBucket(cur);
      b[id] = pairs;
      const packed = compressBucket(b);
      if (packed.length <= BUCKET_MAX_CHARS || Object.keys(b).length === 1) {
        this.write(`d_${cur}`, packed);
        return;
      }
      // корзина больше не помещается — переносим слово в другую корзину
      delete b[id];
      this.writeBucket(cur, b);
    }
    await this.place(id, pairs);
  }

  private async place(id: number, pairs: ExamplePair[]): Promise<void> {
    const last = this.nextBucket - 1;
    if (last >= 0) {
      const b = await this.ensureBucket(last);
      if (Object.keys(b).length > 0) {
        b[id] = pairs;
        const packed = compressBucket(b);
        if (packed.length <= BUCKET_MAX_CHARS) {
          this.write(`d_${last}`, packed);
          this.setIx(id, last);
          return;
        }
        delete b[id];
      }
    }
    const n = this.nextBucket++;
    const b: Bucket = { [id]: pairs };
    this.cache.set(n, b);
    this.write(`d_${n}`, compressBucket(b));
    this.setIx(id, n);
  }

  private writeBucket(n: number, b: Bucket): void {
    if (Object.keys(b).length === 0) {
      this.cache.delete(n);
      this.write(`d_${n}`, null);
    } else {
      this.write(`d_${n}`, compressBucket(b));
    }
  }

  private setIx(id: number, n: number | null): void {
    this.ix[id] = n;
    const chunkNo = Math.floor(id / IX_CHUNK_WORDS);
    this.write(`ix_${chunkNo}`, packIx(this.ix)[chunkNo]);
  }
}
