import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useStoreVersion } from '../AppContext';
import { LEVEL_BOUNDS, WORDS } from '../data/words';
import { haptic } from '../telegram';
import { LevelBadge, SaveIndicator } from '../components/badges';
import { MiniMap } from '../components/MiniMap';
import { Panel } from '../components/Panel';
import { warpStarfield } from '../components/Starfield';

export function Bridge() {
  const store = useAppStore();
  const version = useStoreVersion();
  const navigate = useNavigate();

  const queue = store.queueIds();
  const due = store.dueList();
  const level = store.currentLevel();
  const stats = store.levelStats();
  const ls = stats.find((s) => s.level === level)!;
  const touched = ls.known + ls.learned + ls.learning;

  // индикаторы заполнения карточек очереди (корзины подгружаются лениво)
  const [counts, setCounts] = useState<Map<number, number>>(new Map());
  useEffect(() => {
    let alive = true;
    void (async () => {
      const m = new Map<number, number>();
      for (const id of store.queueIds()) {
        const pairs = await store.buckets.getExamples(id);
        m.set(id, pairs.filter((p) => p[0].trim()).length);
      }
      if (alive) setCounts(m);
    })();
    return () => {
      alive = false;
    };
  }, [store, version]);

  const flashId =
    store.lastLearnedId !== null && Date.now() - store.lastLearnedAt < 6000
      ? store.lastLearnedId
      : null;

  const today = new Date();
  const dateStr = today.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div>
      <div className="topbar" style={{ justifyContent: 'space-between' }}>
        <h1 className="screen-title" style={{ margin: 0 }}>
          Мостик
        </h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="mono">{dateStr}</span>
          <SaveIndicator status={store.saveStatus} />
        </div>
      </div>

      <Panel
        title={`Задание на сегодня (${queue.length})`}
        aside={<span className="mono">учу</span>}
      >
        {queue.length === 0 ? (
          <div className="empty-note">На сегодня всё</div>
        ) : (
          queue.map((id) => {
            const w = WORDS[id];
            const hasTr = store.translation(id).trim().length > 0;
            const n = counts.get(id);
            return (
              <button
                key={id}
                type="button"
                className="queue-row"
                onClick={() => navigate(`/card/${id}`)}
              >
                <span className="es-word">{w.word}</span>
                <LevelBadge level={w.level} />
                <span className="mono">
                  перевод {hasTr ? '✓' : '—'} · примеров {n === undefined ? '…' : n}/10
                </span>
              </button>
            );
          })
        )}
      </Panel>

      <Panel title={`Повторение (${due.length})`} aside={<span className="mono">цикл</span>}>
        {due.length === 0 ? (
          <div className="empty-note">Повторений нет</div>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => {
              haptic('tap');
              warpStarfield();
              navigate('/review');
            }}
          >
            Начать повторение
          </button>
        )}
      </Panel>

      <MiniMap
        statuses={store.statuses}
        level={level}
        version={version}
        flashId={flashId}
        caption={`СЕКТОР ${level} · ${touched} / ${LEVEL_BOUNDS[level][1] - LEVEL_BOUNDS[level][0]}`}
        onClick={() => navigate('/map')}
      />
    </div>
  );
}
