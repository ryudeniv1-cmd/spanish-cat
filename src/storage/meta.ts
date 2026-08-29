// Настройки и служебные данные (ключ `meta`).

export interface MetaData {
  v: 1;
  new_per_day: number; // «Новых слов в день», 1–50
  min_sentences: number; // «Минимум примеров для „Выучил“», 0–10
  last_refill_date: string; // YYYY-MM-DD последнего пополнения очереди
  sentences_total: number; // всего написанных примеров (испанских предложений)
}

export const DEFAULT_META: MetaData = {
  v: 1,
  new_per_day: 15,
  min_sentences: 10,
  last_refill_date: '',
  sentences_total: 0,
};

export function parseMeta(raw: string | null): MetaData {
  if (!raw) return { ...DEFAULT_META };
  try {
    const m = JSON.parse(raw) as Partial<MetaData>;
    return {
      v: 1,
      new_per_day: clamp(Number(m.new_per_day ?? 15), 1, 50),
      min_sentences: clamp(Number(m.min_sentences ?? 10), 0, 10),
      last_refill_date: typeof m.last_refill_date === 'string' ? m.last_refill_date : '',
      sentences_total: Math.max(0, Number(m.sentences_total ?? 0) || 0),
    };
  } catch {
    return { ...DEFAULT_META };
  }
}

export function packMeta(m: MetaData): string {
  return JSON.stringify(m);
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}
