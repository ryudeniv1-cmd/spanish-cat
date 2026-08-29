// Интервальные повторения (ТЗ, раздел 6). Дни — от 2026-01-01, местное время.
import { SrsRec, Status } from '../storage/codec';

export const INTERVALS = [1, 3, 7, 14, 30, 60, 120] as const;

/** «Выучил»: первое повторение — завтра. */
export function newlyLearned(today: number): SrsRec {
  return { step: 0, next: today + 1, learned: today };
}

/** «Вспомнил»: шаг +1; на шаге 7 слово освоено. */
export function remembered(rec: SrsRec, today: number): { rec: SrsRec; mastered: boolean } {
  const step = rec.step + 1;
  if (step >= INTERVALS.length) {
    return { rec: { ...rec, step }, mastered: true };
  }
  return { rec: { step, next: today + INTERVALS[step], learned: rec.learned }, mastered: false };
}

/** «Не вспомнил»: шаг 0, повтор завтра. */
export function forgot(rec: SrsRec, today: number): SrsRec {
  return { step: 0, next: today + 1, learned: rec.learned };
}

/** Слова к повторению сегодня: next <= today, просроченные первыми. */
export function dueIds(srs: Map<number, SrsRec>, statuses: Uint8Array, today: number): number[] {
  const out: number[] = [];
  for (const [id, r] of srs) {
    if (statuses[id] === Status.Review && r.next <= today) out.push(id);
  }
  out.sort((a, b) => srs.get(a)!.next - srs.get(b)!.next || a - b);
  return out;
}
