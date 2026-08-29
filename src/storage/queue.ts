// Единая очередь записи: последовательные записи с debounce и индикатором состояния.
import type { StorageAdapter } from './adapter';

export type SaveStatus = 'saved' | 'saving' | 'error';

export class SaveQueue {
  private pending = new Map<string, string | null>(); // null = удалить ключ
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;
  private listeners = new Set<(s: SaveStatus) => void>();
  private _status: SaveStatus = 'saved';

  constructor(
    private adapter: StorageAdapter,
    private debounceMs = 700,
  ) {}

  get status(): SaveStatus {
    return this._status;
  }

  onStatus(cb: (s: SaveStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private setStatus(s: SaveStatus) {
    if (this._status === s) return;
    this._status = s;
    this.listeners.forEach((cb) => cb(s));
  }

  set(key: string, value: string | null): void {
    this.pending.set(key, value);
    this.setStatus('saving');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flushNow(), this.debounceMs);
  }

  async flushNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushing) {
      await this.flushing;
      if (this.pending.size === 0) return;
    }
    if (this.pending.size === 0) {
      this.setStatus('saved');
      return;
    }
    this.flushing = this.doFlush();
    try {
      await this.flushing;
    } finally {
      this.flushing = null;
    }
    // за время записи могли появиться новые изменения
    if (this.pending.size > 0) await this.flushNow();
  }

  private async doFlush(): Promise<void> {
    const batch = [...this.pending.entries()];
    this.pending.clear();
    this.setStatus('saving');
    try {
      for (const [key, value] of batch) {
        if (value === null) await this.adapter.removeItem(key);
        else await this.adapter.setItem(key, value);
      }
      if (this.pending.size === 0) this.setStatus('saved');
    } catch (e) {
      // вернуть незаписанное в очередь, не затирая более свежие значения
      for (const [key, value] of batch) {
        if (!this.pending.has(key)) this.pending.set(key, value);
      }
      this.setStatus('error');
      throw e;
    }
  }
}
