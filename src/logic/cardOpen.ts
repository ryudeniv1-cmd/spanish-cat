// Какие блоки карточки развёрнуты — для каждого слова своё.
// Это состояние интерфейса, а не данные пользователя: место в CloudStorage
// на него не тратим, храним локально и молча обходимся без него, если
// localStorage в WebView недоступен.

const KEY = 'card_open';

type OpenMap = Record<string, string[]>;

function read(): OpenMap {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as OpenMap) : {};
  } catch {
    return {};
  }
}

export function openBlocks(id: number): string[] {
  const v = read()[id];
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

export function setOpenBlocks(id: number, keys: string[]): void {
  try {
    const map = read();
    if (keys.length > 0) map[id] = keys;
    else delete map[id];
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // некритично: блоки просто откроются свёрнутыми в следующий раз
  }
}
