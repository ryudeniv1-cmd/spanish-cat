import { describe, expect, it } from 'vitest';
import {
  ExamplePair,
  WordData,
  extrasOf,
  fromStored,
  isEmptyWordData,
  normalizeWordData,
  toStored,
} from '../worddata';

describe('нормализация карточки', () => {
  it('пустое не попадает в запись вовсе', () => {
    const d = normalizeWordData({
      e: [['', ''], ['', '']],
      g: undefined,
      pl: '   ',
      vt: '',
      vf: ['', '', '', '', ''],
      fa: '',
      pr: '\n',
      co: ['', '  '],
      rt: [['', '']],
      mn: [''],
      sy: '',
      an: '',
      cf: [['', '']],
      fn: 'пояснение без галочки',
      th: [],
      nt: '   \n  ',
    } as WordData);
    expect(Object.keys(d)).toEqual([]);
    expect(isEmptyWordData(d)).toBe(true);
    expect(JSON.stringify(d)).toBe('{}');
  });

  it('заполненное сохраняется и подчищается', () => {
    const d = normalizeWordData({
      g: 'f',
      pl: '  los lápices  ',
      pr: 'soñar\tcon',
      co: ['hacer caso', '', 'tener ganas', 'hacer caso'],
      rt: [['el trabajo', 'работа'], ['', 'без слова'], ['', '']],
      mn: ['нести', 'носить одежду'],
      ff: 1,
      fn: 'embarazada — беременная',
      rg: 'c',
      sp: 1,
      th: ['еда', 'дом'],
      nt: 'мнемоника\n\n\n\nвторая мысль',
    } as WordData);
    expect(d.pl).toBe('los lápices');
    expect(d.pr).toBe('soñar con');
    expect(d.co).toEqual(['hacer caso', 'tener ganas']); // дубли схлопнуты
    expect(d.rt).toEqual([['el trabajo', 'работа'], ['', 'без слова']]);
    expect(d.ff).toBe(1);
    expect(d.fn).toBe('embarazada — беременная');
    expect(d.rg).toBe('c');
    expect(d.th).toEqual(['еда', 'дом']);
    expect(d.nt).toBe('мнемоника\n\nвторая мысль');
  });

  it('снятая галочка «ложный друг» уносит пояснение', () => {
    const d = normalizeWordData({ fn: 'осталось от прошлого раза' } as WordData);
    expect(d.fn).toBeUndefined();
    expect(d.ff).toBeUndefined();
  });

  it('мусорные значения отбрасываются, лимиты соблюдаются', () => {
    const d = normalizeWordData({
      g: 'x',
      rg: 'zzz',
      vt: 'ip', // правильный и неправильный вместе — остаётся один
      co: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      mn: ['1', '2', '3', '4', '5', '6'],
      cf: [['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j']],
    } as unknown);
    expect(d.g).toBeUndefined();
    expect(d.rg).toBeUndefined();
    expect(d.vt).toBe('p');
    expect(d.co).toHaveLength(6);
    expect(d.mn).toHaveLength(5);
    expect(d.cf).toHaveLength(4);
  });

  it('формы глагола позиционные: дырка внутри остаётся, хвост нет', () => {
    const d = normalizeWordData({ vf: ['tengo', '', 'tendr-', '', ''] } as WordData);
    expect(d.vf).toEqual(['tengo', '', 'tendr-']);
  });

  it('примеры: дырка внутри сохраняет нумерацию, пустой хвост отбрасывается', () => {
    const pairs: ExamplePair[] = [
      ['Soy médico.', 'Я врач.'],
      ['', ''],
      ['Es tarde.', 'Поздно.'],
      ['', ''],
      ['', ''],
    ];
    expect(normalizeWordData({ e: pairs }).e).toEqual([
      ['Soy médico.', 'Я врач.'],
      ['', ''],
      ['Es tarde.', 'Поздно.'],
    ]);
  });

  it('не падает на чужом входе', () => {
    expect(normalizeWordData(null)).toEqual({});
    expect(normalizeWordData('строка')).toEqual({});
    expect(normalizeWordData({ co: 'не список', rt: 42 } as unknown)).toEqual({});
  });
});

describe('форма записи в корзине', () => {
  it('карточка только с примерами пишется старым голым массивом', () => {
    const e: ExamplePair[] = [['Hola.', 'Привет.']];
    expect(toStored({ e })).toEqual(e);
  });

  it('карточка с полями пишется объектом', () => {
    const stored = toStored({ e: [['Hola.', 'Привет.']], th: ['дом'] });
    expect(Array.isArray(stored)).toBe(false);
    expect(stored).toEqual({ e: [['Hola.', 'Привет.']], th: ['дом'] });
  });

  it('пустая карточка не пишется', () => {
    expect(toStored({})).toBeNull();
    expect(toStored({ e: [], nt: '' })).toBeNull();
  });

  it('старая запись (голый массив) читается как карточка с примерами', () => {
    const e: ExamplePair[] = [['Soy médico.', 'Я врач.']];
    expect(fromStored(e)).toEqual({ e });
    expect(fromStored([])).toEqual({});
  });

  it('неизвестные поля будущих версий не ломают чтение', () => {
    expect(fromStored({ e: [['a', 'б']], zzz: 'поле из будущего' })).toEqual({ e: [['a', 'б']] });
  });

  it('раунд-трип через JSON', () => {
    const d: WordData = {
      e: [['Hola.', 'Привет.']],
      g: 'm',
      vt: 'iv',
      vf: ['tengo', 'tuvo'],
      co: ['tener ganas'],
      rt: [['el trabajo', 'работа']],
      ff: 1,
      fn: 'не смущённая',
      rg: 'c',
      sp: 1,
      th: ['работа'],
      nt: 'заметка',
    };
    expect(fromStored(JSON.parse(JSON.stringify(toStored(d))))).toEqual(d);
  });

  it('extrasOf отделяет поля от примеров', () => {
    expect(extrasOf({ e: [['a', 'б']], th: ['дом'] })).toEqual({ th: ['дом'] });
  });
});
