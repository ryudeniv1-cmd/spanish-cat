import { describe, expect, it } from 'vitest';
import { needsReload, parseBuild } from '../version';

describe('parseBuild', () => {
  it('достаёт отметку сборки', () => {
    expect(parseBuild({ build: '2026-08-29 15:50 · 5bb55d7' })).toBe('2026-08-29 15:50 · 5bb55d7');
  });

  it('на мусоре не падает', () => {
    expect(parseBuild(null)).toBeNull();
    expect(parseBuild('<!doctype html>')).toBeNull();
    expect(parseBuild({ build: 42 })).toBeNull();
  });
});

describe('needsReload', () => {
  it('версии совпали — не перезагружаем', () => {
    expect(needsReload('a', 'a', null)).toBe(false);
  });

  it('версию не узнали — не перезагружаем', () => {
    expect(needsReload('a', null, null)).toBe(false);
  });

  it('на сервере новее — перезагружаем', () => {
    expect(needsReload('a', 'b', null)).toBe(true);
  });

  it('за эту версию уже перезагружались — не зацикливаемся', () => {
    expect(needsReload('a', 'b', 'b')).toBe(false);
  });

  it('после неудачной попытки вышла ещё более новая — пробуем снова', () => {
    expect(needsReload('a', 'c', 'b')).toBe(true);
  });
});
