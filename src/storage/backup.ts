// Экспорт и импорт всех данных пользователя (ТЗ 4.6).
// Экспорт — читаемый JSON (статусы, переводы, примеры, повторения, настройки).
// Импорт полностью перезаписывает хранилище, корзины пересобираются заново.
import type { StorageAdapter } from './adapter';
import {
  BUCKET_MAX_CHARS,
  Bucket,
  SRS_MAX_CHARS,
  SrsRec,
  STATUS_CHARS,
  TOTAL_WORDS,
  TR_MAX_CHARS,
  compressBucket,
  packIx,
  packSrs,
  packStatuses,
  packTr,
  parseStatuses,
} from './codec';
import { DEFAULT_META, MetaData, packMeta } from './meta';
import {
  ExamplePair,
  WordData,
  WordExtras,
  extrasOf,
  isEmptyWordData,
  normalizeWordData,
} from './worddata';

export interface ExportData {
  app: 'spanish-miniapp';
  version: 1;
  exported_at: string;
  meta: MetaData;
  statuses: string; // 5000 символов n/k/l/r/m
  translations: Record<string, string>;
  srs: Record<string, SrsRec>;
  examples: Record<string, ExamplePair[]>;
  /** Дополнительные поля карточек. Появилось позже примеров и потому лежит
      отдельным разделом: экспорт прошлых версий читается без него, а экспорт
      этой версии — прошлыми версиями (они просто не увидят полей). */
  fields?: Record<string, WordExtras>;
}

export function buildExport(
  meta: MetaData,
  statuses: Uint8Array,
  translations: Iterable<[number, string]>,
  srs: Iterable<[number, SrsRec]>,
  words: Iterable<[number, WordData]>,
): ExportData {
  const [a, b] = packStatuses(statuses);
  const tr: Record<string, string> = {};
  for (const [id, t] of translations) tr[id] = t;
  const sr: Record<string, SrsRec> = {};
  for (const [id, r] of srs) sr[id] = r;
  const ex: Record<string, ExamplePair[]> = {};
  const fields: Record<string, WordExtras> = {};
  for (const [id, raw] of words) {
    // нормализация здесь же: в экспорт не должно попасть пустое поле,
    // даже если такое каким-то образом осталось в хранилище
    const data = normalizeWordData(raw);
    if (data.e && data.e.length > 0) ex[id] = data.e;
    const extras = extrasOf(data);
    if (!isEmptyWordData(extras)) fields[id] = extras;
  }
  const out: ExportData = {
    app: 'spanish-miniapp',
    version: 1,
    exported_at: new Date().toISOString(),
    meta,
    statuses: a + b,
    translations: tr,
    srs: sr,
    examples: ex,
  };
  if (Object.keys(fields).length > 0) out.fields = fields;
  return out;
}

export function validateExport(x: unknown): ExportData {
  if (!x || typeof x !== 'object') throw new Error('Это не JSON-объект экспорта');
  const d = x as Partial<ExportData>;
  if (d.app !== 'spanish-miniapp' || d.version !== 1)
    throw new Error('Файл не похож на экспорт этого приложения');
  if (typeof d.statuses !== 'string') throw new Error('В экспорте нет поля statuses');
  for (const ch of d.statuses) {
    if (!STATUS_CHARS.includes(ch)) throw new Error('Поле statuses повреждено');
  }
  return {
    app: 'spanish-miniapp',
    version: 1,
    exported_at: String(d.exported_at ?? ''),
    meta: { ...DEFAULT_META, ...(d.meta as MetaData | undefined) },
    statuses: d.statuses,
    translations: (d.translations as Record<string, string>) ?? {},
    srs: (d.srs as Record<string, SrsRec>) ?? {},
    examples: (d.examples as Record<string, ExamplePair[]>) ?? {},
    fields: (d.fields as Record<string, WordExtras>) ?? {},
  };
}

