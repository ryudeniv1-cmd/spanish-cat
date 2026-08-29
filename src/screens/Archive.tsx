// Lexicon: 5000 слов, виртуализация, поиск, фильтры-чипы, галочка «Знаю»,
// «+ Учить», групповые действия. Статусы — иконками, перевод под словом.
// Фильтры по теме и регистру появляются, только когда такие данные есть;
// поиск заглядывает ещё в сочетания и однокоренные.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VariableSizeList as List, ListChildComponentProps, ListOnItemsRenderedProps } from 'react-window';
import { useAppStore, useStoreVersion } from '../AppContext';
import { LEVELS, Level, WORDS } from '../data/words';
import { Status, StatusValue } from '../storage/codec';
import { Register } from '../storage/worddata';
import { REGISTER_LABEL, cardSearchText } from '../logic/wordfields';
import { haptic, showConfirm } from '../telegram';
import { FalseFriendIcon, StatusIcon } from '../components/badges';

const HEADER_H = 54;
const ROW_H = 56;

type Row = { type: 'header'; level: Level } | { type: 'word'; id: number };

const STATUS_FILTERS: { label: string; value: StatusValue | null }[] = [
  { label: 'Все', value: null },
  { label: 'Знаю', value: Status.Known },
  { label: 'Новые', value: Status.New },
  { label: 'Учу', value: Status.Learning },
  { label: 'Повторяю', value: Status.Review },
  { label: 'Освоено', value: Status.Mastered },
];

// слабый градиент строки в цвет статуса
const ROW_TINT: Record<number, string> = {
  [Status.New]: 'transparent',
  [Status.Known]: 'linear-gradient(90deg, rgba(122,138,166,0.06), transparent 70%)',
  [Status.Learning]: 'linear-gradient(90deg, var(--accent-soft), transparent 70%)',
  [Status.Review]: 'linear-gradient(90deg, rgba(255,180,84,0.08), transparent 70%)',
  [Status.Mastered]: 'linear-gradient(90deg, rgba(255,255,255,0.07), transparent 70%)',
};

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
  const [themeFilter, setThemeFilter] = useState<string | null>(null);
  const [registerFilter, setRegisterFilter] = useState<Register | null>(null);
  const [listHeight, setListHeight] = useState(400);
  const [stickyLevel, setStickyLevel] = useState<Level | null>(null);
  const [scrollLevel, setScrollLevel] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<List>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // темы и регистры показываем только те, что реально заполнены
  const { themes, hasRegisters } = useMemo(() => {
    const set = new Set<string>();
    let hasRegisters = false;
    for (const [, d] of store.cardEntries()) {
      for (const t of d.th ?? []) set.add(t);
      if (d.rg) hasRegisters = true;
    }
    return { themes: [...set].sort((a, b) => a.localeCompare(b, 'ru')), hasRegisters };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, store]);

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
        const card = themeFilter || registerFilter || q ? store.wordData(id) : null;
        if (themeFilter && !(card!.th ?? []).includes(themeFilter)) continue;
        if (registerFilter && card!.rg !== registerFilter) continue;
        if (q) {
          const w = WORDS[id].word.toLowerCase();
          const tr = store.translation(id).toLowerCase();
          if (
            !stripAccents(w).includes(qPlain) &&
            !tr.includes(q) &&
            !cardSearchText(card!).includes(q)
          )
            continue;
        }
        wordsRows.push({ type: 'word', id });
      }
      if (wordsRows.length > 0) {
        out.push({ type: 'header', level }, ...wordsRows);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, levelFilter, statusFilter, themeFilter, registerFilter, version, store]);

  // фильтры и поиск смотрят во все карточки — поднимаем корзины разом,
  // один раз за сессию
  useEffect(() => {
    void store.loadAllCards();
  }, [store]);

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
        break;
      }
    }
    // индикатор уровня у правого края при прокрутке
    const cur = rows[visibleStartIndex];
    if (cur) {
      setScrollLevel(cur.type === 'header' ? cur.level : WORDS[cur.id].level);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => setScrollLevel(null), 900);
    }
  };

  const itemSize = (i: number) => (rows[i].type === 'header' ? HEADER_H : ROW_H);

  function LevelRing({ level }: { level: Level }) {
    const s = store.levelStats().find((x) => x.level === level)!;
    const pct = (s.known + s.learned) / s.total;
    const r = 12;
    const circ = Math.PI * 2 * r;
    return (
      <svg className="level-ring" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
        <circle
          cx="15"
          cy="15"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${circ * pct} ${circ}`}
        />
      </svg>
    );
  }

  function LevelHeader({ level }: { level: Level }) {
    const s = store.levelStats().find((x) => x.level === level)!;
    return (
      <div className="level-header">
        <LevelRing level={level} />
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
    const tr = store.translation(id);
    const simple = st === Status.New || st === Status.Known;
    return (
      <div
        className="word-row"
        role={simple ? undefined : 'button'}
        onClick={simple ? undefined : () => navigate(`/card/${id}`)}
        style={{ background: ROW_TINT[st], cursor: simple ? undefined : 'pointer' }}
      >
        <StatusIcon status={st} />
        <span className="word-row__main">
          <span className="es-word">
            {w.word}
            {store.wordData(id).ff && <FalseFriendIcon />}
          </span>
          {tr && <span className="tr">{tr}</span>}
        </span>
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
        {simple && (
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
        )}
      </div>
    );
  }

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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height:
          'calc(100dvh - var(--safe-top) - var(--tabbar-h) - var(--safe-bottom) - 36px)',
      }}
    >
      <h1 className="screen-title">Lexicon</h1>
      <div className="archive-controls">
        <input
          className="input"
          type="search"
          placeholder="Поиск: слово, перевод, сочетания…"
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
        {themes.length > 0 && (
          <div className="chips">
            {themes.map((t) => (
              <button
                key={t}
                type="button"
                className={`chip ${themeFilter === t ? 'active' : ''}`}
                onClick={() => setThemeFilter(themeFilter === t ? null : t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        {hasRegisters && (
          <div className="chips">
            {(Object.keys(REGISTER_LABEL) as Register[]).map((r) => (
              <button
                key={r}
                type="button"
                className={`chip ${registerFilter === r ? 'active' : ''}`}
                onClick={() => setRegisterFilter(registerFilter === r ? null : r)}
              >
                {REGISTER_LABEL[r]}
              </button>
            ))}
          </div>
        )}
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
            <div className={`scroll-level ${scrollLevel ? 'visible' : ''}`}>{scrollLevel}</div>
            <List
              ref={listRef}
              height={listHeight}
              width="100%"
              itemCount={rows.length}
              itemSize={itemSize}
              onItemsRendered={onItemsRendered}
              overscanCount={8}
              style={{ scrollbarWidth: 'none' }}
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
