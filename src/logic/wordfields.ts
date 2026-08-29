// Описание блоков карточки: подписи, порядок, признак заполненности и краткое
// содержимое для свёрнутого заголовка. Одно место на редактор, режим повторения
// и полосу-индикатор — иначе они разъедутся.
import type { Pos } from '../data/words';
import type { Gender, Register, WordData } from '../storage/worddata';

export const GENDER_LABEL: Record<Gender, string> = { m: 'el', f: 'la', b: 'el/la' };

export const REGISTER_LABEL: Record<Register, string> = {
  n: 'нейтральное',
  c: 'разговорное',
  b: 'книжное',
  v: 'грубое',
};

export const VERB_LABEL: Record<string, string> = {
  p: 'правильный',
  i: 'неправильный',
  v: 'возвратный',
  t: 'переходный',
};

const VERB_SHORT: Record<string, string> = {
  p: 'прав.',
  i: 'неправ.',
  v: 'возвр.',
  t: 'перех.',
};

/** Подписи к пяти ключевым формам — порядок совпадает с индексами в `vf`. */
export const VERB_FORM_LABEL = [
  'yo · presente',
  'él · indefinido',
  'futuro · корень',
  'participio',
  'yo · subjuntivo',
];
export const VERB_FORM_PLACEHOLDER = ['tengo', 'tuvo', 'tendr-', 'tenido', 'tenga'];

/** Фиксированный список тем; свои темы добавляются к нему. */
export const THEMES = [
  'еда',
  'дом',
  'работа',
  'эмоции',
  'тело',
  'время',
  'движение',
  'общение',
  'деньги',
  'природа',
  'город',
  'учёба',
];

export interface FieldBlock {
  key: string;
  title: string;
  /** Заполнен ли блок — от этого точка в заголовке и полоса наверху карточки. */
  filled(d: WordData): boolean;
  /** Кратко о содержимом рядом с названием свёрнутого блока. */
  summary(d: WordData, pos: Pos): string;
}

const dot = (parts: (string | false | undefined)[]): string => parts.filter(Boolean).join(' · ');

const hasAny = (v?: string[]): boolean => !!v && v.some((x) => x.trim() !== '');

/** Порядок сверху вниз: грамматика, потом смысл, потом личное. */
export const FIELD_BLOCKS: FieldBlock[] = [
  {
    key: 'gram',
    title: 'Грамматика',
    filled: (d) => !!(d.g || d.pl || d.vt || hasAny(d.vf) || d.fa || d.pr),
    summary: (d, pos) => {
      const parts: (string | false | undefined)[] = [];
      if (pos === 'noun') {
        parts.push(d.g && GENDER_LABEL[d.g], d.pl);
      } else if (pos === 'verb') {
        parts.push(
          d.vt &&
            d.vt
              .split('')
              .map((f) => VERB_SHORT[f])
              .filter(Boolean)
              .join(', '),
          hasAny(d.vf) && 'формы',
        );
      } else if (pos === 'adj') {
        parts.push(d.fa);
      }
      parts.push(d.pr);
      return dot(parts);
    },
  },
  {
    key: 'co',
    title: 'Сочетания',
    filled: (d) => hasAny(d.co),
    summary: (d) => String(d.co?.length ?? ''),
  },
  {
    key: 'rt',
    title: 'Однокоренные',
    filled: (d) => !!d.rt?.length,
    summary: (d) => String(d.rt?.length ?? ''),
  },
  {
    key: 'mn',
    title: 'Значения',
    filled: (d) => hasAny(d.mn),
    summary: (d) => String(d.mn?.length ?? ''),
  },
  {
    key: 'syn',
    title: 'Синонимы и антонимы',
    filled: (d) => !!(d.sy || d.an),
    summary: (d) => dot([d.sy && `син. ${count(d.sy)}`, d.an && `ант. ${count(d.an)}`]),
  },
  {
    key: 'cf',
    title: 'Не путать с',
    filled: (d) => !!d.cf?.length,
    summary: (d) => (d.cf ?? []).map((p) => p[0]).filter(Boolean).join(', '),
  },
  {
    key: 'ff',
    title: 'Ложный друг',
    filled: (d) => !!d.ff,
    summary: (d) => (d.ff ? 'да' : ''),
  },
  {
    key: 'rg',
    title: 'Регистр',
    filled: (d) => !!(d.rg || d.sp),
    summary: (d) => dot([d.rg && REGISTER_LABEL[d.rg], d.sp && 'только Испания']),
  },
  {
    key: 'th',
    title: 'Тема',
    filled: (d) => hasAny(d.th),
    summary: (d) => {
      const th = d.th ?? [];
      return th.length <= 2 ? th.join(', ') : `${th.slice(0, 2).join(', ')} +${th.length - 2}`;
    },
  },
  {
    key: 'nt',
    title: 'Заметка',
    filled: (d) => !!d.nt,
    summary: (d) => (d.nt ? 'есть' : ''),
  },
];

function count(s: string): number {
  return s.split(',').filter((x) => x.trim()).length;
}

/** Сколько блоков заполнено — полоса наверху карточки. */
export function filledBlocks(d: WordData): number {
  return FIELD_BLOCKS.filter((b) => b.filled(d)).length;
}

/** Что ищется в Lexicon помимо слова и перевода: сочетания и однокоренные. */
export function cardSearchText(d: WordData): string {
  const parts: string[] = [...(d.co ?? [])];
  for (const [word, tr] of d.rt ?? []) parts.push(word, tr);
  return parts.join(' ').toLowerCase();
}
