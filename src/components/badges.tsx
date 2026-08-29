import { Status, StatusValue } from '../storage/codec';
import type { SaveStatus } from '../storage/queue';

export function LevelBadge({ level }: { level: string }) {
  return <span className="lvl-badge">{level}</span>;
}

export const STATUS_RU: Record<number, string> = {
  [Status.New]: 'Новое',
  [Status.Known]: 'Знаю',
  [Status.Learning]: 'Учу',
  [Status.Review]: 'Повторяю',
  [Status.Mastered]: 'Освоено',
};

/** Статус — иконкой, не текстом (ТЗ по дизайну, 9.2). */
export function StatusIcon({ status }: { status: StatusValue }) {
  const title = STATUS_RU[status];
  switch (status) {
    case Status.Known:
      return (
        <svg className="status-ic" viewBox="0 0 16 16" aria-label={title}>
          <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="var(--st-known)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case Status.Learning:
      return (
        <svg className="status-ic" viewBox="0 0 16 16" aria-label={title}>
          <circle cx="8" cy="8" r="4.4" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="17 11" strokeLinecap="round" />
          <circle cx="8" cy="8" r="1.5" fill="var(--accent)" />
        </svg>
      );
    case Status.Review:
      return (
        <svg className="status-ic" viewBox="0 0 16 16" aria-label={title}>
          <path d="M12.8 8a4.8 4.8 0 1 1-1.6-3.6M12.8 2.6v2.6h-2.6" fill="none" stroke="var(--st-review)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case Status.Mastered:
      return (
        <svg className="status-ic" viewBox="0 0 16 16" aria-label={title} style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.7))' }}>
          <path d="M8 1.6 9.6 6l4.4.3-3.4 2.9 1.1 4.3L8 11l-3.7 2.5 1.1-4.3L2 6.3 6.4 6z" fill="var(--st-mastered)" />
        </svg>
      );
    default:
      return (
        <svg className="status-ic" viewBox="0 0 16 16" aria-label={title}>
          <circle cx="8" cy="8" r="2.6" fill="var(--st-new)" />
        </svg>
      );
  }
}

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const text = status === 'saving' ? 'сохраняю…' : status === 'error' ? 'ошибка записи' : 'сохранено';
  return <span className={`save-indicator save-indicator--${status}`}>{text}</span>;
}
