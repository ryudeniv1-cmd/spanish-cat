// Today: 3D-клинок, карточка текущего слова с кольцом прогресса,
// ряд точек вместо списка, повторение и мини-карта.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useStoreVersion } from '../AppContext';
import { LEVEL_BOUNDS, WORDS } from '../data/words';
import { haptic } from '../telegram';
import { BLADES, bladeById, nextBlade, unlockedBlades } from '../theme/blades';
import { BladeGlyph, webglAvailable } from '../three/glyph';
import { LazyBladeScene as BladeScene } from '../three/lazy';
import { LevelBadge } from '../components/badges';
import { ExampleRing } from '../components/ExampleRing';
import { MiniMap } from '../components/MiniMap';
import { Panel } from '../components/Panel';
import { warpStarfield } from '../components/Background';

const stagger = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function Today() {
  const store = useAppStore();
  const version = useStoreVersion();
  const navigate = useNavigate();

  const queue = store.queueIds();
  const due = store.dueList();
  const learned = store.learnedCount();
  const unlocked = unlockedBlades(learned);
  const equipped = bladeById(store.meta.equipped_blade) ?? unlocked[unlocked.length - 1];
  const next = nextBlade(learned);
  const level = store.currentLevel();
  const stats = store.levelStats();
  const ls = stats.find((s) => s.level === level)!;

  const [idx, setIdx] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [counts, setCounts] = useState<Map<number, number>>(new Map());
  const webgl = useMemo(() => webglAvailable(), []);

  useEffect(() => {
    if (idx >= queue.length) setIdx(Math.max(0, queue.length - 1));
  }, [queue.length, idx]);

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

  const current = queue[idx];
  const flashId =
    store.lastLearnedId !== null && Date.now() - store.lastLearnedAt < 6000
      ? store.lastLearnedId
      : null;

  // отсчёт от последнего пройденного порога, а не от экипированного клинка:
  // можно носить Ember, имея 300 слов, — полоса всё равно про следующий рубеж
  const prevThreshold = unlocked.length > 0 ? unlocked[unlocked.length - 1].threshold : 0;
  const progress = next
    ? Math.min(1, (learned - prevThreshold) / (next.threshold - prevThreshold))
    : 1;

  const swipe = (dir: number) => {
    if (queue.length === 0) return;
    haptic('tap');
    setIdx((i) => (i + dir + queue.length) % queue.length);
  };

  return (
    <div>
      {/* 3D-клинок или силуэт до первого открытия */}
      <motion.div className="blade-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        {equipped && webgl ? (
          <BladeScene blade={equipped} />
        ) : (
          // до первого открытия и без WebGL — силуэт во весь рост сцены
          // подпись не нужна: порог уже виден в полосе прогресса под сценой
          <div className="blade-stage__fallback">
            <BladeGlyph blade={equipped ?? BLADES[0]} locked={!equipped} className="blade-glyph blade-glyph--stage" />
          </div>
        )}
      </motion.div>
      <div className="blade-progress">
        {next ? (
          <>
            <span className="mono" style={{ letterSpacing: '0.08em' }}>
              {learned} / {next.threshold}
            </span>
            <div className="blade-progress__bar">
              <div className="blade-progress__fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <span style={{ width: 20, height: 40, display: 'inline-flex' }}>
              <BladeGlyph blade={next} locked className="" />
            </span>
          </>
        ) : (
          <span className="mono" style={{ margin: '0 auto' }}>
            все клинки открыты
          </span>
        )}
      </div>

      {/* карточка текущего слова */}
      <motion.div custom={0} variants={stagger} initial="hidden" animate="show">
        <Panel tone="active" animated={false}>
          {queue.length === 0 || current === undefined ? (
            <div className="empty-note">На сегодня всё</div>
          ) : (
            <>
              <motion.div
                key={current}
                className="word-hero"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.4}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -60) swipe(1);
                  else if (info.offset.x > 60) swipe(-1);
                }}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <ExampleRing
                  filled={counts.get(current) ?? 0}
                  hasTr={store.translation(current).trim().length > 0}
                >
                  <span className="es-word" style={{ fontSize: 21, textShadow: '0 0 14px var(--accent-glow)' }}>
                    {WORDS[current].word}
                  </span>
                </ExampleRing>
                <div className="word-hero__meta">
                  <LevelBadge level={WORDS[current].level} />
                  <span className="mono">№{WORDS[current].rank}</span>
                </div>
              </motion.div>
              <div className="dots-row">
                {queue.map((id, i) => {
                  const done =
                    store.translation(id).trim().length > 0 &&
                    (counts.get(id) ?? 0) >= store.meta.min_sentences;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-label={WORDS[id].word}
                      onClick={() => setIdx(i)}
                      style={{ background: 'none', border: 'none', padding: 2 }}
                    >
                      <span className={`dot ${done ? 'dot--done' : ''} ${i === idx ? 'dot--current' : ''}`} style={{ display: 'block' }} />
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ flex: 1 }}
                  onClick={() => navigate(`/card/${current}`)}
                >
                  Начать
                </button>
                <button type="button" className="btn btn--ghost-dim" onClick={() => setShowAll((v) => !v)}>
                  Все {queue.length}
                </button>
              </div>
              <AnimatePresence>
                {showAll && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ paddingTop: 10 }}>
                      {queue.map((id, i) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setIdx(i);
                            navigate(`/card/${id}`);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            padding: '8px 4px',
                            background: 'none',
                            border: 'none',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            color: 'var(--text)',
                            textAlign: 'left',
                            opacity: i === idx ? 1 : 0.7,
                          }}
                        >
                          <span className="es-word" style={{ fontSize: 15, flex: 1 }}>
                            {WORDS[id].word}
                          </span>
                          <span className={`dot ${store.translation(id).trim() ? 'dot--done' : ''}`} />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </Panel>
      </motion.div>

      {/* повторение */}
      <motion.div custom={1} variants={stagger} initial="hidden" animate="show">
        {due.length === 0 ? (
          <Panel tone="far" animated={false}>
            <span className="mono">Повторений нет</span>
          </Panel>
        ) : (
          <Panel tone="dim" animated={false}>
            <div className="review-strip">
              <div>
                <div className="count">{due.length}</div>
                <span className="mono">к повторению</span>
              </div>
              <button
                type="button"
                className="btn btn--warm"
                onClick={() => {
                  haptic('tap');
                  warpStarfield();
                  navigate('/review');
                }}
              >
                Начать повторение
              </button>
            </div>
          </Panel>
        )}
      </motion.div>

      {/* мини-карта */}
      <motion.div custom={2} variants={stagger} initial="hidden" animate="show">
        <MiniMap
          statuses={store.statuses}
          level={level}
          version={version}
          flashId={flashId}
          caption={`${level} · ${ls.known + ls.learned + ls.learning} / ${LEVEL_BOUNDS[level][1] - LEVEL_BOUNDS[level][0]}`}
          onClick={() => navigate('/galaxy')}
        />
      </motion.div>
    </div>
  );
}
