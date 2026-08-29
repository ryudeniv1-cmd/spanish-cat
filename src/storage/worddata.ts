// Карточка слова целиком: примеры плюс необязательные поля — грамматика,
// смысл, личные заметки. Живёт в тех же корзинах d_*, что и примеры.
//
// Два правила, ради которых этот модуль отделён от компонентов:
//   1. Пустого в хранилище не бывает. Пустая строка, пустой список, снятая
//      галочка — ключа просто нет. Нормализация здесь одна на всех, поэтому
//      мимо неё записать нельзя.
//   2. Схема расширяется без миграций: все поля необязательные, неизвестные
//      при чтении игнорируются, поэтому новое поле не ломает старую запись,
//      а запись без нового поля читается как «не заполнено».
//
// Ключи однобуквенные и двухбуквенные: они повторяются пять тысяч раз,
// и в CloudStorage на них уходит место.

export type ExamplePair = [string, string];

/** Род существительного: m — el, f — la, b — el/la. */
export type Gender = 'm' | 'f' | 'b';
export const GENDERS: Gender[] = ['m', 'f', 'b'];

/** Регистр: n нейтральное, c разговорное, b книжное, v грубое. */
export type Register = 'n' | 'c' | 'b' | 'v';
export const REGISTERS: Register[] = ['n', 'c', 'b', 'v'];

/** Флаги глагола в строке `vt`: p правильный, i неправильный, v возвратный, t переходный. */
export type VerbFlag = 'p' | 'i' | 'v' | 't';
export const VERB_FLAGS: VerbFlag[] = ['p', 'i', 'v', 't'];
/** Правильный и неправильный — взаимоисключающие. */
export const VERB_EXCLUSIVE: VerbFlag[] = ['p', 'i'];

/** Пять ключевых форм неправильного глагола (порядок фиксирован — это индексы в `vf`). */
export const VERB_FORMS = ['yo', 'él', 'futuro', 'part.', 'yo subj.'] as const;

export const EXAMPLE_SLOTS = 10;

export interface WordData {
  e?: ExamplePair[]; // примеры: [испанский, перевод]
  // — грамматика —
  g?: Gender; // род существительного
  pl?: string; // нестандартное множественное число
  vt?: string; // флаги глагола (VERB_FLAGS)
  vf?: string[]; // ключевые формы неправильного глагола (VERB_FORMS)
  fa?: string; // форма женского рода прилагательного
  pr?: string; // управление предлогом
  // — смысл —
  co?: string[]; // сочетания
  rt?: [string, string][]; // однокоренные: слово + краткий перевод
  mn?: string[]; // значения многозначного слова
  sy?: string; // синонимы, через запятую
  an?: string; // антонимы, через запятую
  cf?: [string, string][]; // не путать с: слово + в чём разница
  ff?: 1; // ложный друг
  fn?: string; // пояснение к ложному другу
  rg?: Register; // регистр
  sp?: 1; // только Испания
  th?: string[]; // темы
  // — личное —
  nt?: string; // заметка
}

/** Всё, кроме примеров: экспорт хранит их отдельными полями. */
export type WordExtras = Omit<WordData, 'e'>;

/** Сколько элементов помещается в список. */
export const LIMITS = {
  co: 6,
  rt: 6,
  mn: 5,
  cf: 4,
  th: 12,
  vf: VERB_FORMS.length,
} as const;

/** Предел длины поля в символах. */
const MAX = {
  example: 250,
  pl: 60,
  vf: 40,
  fa: 60,
  pr: 80,
  co: 80,
  rt: 60,
  mn: 120,
  sy: 200,
  an: 200,
  cf: 120,
  fn: 200,
  th: 24,
  nt: 600,
} as const;

// --- нормализация ---

