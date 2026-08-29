// Ежедневное пополнение очереди «Задание на сегодня» (ТЗ, раздел 5).
import { Status } from '../storage/codec';

/**
 * Какие слова добавить в очередь при первом открытии в новый день:
 * если слов со статусом learning меньше N — добираем из new по рангу
 * (id = rank - 1, значит по возрастанию id). Иначе — ничего.
 */
export function computeRefill(statuses: Uint8Array, newPerDay: number): number[] {
  let learning = 0;
  for (let i = 0; i < statuses.length; i++) {
    if (statuses[i] === Status.Learning) learning++;
  }
  const need = newPerDay - learning;
  if (need <= 0) return [];
  const out: number[] = [];
  for (let id = 0; id < statuses.length && out.length < need; id++) {
    if (statuses[id] === Status.New) out.push(id);
  }
  return out;
}
