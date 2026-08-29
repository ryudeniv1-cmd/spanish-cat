import { describe, expect, it } from 'vitest';
import { Status, TOTAL_WORDS } from '../../storage/codec';
import { computeRefill } from '../refill';

function statuses(setup: Record<number, number> = {}): Uint8Array {
  const st = new Uint8Array(TOTAL_WORDS);
  for (const [id, s] of Object.entries(setup)) st[Number(id)] = s;
  return st;
}

describe('ежедневное пополнение очереди (N = 15)', () => {
  it('пустая очередь: 15 самых частых новых', () => {
    const ids = computeRefill(statuses(), 15);
    expect(ids).toEqual([...Array(15).keys()]);
  });

  it('выучил 7 из 15 — добираем 7', () => {
    const setup: Record<number, number> = {};
    for (let i = 0; i < 8; i++) setup[i] = Status.Learning; // осталось 8
    for (let i = 8; i < 15; i++) setup[i] = Status.Review; // 7 выучено
    const ids = computeRefill(statuses(setup), 15);
    expect(ids.length).toBe(7);
    expect(ids).toEqual([15, 16, 17, 18, 19, 20, 21]);
  });

  it('не выучил ни одного — пополнения нет', () => {
    const setup: Record<number, number> = {};
    for (let i = 0; i < 15; i++) setup[i] = Status.Learning;
    expect(computeRefill(statuses(setup), 15)).toEqual([]);
  });

  it('очередь больше N (ручные добавления) — пополнения нет', () => {
    const setup: Record<number, number> = {};
    for (let i = 0; i < 18; i++) setup[i] = Status.Learning;
    expect(computeRefill(statuses(setup), 15)).toEqual([]);
  });

  it('слова со статусом «Знаю» пропускаются', () => {
    const setup: Record<number, number> = { 0: Status.Known, 1: Status.Known };
    const ids = computeRefill(statuses(setup), 3);
    expect(ids).toEqual([2, 3, 4]);
  });
});
