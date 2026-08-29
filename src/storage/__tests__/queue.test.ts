import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryAdapter } from '../adapter';
import { SaveQueue } from '../queue';

describe('SaveQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('пишет после debounce, последнее значение выигрывает', async () => {
    const adapter = memoryAdapter();
    const q = new SaveQueue(adapter, 700);
    q.set('meta', '1');
    q.set('meta', '2');
    expect(q.status).toBe('saving');
    expect(await adapter.getItem('meta')).toBeNull();
    await vi.advanceTimersByTimeAsync(700);
    expect(await adapter.getItem('meta')).toBe('2');
    expect(q.status).toBe('saved');
  });

  it('null удаляет ключ', async () => {
    const adapter = memoryAdapter({ st_0: 'x' });
    const q = new SaveQueue(adapter, 10);
    q.set('st_0', null);
    await q.flushNow();
    expect(await adapter.getItem('st_0')).toBeNull();
  });

  it('flushNow пишет немедленно и дожимает то, что накопилось во время записи', async () => {
    const adapter = memoryAdapter();
    const q = new SaveQueue(adapter, 700);
    q.set('a', '1');
    const p = q.flushNow();
    q.set('b', '2'); // пришло во время записи
    await p;
    expect(await adapter.getItem('a')).toBe('1');
    expect(await adapter.getItem('b')).toBe('2');
    expect(q.status).toBe('saved');
  });

  it('при ошибке значения не теряются и статус error', async () => {
    let fail = true;
    const inner = memoryAdapter();
    const adapter = {
      ...inner,
      setItem: async (k: string, v: string) => {
        if (fail) throw new Error('сбой');
        return inner.setItem(k, v);
      },
    };
    const q = new SaveQueue(adapter, 10);
    q.set('a', '1');
    await expect(q.flushNow()).rejects.toThrow('сбой');
    expect(q.status).toBe('error');
    fail = false;
    await q.flushNow();
    expect(await inner.getItem('a')).toBe('1');
    expect(q.status).toBe('saved');
  });
});
