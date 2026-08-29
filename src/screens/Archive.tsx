// Архив: все 5000 слов, виртуализированный список, поиск, фильтры,
// галочка «Знаю», «+ Учить», групповые действия по уровню.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VariableSizeList as List, ListChildComponentProps, ListOnItemsRenderedProps } from 'react-window';
import { useAppStore, useStoreVersion } from '../AppContext';
import { LEVELS, Level, WORDS } from '../data/words';
import { Status, StatusValue } from '../storage/codec';
import { haptic, showConfirm } from '../telegram';
import { STATUS_RU, StatusDot } from '../components/badges';

const HEADER_H = 54;
const ROW_H = 52;

type Row = { type: 'header'; level: Level } | { type: 'word'; id: number };

const STATUS_FILTERS: { label: string; value: StatusValue | null }[] = [
  { label: 'Все', value: null },
  { label: 'Знаю', value: Status.Known },
  { label: 'Новые', value: Status.New },
  { label: 'Учу', value: Status.Learning },
  { label: 'Повторяю', value: Status.Review },
  { label: 'Освоено', value: Status.Mastered },
];

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function Archive() {
  const store = useAppStore();
  const version = useStoreVersion();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<Level | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusValue | null>(null);
  const [listHeight, setListHeight] = useState(400);
  const [stickyLevel, setStickyLevel] = useState<Level | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<List>(null);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const qPlain = stripAccents(q);
    const out: Row[] = [];
    for (const level of LEVELS) {
      if (levelFilter && levelFilter !== level) continue;
      const wordsRows: Row[] = [];
      const [from, to] = levelBounds(level);
      for (let id = from; id < to; id++) {
        const st = store.status(id);
        if (statusFilter !== null && st !== statusFilter) continue;
        if (q) {
          const w = WORDS[id].word.toLowerCase();
          const tr = store.translation(id).toLowerCase();
          if (!stripAccents(w).includes(qPlain) && !tr.includes(q)) continue;
        }
        wordsRows.push({ type: 'word', id });
      }
      if (wordsRows.length > 0) {
        out.push({ type: 'header', level }, ...wordsRows);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, levelFilter, statusFilter, version, store]);

  useEffect(() => {
    listRef.current?.resetAfterIndex(0);
    setStickyLevel(rows.length > 0 && rows[0].type === 'header' ? rows[0].level : null);
  }, [rows]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setListHeight(Math.max(200, el.clientHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onItemsRendered = ({ visibleStartIndex }: ListOnItemsRenderedProps) => {
    for (let i = visibleStartIndex; i >= 0; i--) {
      const r = rows[i];
      if (r && r.type === 'header') {
        setStickyLevel(r.level);
        return;
      }
    }
  };

  const itemSize = (i: number) => (rows[i].type === 'header' ? HEADER_H : ROW_H);

  const RowRenderer = ({ index, style }: ListChildComponentProps) => {
    const row = rows[index];
    if (row.type === 'header') {
      return (
        <div style={style}>
          <LevelHeader level={row.level} />
        </div>
      );
    }
    return (
      <div style={style}>
        <WordRow id={row.id} />
      </div>
    );
  };

  function LevelHeader({ level }: { level: Level }) {
    const s = store.levelStats().find((x) => x.level === level)!;
    return (
      <div className="level-header">
        <span className="level-header__name">{level}</span>
        <span className="mono level-header__count">
          {s.known + s.learned} / {s.total}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() =>
            void showConfirm(`Отметить весь уровень ${level} как «Знаю»?`).then((ok) => {
              if (ok) store.markLevel(level, true);
            })
          }
        >
          Всё — знаю
        </button>
        <button
          type="button"
          className="btn btn--ghost-dim btn--sm"
          onClick={() =>
            void showConfirm(`Снять отметки «Знаю» с уровня ${level}?`).then((ok) => {
              if (ok) store.markLevel(level, false);
            })
          }
        >
          Снять
        </button>
      </div>
    );
  }

  function WordRow({ id }: { id: number }) {
    const w = WORDS[id];
    const st = store.status(id);
    const simple = st === Status.New || st === Status.Known;
    return (
      <div
        className="word-row"
        role={simple ? undefined : 'button'}
        onClick={simple ? undefined : () => navigate(`/card/${id}`)}
        style={simple ? undefined : { cursor: 'pointer' }}
      >
        <StatusDot status={st} />
        <span className="es-word">{w.word}</span>
        <span className="mono">{w.rank}</span>
        {st === Status.New && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              haptic('tap');
              store.addToQueue(id);
            }}
          >
            + Учить
          </button>
        )}
        {simple ? (
          <input
            type="checkbox"
            className="check"
            aria-label={`Знаю слово ${w.word}`}
            checked={st === Status.Known}
            onChange={() => {
              haptic('tap');
              store.toggleKnown(id);
            }}
          />
        ) : (
          <span className="mono">{STATUS_RU[st]}</span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height:
          'calc(100dvh - var(--safe-top) - var(--tabbar-h) - var(--safe-bottom) - 36px)',
      }}
    >
      <h1 className="screen-title">Архив</h1>
      <div className="archive-controls">
        <input
          className="input"
          type="search"
          placeholder="Поиск: слово или перевод…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              className={`chip ${levelFilter === l ? 'active' : ''}`}
              onClick={() => setLevelFilter(levelFilter === l ? null : l)}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="chips">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              className={`chip ${statusFilter === f.value ? 'active' : ''}`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} style={{ flex: 1, minHeight: 0 }} className="archive-list">
        {rows.length === 0 ? (
          <div className="empty-note" style={{ paddingTop: 40 }}>
            Ничего не найдено
          </div>
        ) : (
          <>
            {stickyLevel && (
              <div className="archive-sticky">
                <LevelHeader level={stickyLevel} />
              </div>
            )}
            <List
              ref={listRef}
              height={listHeight}
              width="100%"
              itemCount={rows.length}
              itemSize={itemSize}
              onItemsRendered={onItemsRendered}
              overscanCount={8}
            >
              {RowRenderer}
            </List>
          </>
        )}
      </div>
    </div>
  );
}

function levelBounds(level: Level): [number, number] {
  switch (level) {
    case 'A1':
      return [0, 500];
    case 'A2':
      return [500, 1200];
    case 'B1':
      return [1200, 2500];
    case 'B2':
      return [2500, 4000];
    case 'C1':
      return [4000, 5000];
  }
}
