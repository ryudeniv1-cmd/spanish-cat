// Персонажи Armory (вкладка Crew).
//
// Как добавить персонажа:
//   1. скопировать ролики в src/presets (любые имена, .mp4);
//   2. дописать одну строку в CHARACTERS ниже.
// Больше ничего трогать не нужно — url роликов Vite подставит сам.
//
// Слот с пустым clips считается заглушкой: карточка остаётся силуэтом,
// даже если условие открытия уже выполнено.

import type { Level } from './words';

/** Чем открывается персонаж: доступен всегда, пройденным уровнем
    или числом выученных слов. */
export type UnlockType = 'always' | 'level' | 'words';

interface CharacterBase {
  id: string;
  name: string;
  /** имена файлов в src/presets */
  clips: string[];
}

export type Character = CharacterBase &
  (
    | { unlockType: 'always' }
    | { unlockType: 'level'; unlockValue: Level }
    | { unlockType: 'words'; unlockValue: number }
  );

export const CHARACTERS: Character[] = [
  { id: 'amidala', name: 'Amidala', unlockType: 'always', clips: ['amidala-idle-1.mp4', 'amidala-idle-2.mp4', 'amidala-idle-3.mp4'] },
  { id: 'ahsoka', name: 'Ahsoka', unlockType: 'level', unlockValue: 'A2', clips: ['asoca-idle-1.mp4'] },
  { id: 'aminaya', name: 'Aminaya', unlockType: 'level', unlockValue: 'B1', clips: ['aminaya-idle-1.mp4'] },
  { id: 'slot-b2', name: '', unlockType: 'level', unlockValue: 'B2', clips: [] },
  { id: 'slot-c1', name: '', unlockType: 'level', unlockValue: 'C1', clips: [] },
  { id: 'slot-2500', name: '', unlockType: 'words', unlockValue: 2500, clips: [] },
];

// Все ролики из src/presets: ключ — путь вида '../presets/amidala-idle-1.mp4',
// значение — итоговый url после сборки (с хешем и base для GitHub Pages).
const CLIP_URLS = import.meta.glob<string>('../presets/*.mp4', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Url ролика по имени файла; undefined — файла в src/presets нет. */
export function clipUrl(file: string): string | undefined {
  return CLIP_URLS[`../presets/${file}`];
}

/** Ролики персонажа, у которых реально есть файл. */
export function clipUrls(c: Character): string[] {
  return c.clips.map(clipUrl).filter((u): u is string => !!u);
}

/** Прогресс, от которого зависит открытие персонажей. */
export interface CrewProgress {
  learned: number; // слов в статусах «Повторяю» + «Освоено»
  completedLevels: readonly Level[]; // уровни, пройденные целиком
}

export function isCharacterUnlocked(c: Character, p: CrewProgress): boolean {
  if (clipUrls(c).length === 0) return false; // слот-заглушка
  if (c.unlockType === 'always') return true;
  return c.unlockType === 'level'
    ? p.completedLevels.includes(c.unlockValue)
    : p.learned >= c.unlockValue;
}

/** Условие открытия одной строкой: «уровень A1» / «2500 слов».
    null — условия нет, персонаж доступен всегда. */
export function unlockLabel(c: Character): string | null {
  if (c.unlockType === 'always') return null;
  return c.unlockType === 'level' ? `уровень ${c.unlockValue}` : `${c.unlockValue} слов`;
}