/** Полная запись импорта в хранилище (минуя очередь): очистка + пересборка ключей. */
export async function writeImport(adapter: StorageAdapter, data: ExportData): Promise<void> {
  const entries = buildStorageEntries(data);
  const existing = await adapter.getKeys();
  await adapter.removeItems(existing);
  for (const [key, value] of entries) await adapter.setItem(key, value);
}

/** Раскладка данных экспорта по ключам CloudStorage (чистая функция — удобно тестировать). */
export function buildStorageEntries(data: ExportData): [string, string][] {
  const out: [string, string][] = [];

  const statuses = parseStatuses(
    data.statuses.slice(0, TOTAL_WORDS / 2),
    data.statuses.slice(TOTAL_WORDS / 2),
  );
  const [a, b] = packStatuses(statuses);
  out.push(['st_0', a], ['st_1', b]);

  // карточки: примеры и дополнительные поля снова вместе
  const cards = new Map<number, WordData>();
  for (const id of ids(data.examples)) {
    const card = normalizeWordData({ ...(data.fields?.[id] ?? {}), e: data.examples[id] });
    if (!isEmptyWordData(card)) cards.set(id, card);
  }
  for (const id of ids(data.fields ?? {})) {
    if (cards.has(id)) continue;
    const card = normalizeWordData(data.fields![id]);
    if (!isEmptyWordData(card)) cards.set(id, card);
  }
  const cardIds = [...cards.keys()].sort((x, y) => x - y);

  // пересчитать счётчик предложений по факту
  let sentences = 0;
  for (const id of cardIds) sentences += (cards.get(id)!.e ?? []).filter((p) => p[0].trim()).length;
  const meta: MetaData = { ...data.meta, sentences_total: sentences };
  out.push(['meta', packMeta(meta)]);

  // переводы — жадная упаковка по чанкам
  let chunk: [number, string][] = [];
  let chunkNo = 0;
  const flushTr = () => {
    if (chunk.length === 0) return;
    out.push([`tr_${chunkNo++}`, packTr(chunk)]);
    chunk = [];
  };
  for (const id of ids(data.translations)) {
    chunk.push([id, data.translations[id]]);
    if (packTr(chunk).length > TR_MAX_CHARS) {
      const last = chunk.pop()!;
      flushTr();
      chunk.push(last);
    }
  }
  flushTr();

  // повторения — жадная упаковка
  let srsChunk: [number, SrsRec][] = [];
  let srsNo = 0;
  const flushSrs = () => {
    if (srsChunk.length === 0) return;
    out.push([`srs_${srsNo++}`, packSrs(srsChunk)]);
    srsChunk = [];
  };
  for (const id of ids(data.srs)) {
    srsChunk.push([id, data.srs[id]]);
    if (packSrs(srsChunk).length > SRS_MAX_CHARS) {
      const last = srsChunk.pop()!;
      flushSrs();
      srsChunk.push(last);
    }
  }
  flushSrs();

  // карточки — жадная упаковка корзин со сжатием
  const ix: (number | null)[] = new Array(TOTAL_WORDS).fill(null);
  let bucket: Bucket = {};
  let bucketIds: number[] = [];
  let bucketNo = 0;
  const flushBucket = () => {
    if (bucketIds.length === 0) return;
    out.push([`d_${bucketNo}`, compressBucket(bucket)]);
    for (const id of bucketIds) ix[id] = bucketNo;
    bucketNo++;
    bucket = {};
    bucketIds = [];
  };
  for (const id of cardIds) {
    const card = cards.get(id)!;
    bucket[id] = card;
    if (compressBucket(bucket).length > BUCKET_MAX_CHARS && bucketIds.length > 0) {
      delete bucket[id];
      flushBucket();
      bucket[id] = card;
    }
    bucketIds.push(id);
  }
  flushBucket();

  packIx(ix).forEach((s, i) => out.push([`ix_${i}`, s]));
  return out;
}

function ids(obj: Record<string, unknown>): number[] {
  return Object.keys(obj)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < TOTAL_WORDS)
    .sort((x, y) => x - y);
}