function line(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function block(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** Список без дыр: пустые строки выбрасываются вовсе. */
function list(v: unknown, limit: number, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = line(item, max);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/** Список пар: строка живёт, пока заполнена хоть одна половина. */
function pairList(v: unknown, limit: number, max: number): [string, string][] {
  if (!Array.isArray(v)) return [];
  const out: [string, string][] = [];
  for (const item of v) {
    if (!Array.isArray(item)) continue;
    const a = line(item[0], max);
    const b = line(item[1], max);
    if (a || b) out.push([a, b]);
    if (out.length >= limit) break;
  }
  return out;
}

/** Позиционные ячейки (формы глагола): порядок важен, пустой хвост не храним. */
function slots(v: unknown, count: number, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(line(v[i], max));
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

/** Примеры: дырки внутри сохраняют нумерацию слотов, пустой хвост не храним. */
function examples(v: unknown): ExamplePair[] {
  if (!Array.isArray(v)) return [];
  const out: ExamplePair[] = [];
  for (const item of v.slice(0, EXAMPLE_SLOTS)) {
    const p = Array.isArray(item) ? item : [];
    out.push([line(p[0], MAX.example), line(p[1], MAX.example)]);
  }
  while (out.length > 0 && out[out.length - 1][0] === '' && out[out.length - 1][1] === '') out.pop();
  return out;
}

function verbFlags(v: unknown): string {
  if (typeof v !== 'string') return '';
  let out = '';
  for (const f of VERB_FLAGS) {
    if (!v.includes(f)) continue;
    // «правильный» и «неправильный» вместе невозможны — остаётся первый по порядку
    if (VERB_EXCLUSIVE.includes(f) && VERB_EXCLUSIVE.some((x) => x !== f && out.includes(x))) continue;
    out += f;
  }
  return out;
}

/**
 * Единственная дверь в хранилище: приводит карточку к каноническому виду
 * и выбрасывает всё пустое. Результат готов к записи как есть.
 */
export function normalizeWordData(input: unknown): WordData {
  const d = (input && typeof input === 'object' ? input : {}) as WordData;
  const out: WordData = {};

  const e = examples(d.e);
  if (e.length > 0) out.e = e;

  if (typeof d.g === 'string' && GENDERS.includes(d.g)) out.g = d.g;
  const pl = line(d.pl, MAX.pl);
  if (pl) out.pl = pl;
  const vt = verbFlags(d.vt);
  if (vt) out.vt = vt;
  const vf = slots(d.vf, LIMITS.vf, MAX.vf);
  if (vf.length > 0) out.vf = vf;
  const fa = line(d.fa, MAX.fa);
  if (fa) out.fa = fa;
  const pr = line(d.pr, MAX.pr);
  if (pr) out.pr = pr;

  const co = list(d.co, LIMITS.co, MAX.co);
  if (co.length > 0) out.co = co;
  const rt = pairList(d.rt, LIMITS.rt, MAX.rt);
  if (rt.length > 0) out.rt = rt;
  const mn = list(d.mn, LIMITS.mn, MAX.mn);
  if (mn.length > 0) out.mn = mn;
  const sy = line(d.sy, MAX.sy);
  if (sy) out.sy = sy;
  const an = line(d.an, MAX.an);
  if (an) out.an = an;
  const cf = pairList(d.cf, LIMITS.cf, MAX.cf);
  if (cf.length > 0) out.cf = cf;
  if (d.ff) {
    out.ff = 1;
    // пояснение без галочки смысла не имеет и не хранится
    const fn = line(d.fn, MAX.fn);
    if (fn) out.fn = fn;
  }
  if (typeof d.rg === 'string' && REGISTERS.includes(d.rg)) out.rg = d.rg;
  if (d.sp) out.sp = 1;
  const th = list(d.th, LIMITS.th, MAX.th);
  if (th.length > 0) out.th = th;

  const nt = block(d.nt, MAX.nt);
  if (nt) out.nt = nt;

  return out;
}

export function isEmptyWordData(d: WordData): boolean {
  for (const _ in d) return false;
  return true;
}

/** Поля карточки без примеров — экспорт хранит их отдельно от `examples`. */
export function extrasOf(d: WordData): WordExtras {
  const { e: _e, ...rest } = d;
  return rest;
}

// --- форма записи в корзине ---

/**
 * Карточка только с примерами пишется голым массивом — ровно как до появления
 * дополнительных полей. Так старые записи не распухают, а сборка предыдущей
 * версии продолжает их читать. Пустая карточка не пишется вовсе (null).
 */
export function toStored(d: WordData): WordData | ExamplePair[] | null {
  const n = normalizeWordData(d);
  if (isEmptyWordData(n)) return null;
  const keys = Object.keys(n);
  if (keys.length === 1 && n.e) return n.e;
  return n;
}

/** Обратное чтение: и голый массив примеров (старый формат), и объект. */
export function fromStored(v: unknown): WordData {
  if (Array.isArray(v)) {
    const e = examples(v);
    return e.length > 0 ? { e } : {};
  }
  return normalizeWordData(v);
}
