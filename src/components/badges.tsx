import { Status, StatusValue } from '../storage/codec';
import type { SaveStatus } from '../storage/queue';

export function LevelBadge({ level }: { level: string }) {
  return <span className="lvl-badge">{level}</span>;
}

const DOT_CLASS: Record<number, string> = {
  [Status.New]: 'n',
  [Status.Known]: 'k',
  [Status.Learning]: 'l',
  [Status.Review]: 'r',
  [Status.Mastered]: 'm',
};

export const STATUS_RU: Record<number, string> = {
  [Status.New]: 'Новое',
  [Status.Known]: 'Знаю',
  [Status.Learning]: 'Учу',
  [Status.Review]: 'Повторяю',
  [Status.Mastered]: 'Освоено',
};

export function StatusDot({ status }: { status: StatusValue }) {
  return <span className={`status-dot status-dot--${DOT_CLASS[status]}`} title={STATUS_RU[status]} />;
}

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const text = status === 'saving' ? 'сохраняю…' : status === 'error' ? 'ошибка записи' : 'сохранено';
  return <span className={`save-indicator save-indicator--${status}`}>{text}</span>;
}
