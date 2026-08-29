import raw from './words.json';

export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
export type Pos = 'noun' | 'verb' | 'adj' | 'adv' | 'interj';

export interface Word {
  id: number;
  word: string;
  pos: Pos;
  level: Level;
  rank: number;
}

export const WORDS = raw as Word[];

export const LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

/** Диапазоны id по уровням: [начало, конец) — id = rank - 1. */
export const LEVEL_BOUNDS: Record<Level, [number, number]> = {
  A1: [0, 500],
  A2: [500, 1200],
  B1: [1200, 2500],
  B2: [2500, 4000],
  C1: [4000, 5000],
};

export function levelOfId(id: number): Level {
  if (id < 500) return 'A1';
  if (id < 1200) return 'A2';
  if (id < 2500) return 'B1';
  if (id < 4000) return 'B2';
  return 'C1';
}

export const POS_RU: Record<Pos, string> = {
  noun: 'сущ.',
  verb: 'глаг.',
  adj: 'прил.',
  adv: 'нареч.',
  interj: 'межд.',
};
