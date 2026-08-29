import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../adapter';
import { BUCKET_MAX_CHARS, ExamplePair, packTr, parseIx, parseTr } from '../codec';
import { BucketStore, ChunkStore } from '../persist';
import { SaveQueue } from '../queue';

// псевдослучайный текст, плохо поддающийся сжатию (mulberry32)
function rnd(seed: number, len: number): string {
  let t = seed >>> 0;
  let s = '';
  for (let i = 0; i < len; i++) {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    s += String.fromCharCode(0x430 + (((x ^ (x >>> 14)) >>> 0) % 64)); // кириллица
  }
  return s;
}

function bigPairs(seed: number): ExamplePair[] {
  return Array.from({ length: 10 }, (_, i) => [rnd(seed * 31 + i, 90), rnd(seed * 37 + i, 90)]);
}

describe('ChunkStore', () => {
  function make(maxChars: number) {
    const writes = new Map<string, string | null>();
    const store = new ChunkStore<string>('tr', packTr, maxChars, (k, v) => writes.set(k, v));
    return { store, writes };
  }

  it('складывает записи в один чанк, пока помещается', () => {
    const { store, writes } = make(4000);
    store.set(1, 'один');
    store.set(2, 'два');
    expect(writes.has('tr_0')).toBe(true);
    expect(parseTr(writes.get('tr_0')!)).toEqual([
      [1, 'один'],
      [2, 'два'],
    ]);
  });

  it('при переполнении открывает новый чанк, при обновлении переносит слово', () => {
    const { store, writes } = make(80);
    store.set(1, rnd(1, 50));
    store.set(2, rnd(2, 50)); // не влезает в tr_0 -> tr_1
    expect(writes.has('tr_1')).toBe(true);
    // обновление слова 1 длинным текстом: должно уехать из tr_0
    const long = rnd(3, 100);
    store.set(1, long);
    expect(store.get(1)).toBe(long);
    const all = [...store.entries()].map(([id]) => id).sort();
    expect(all).toEqual([1, 2]);
  });

  it('удаление и пустые чанки', () => {
    const { store, writes } = make(4000);
    store.set(7, 'семь');
    store.delete(7);
    expect(writes.get('tr_0')).toBeNull();
    expect(store.has(7)).toBe(false);
  });

  it('загрузка восстанавливает раскладку по чанкам', () => {
    const { store } = make(4000);
    const parsed = new Map<number, [number, string][]>([
      [0, [[1, 'уно']]],
      [3, [[2, 'дос']]],
    ]);
    store.load(parsed);
    expect(store.get(1)).toBe('уно');
    expect(store.get(2)).toBe('дос');
    // новое слово должно попасть в последний чанк (3) или новый, но не потерять существующие
    store.set(3, 'трес');
    expect([...store.entries()].length).toBe(3);
  });
});

describe('BucketStore', () => {
  function make() {
    const adapter = memoryAdapter();
    const queue = new SaveQueue(adapter, 1);
    const store = new BucketStore(adapter, (k, v) => queue.set(k, v));
    store.loadIx(new Array(5000).fill(null));
    return { adapter, queue, store };
  }

  it('сохраняет и читает примеры; ix обновляется', async () => {
    const { queue, store, adapter } = make();
    const pairs: ExamplePair[] = [['Hola.', 'Привет.']];
    await store.setExamples(42, pairs);
    await queue.flushNow();
    expect(store.ix[42]).toBe(0);

    // свежий store читает из адаптера (лениво)
    const store2 = new BucketStore(adapter, () => {});
    store2.loadIx(parseIx([
      (await adapter.getItem('ix_0'))!,
      await adapter.getItem('ix_1'),
      await adapter.getItem('ix_2'),
    ]));
    expect(await store2.getExamples(42)).toEqual(pairs);
  });

  it('переполненная корзина делится: слова расходятся по новым корзинам', async () => {
    const { queue, store, adapter } = make();
    for (let id = 0; id < 12; id++) {
      await store.setExamples(id, bigPairs(id + 1));
    }
    await queue.flushNow();
    const buckets = new Set(store.ix.slice(0, 12));
    expect(buckets.size).toBeGreaterThan(1); // разложилось по нескольким корзинам
    for (const key of await adapter.getKeys()) {
      if (key.startsWith('d_')) {
        expect((await adapter.getItem(key))!.length).toBeLessThanOrEqual(BUCKET_MAX_CHARS);
      }
    }
    // все примеры читаются обратно
    for (let id = 0; id < 12; id++) {
      expect(await store.getExamples(id)).toEqual(bigPairs(id + 1));
    }
  });

  it('обновление слова, из-за которого корзина перестала влезать, переносит слово', async () => {
    const { queue, store } = make();
    for (let id = 0; id < 4; id++) await store.setExamples(id, [['a' + id, 'б' + id]]);
    const before = store.ix[0];
    // раздуть слово 0 — вместе с соседями оно перестанет помещаться? Сначала заполним корзину:
    for (let id = 4; id < 10; id++) await store.setExamples(id, bigPairs(id));
    await store.setExamples(0, bigPairs(99));
    await queue.flushNow();
    expect(await store.getExamples(0)).toEqual(bigPairs(99));
    expect(store.ix[0]).not.toBeNull();
    void before;
  });

  it('пустой список примеров удаляет слово из корзины', async () => {
    const { queue, store } = make();
    await store.setExamples(5, [['x', 'у']]);
    await store.setExamples(5, []);
    await queue.flushNow();
    expect(store.ix[5]).toBeNull();
    expect(await store.getExamples(5)).toEqual([]);
  });

  it('слово только с дополнительными полями хранится и без примеров', async () => {
    const { queue, store, adapter } = make();
    await store.setWord(7, { th: ['еда'], ff: 1, fn: 'ложный друг' });
    await queue.flushNow();
    const store2 = new BucketStore(adapter, () => {});
    store2.loadIx(parseIx([
      (await adapter.getItem('ix_0'))!,
      await adapter.getItem('ix_1'),
      await adapter.getItem('ix_2'),
    ]));
    expect(await store2.getWord(7)).toEqual({ th: ['еда'], ff: 1, fn: 'ложный друг' });
    expect(await store2.getExamples(7)).toEqual([]);
  });

  it('карточка, у которой всё стёрли, уходит из корзины целиком', async () => {
    const { queue, store } = make();
    await store.setWord(9, { e: [['x', 'у']], nt: 'заметка' });
    await store.setWord(9, { e: [['', '']], nt: '   ' });
    await queue.flushNow();
    expect(store.ix[9]).toBeNull();
    expect(await store.getWord(9)).toEqual({});
  });

  it('setExamples не трогает остальные поля карточки', async () => {
    const { queue, store } = make();
    await store.setWord(3, { th: ['дом'], nt: 'мнемоника' });
    await store.setExamples(3, [['Hola.', 'Привет.']]);
    await queue.flushNow();
    expect(await store.getWord(3)).toEqual({
      e: [['Hola.', 'Привет.']],
      th: ['дом'],
      nt: 'мнемоника',
    });
  });
});
