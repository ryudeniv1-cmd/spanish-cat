import { describe, expect, it } from 'vitest';
import { buildExport, buildStorageEntries, validateExport, writeImport } from '../backup';
import { memoryAdapter } from '../adapter';
import {
  BUCKET_MAX_CHARS,
  ExamplePair,
  Status,
  TOTAL_WORDS,
  decompressBucket,
  parseIx,
  parseSrs,
  parseStatuses,
  parseTr,
} from '../codec';
import { DEFAULT_META } from '../meta';

function sampleData() {
  const statuses = new Uint8Array(TOTAL_WORDS);
  statuses[0] = Status.Review;
  statuses[1] = Status.Known;
  statuses[2] = Status.Learning;
  statuses[3000] = Status.Mastered;
  const translations = new Map<number, string>([
    [0, 'быть'],
    [2, 'прибывать'],
    [3000, 'что-то умное'],
  ]);
  const srs = new Map([
    [0, { step: 2, next: 245, learned: 240 }],
    [3000, { step: 7, next: 400, learned: 100 }],
  ]);
  const examples = new Map<number, ExamplePair[]>([
    [0, [['Soy médico.', 'Я врач.'], ['Es tarde.', 'Поздно.']]],
    [3000, [['Frase rara.', 'Странная фраза.']]],
  ]);
  const meta = { ...DEFAULT_META, new_per_day: 20, last_refill_date: '2026-08-29' };
  return { statuses, translations, srs, examples, meta };
}

describe('экспорт/импорт', () => {
  it('раунд-трип: экспорт -> ключи -> те же данные', () => {
    const d = sampleData();
    const exp = buildExport(d.meta, d.statuses, d.translations, d.srs, d.examples);
    expect(exp.statuses.length).toBe(TOTAL_WORDS);

    const entries = buildStorageEntries(validateExport(JSON.parse(JSON.stringify(exp))));
    const kv = new Map(entries);

    // лимиты CloudStorage
    for (const [, v] of entries) expect(v.length).toBeLessThanOrEqual(4096);
    for (const [k, v] of entries)
      if (k.startsWith('d_')) expect(v.length).toBeLessThanOrEqual(BUCKET_MAX_CHARS);

    // статусы
    const st = parseStatuses(kv.get('st_0') ?? null, kv.get('st_1') ?? null);
    expect([...st]).toEqual([...d.statuses]);

    // переводы
    const tr = new Map<number, string>();
    for (const [k, v] of entries) if (k.startsWith('tr_')) for (const [id, t] of parseTr(v)) tr.set(id, t);
    expect(tr).toEqual(d.translations);

    // повторения
    const srs = new Map<number, unknown>();
    for (const [k, v] of entries) if (k.startsWith('srs_')) for (const [id, r] of parseSrs(v)) srs.set(id, r);
    expect(srs).toEqual(d.srs);

    // примеры через индекс
    const ix = parseIx([kv.get('ix_0') ?? null, kv.get('ix_1') ?? null, kv.get('ix_2') ?? null]);
    for (const [id, pairs] of d.examples) {
      const n = ix[id];
      expect(n).not.toBeNull();
      const bucket = decompressBucket(kv.get(`d_${n}`)!);
      expect(bucket[id]).toEqual(pairs);
    }

    // счётчик предложений пересчитан
    const meta = JSON.parse(kv.get('meta')!) as { sentences_total: number; new_per_day: number };
    expect(meta.sentences_total).toBe(3);
    expect(meta.new_per_day).toBe(20);
  });

  it('writeImport очищает старые ключи и пишет новые', async () => {
    const adapter = memoryAdapter({ старый_ключ: 'мусор', st_0: 'x'.repeat(10) });
    const d = sampleData();
    const exp = buildExport(d.meta, d.statuses, d.translations, d.srs, d.examples);
    await writeImport(adapter, exp);
    const keys = await adapter.getKeys();
    expect(keys).not.toContain('старый_ключ');
    expect(keys).toContain('st_0');
    expect(keys).toContain('meta');
  });

  it('validateExport отклоняет чужой JSON', () => {
    expect(() => validateExport({ foo: 1 })).toThrow();
    expect(() => validateExport('строка')).toThrow();
  });
});
