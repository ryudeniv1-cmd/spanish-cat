import { describe, expect, it } from 'vitest';
import { Status, TOTAL_WORDS } from '../../storage/codec';
import { INTERVALS, dueIds, forgot, newlyLearned, remembered } from '../srs';

describe('интервальные повторения', () => {
  it('интервалы из ТЗ', () => {
    expect([...INTERVALS]).toEqual([1, 3, 7, 14, 30, 60, 120]);
  });

  it('«Выучил»: шаг 0, повтор завтра', () => {
    expect(newlyLearned(240)).toEqual({ step: 0, next: 241, learned: 240 });
  });

  it('«Вспомнил» проходит все шаги до освоения', () => {
    let rec = newlyLearned(0);
    const nexts: number[] = [];
    for (let today = rec.next; ; ) {
      const r = remembered(rec, today);
      if (r.mastered) {
        expect(r.rec.step).toBe(7);
        break;
      }
      rec = r.rec;
      nexts.push(rec.next - today);
      today = rec.next;
    }
    expect(nexts).toEqual([3, 7, 14, 30, 60, 120]);
  });

  it('«Не вспомнил» сбрасывает на шаг 0, повтор завтра, learned не меняется', () => {
    const rec = { step: 4, next: 100, learned: 50 };
    expect(forgot(rec, 105)).toEqual({ step: 0, next: 106, learned: 50 });
  });

  it('dueIds: только review, просроченные первыми', () => {
    const statuses = new Uint8Array(TOTAL_WORDS);
    statuses[1] = Status.Review;
    statuses[2] = Status.Review;
    statuses[3] = Status.Mastered;
    statuses[4] = Status.Review;
    const srs = new Map([
      [1, { step: 1, next: 10, learned: 1 }],
      [2, { step: 1, next: 5, learned: 1 }],
      [3, { step: 7, next: 5, learned: 1 }], // mastered — не показывать
      [4, { step: 1, next: 11, learned: 1 }], // ещё не пора
    ]);
    expect(dueIds(srs, statuses, 10)).toEqual([2, 1]);
  });
});
