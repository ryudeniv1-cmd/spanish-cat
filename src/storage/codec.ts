// Упаковка данных пользователя в схему ключей CloudStorage (ТЗ, раздел 8).
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';

export const TOTAL_WORDS = 5000;

// --- статусы ---
// st_0 (id 0..2499) и st_1 (id 2500..4999): по символу на слово.
export const STATUS_CHARS = 'nklrm' as const;
export const Status = {
  New: 0,
  Known: 1,
  Learning: 2,
  Review: 3,
  Mastered: 4,
} as const;
export type StatusValue = (typeof Status)[keyof typeof Status];
const ST_HALF = TOTAL_WORDS / 2;

export function packStatuses(st: Uint8Array): [string, string] {
  let a = '';
  let b = '';
  for (let i = 0; i < ST_HALF; i++) a += STATUS_CHARS[st[i]];
  for (let i = ST_HALF; i < TOTAL_WORDS; i++) b += STATUS_CHARS[st[i]];
  return [a, b];
}

export function parseStatuses(a: string | null, b: string | null): Uint8Array {
  const st = new Uint8Array(TOTAL_WORDS); // 0 = new
  const put = (s: string | null, offset: number) => {
    if (!s) return;
    for (let i = 0; i < s.length && offset + i < TOTAL_WORDS; i++) {
      const v = STATUS_CHARS.indexOf(s[i]);
      st[offset + i] = v >= 0 ? v : 0;
    }
  };
  put(a, 0);
  put(b, ST_HALF);
  return st;
}

// --- переводы: строки "id\tперевод\n" ---
export const TR_MAX_CHARS = 4000;

export function packTr(entries: Iterable<[number, string]>): string {
  let out = '';
  for (const [id, text] of entries) out += `${id}\t${sanitize(text)}\n`;
  return out;
}

export function parseTr(s: string): [number, string][] {
  const out: [number, string][] = [];
  for (const line of s.split('\n')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const id = Number(line.slice(0, tab));
    if (Number.isInteger(id) && id >= 0 && id < TOTAL_WORDS) out.push([id, line.slice(tab + 1)]);
  }
  return out;
}

function sanitize(text: string): string {
  return text.replace(/[\t\n\r]+/g, ' ').trim();
}

// --- данные повторений: "id:step:next:learned;" ---
export const SRS_MAX_CHARS = 4000;

export interface SrsRec {
  step: number; // 0..6 (7 => слово освоено и уходит из review)
  next: number; // день следующего повторения (дни от 2026-01-01)
  learned: number; // день нажатия «Выучил»
}

export function packSrs(entries: Iterable<[number, SrsRec]>): string {
  let out = '';
  for (const [id, r] of entries) out += `${id}:${r.step}:${r.next}:${r.learned};`;
  return out;
}

export function parseSrs(s: string): [number, SrsRec][] {
  const out: [number, SrsRec][] = [];
  for (const part of s.split(';')) {
    if (!part) continue;
    const [id, step, next, learned] = part.split(':').map(Number);
    if (Number.isInteger(id) && id >= 0 && id < TOTAL_WORDS)
      out.push([id, { step, next, learned }]);
  }
  return out;
}

// --- индекс корзин примеров: 2 символа base36 на слово, '--' = нет корзины ---
export const IX_CHUNK_WORDS = 2048;
export const IX_KEY_COUNT = Math.ceil(TOTAL_WORDS / IX_CHUNK_WORDS); // 3
const IX_NONE = '--';

export function packIx(ix: ArrayLike<number | null>): string[] {
  const out: string[] = [];
  for (let c = 0; c < IX_KEY_COUNT; c++) {
    let s = '';
    const end = Math.min((c + 1) * IX_CHUNK_WORDS, TOTAL_WORDS);
    for (let i = c * IX_CHUNK_WORDS; i < end; i++) {
      const v = ix[i];
      s += v === null || v === undefined || v < 0 ? IX_NONE : v.toString(36).padStart(2, '0');
    }
    out.push(s);
  }
  return out;
}

export function parseIx(chunks: (string | null)[]): (number | null)[] {
  const ix: (number | null)[] = new Array(TOTAL_WORDS).fill(null);
  for (let c = 0; c < IX_KEY_COUNT; c++) {
    const s = chunks[c];
    if (!s) continue;
    const offset = c * IX_CHUNK_WORDS;
    for (let i = 0; i * 2 + 1 < s.length && offset + i < TOTAL_WORDS; i++) {
      const pair = s.slice(i * 2, i * 2 + 2);
      ix[offset + i] = pair === IX_NONE ? null : parseInt(pair, 36);
    }
  }
  return ix;
}

// --- корзины примеров: {id: [[es, ru], ...]} со сжатием lz-string ---
export const BUCKET_MAX_CHARS = 3600;

export type ExamplePair = [string, string];
export type Bucket = Record<number, ExamplePair[]>;

export function compressBucket(b: Bucket): string {
  return compressToUTF16(JSON.stringify(b));
}

export function decompressBucket(s: string): Bucket {
  try {
    const json = decompressFromUTF16(s);
    if (!json) return {};
    const parsed = JSON.parse(json) as Bucket;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// --- даты: дни от 2026-01-01 по местному времени ---
const EPOCH_Y = 2026;
const EPOCH_M = 0;
const EPOCH_D = 1;
const DAY_MS = 86_400_000;

export function dayFromDate(d: Date): number {
  const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const epoch = new Date(EPOCH_Y, EPOCH_M, EPOCH_D).getTime();
  return Math.round((mid - epoch) / DAY_MS);
}

export function dateFromDay(day: number): Date {
  return new Date(EPOCH_Y, EPOCH_M, EPOCH_D + day);
}

export function todayDay(): number {
  return dayFromDate(new Date());
}

export function localDateString(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
