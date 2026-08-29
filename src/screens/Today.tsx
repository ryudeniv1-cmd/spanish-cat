// Today: клинок и персонаж на платформе, прогресс до следующего клинка,
// задание на сегодня, повторение и карта сектора.
// Вся палитра экрана идёт от --accent, то есть от экипированного клинка.
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useStoreVersion } from '../AppContext';
import { CHARACTERS, clipUrls, isCharacterUnlocked } from '../data/characters';
import { LEVEL_BOUNDS, WORDS } from '../data/words';
import { haptic } from '../telegram';
import { BLADES, bladeById, nextBlade, unlockedBlades } from '../theme/blades';
import { BladeGlyph, webglAvailable } from '../three/glyph';
import { LazyBladeScene as BladeScene } from '../three/lazy';
import { IdleCycler } from '../components/CharacterMedia';
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

/** «22 слова», «25 слов», «1 слово». */
function words(n: number): string {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return 'слово';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'слова';
  return 'слов';
}

/** «10 новых слов», «2 новых слова», «1 новое слово». */
function plural(n: number): string {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return 'новое слово';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'новых слова';
  return 'новых слов';
}

/** Миниатюра клинка в цвете акцента — не привязана к палитре конкретного клинка. */
function MiniSaber() {
  return (
    <svg viewBox="0 0 14 44" className="prog-track__saber" aria-hidden="true">
      <rect x="6" y="2" width="2" height="24" rx="1" fill="var(--accent)" />
      <rect x="5.2" y="26" width="3.6" height="14" rx="1.4" fill="#2a3350" />
      <rect x="4.6" y="29" width="4.8" height="1.4" rx="0.7" fill="var(--accent-dim)" />
      <rect x="4.6" y="32.5" width="4.8" height="1.4" rx="0.7" fill="var(--accent-dim)" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" className="streak__ic" aria-hidden="true">
      <path
        d="M12.6 2.2c.3 3-1.2 4.3-2.7 5.7C8.2 9.5 6.6 11 6.6 14a5.4 5.4 0 0 0 10.8 0c0-1.9-.7-3.1-1.6-4.3-.3 1-.9 1.7-1.7 2 .5-2.4-.3-5.5-1.5-9.5z"
        fill="var(--accent)"
      />
    </svg>
  );
}

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
  const webgl = useMemo(() => webglAvailable(), []);

  const streak = store.streakDays();
  const doneToday = store.learnedToday();
  const norm = store.meta.new_per_day;

  const companion = useMemo(() => {
    const c = CHARACTERS.find((x) => x.id === store.meta.equipped_character);
    if (!c) return null;
    const p = { learned: store.learnedCount(), completedLevels: store.completedLevels() };
    return isCharacterUnlocked(c, p) ? c : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);

  const flashId =
    store.lastLearnedId !== null && Date.now() - store.lastLearnedAt < 6000
      ? store.lastLearnedId
      : null;

  // Отсчёт от последнего пройденного порога, а не от экипированного клинка:
  // можно носить Ember, имея 300 слов, — полоса всё равно про следующий рубеж.
  const prevThreshold = unlocked.length > 0 ? unlocked[unlocked.length - 1].threshold : 0;
  const progress = next
    ? Math.min(1, Math.max(0, (learned - prevThreshold) / (next.threshold - prevThreshold)))
    : 1;

  // Окно из шести порогов вокруг текущей позиции — все 12 на одну полосу не влезают.
  const marks = useMemo(() => {
    const nextIdx = next ? BLADES.indexOf(next) : BLADES.length - 1;
    const start = Math.max(0, Math.min(nextIdx - 1, BLADES.length - 6));
    return BLADES.slice(start, start + 6);
  }, [next]);
  const step = 100 / (marks.length - 1);
  const passed = marks.filter((b) => learned >= b.threshold).length;
  const fill = passed === 0 ? 0 : Math.min(100, (passed - 1) * step + progress * step);

  const levelDone = ls.known + ls.learned + ls.learning;
  const levelTotal = LEVEL_BOUNDS[level][1] - LEVEL_BOUNDS[level][0];

  return (
    <div>
      {/* ===== клинок и персонаж ===== */}
      <div className="today-top">
        <div className="today-top__inner">
          {streak > 0 && (
            <div className="streak">
              <FlameIcon />
              <span className="streak__n">{streak}</span>
              <span className="streak__cap">СЕРИЯ</span>
            </div>
          )}

          <div className="today-stage">
            <div className="saber-col">
              <div className="saber-frame">
                <div className="saber-frame__in">
                  {equipped && webgl ? (
                    <BladeScene blade={equipped} cameraZ={6.5} />
                  ) : (
                    <BladeGlyph
                      blade={equipped ?? BLADES[0]}
                      locked={!equipped}
                      className="blade-glyph blade-glyph--frame"
                    />
                  )}
                </div>
              </div>
              <div className="saber-tag">
                <span className="saber-tag__cap">ТЕКУЩИЙ МЕЧ</span>
                <span className="saber-tag__name">
                  {equipped ? equipped.name.toUpperCase() : 'НЕ ВЫБРАН'}
                </span>
              </div>
            </div>

            <div className="hero-col">
              <div className="hero-stage">
                {/* платформа отдельной обёрткой: параллакс висит на ней,
                    а не на общем родителе — иначе он изолирует смешивание
                    и чёрный фон ролика перестаёт растворяться в небе */}
                <div className="platform-wrap" aria-hidden="true">
                  <div className="platform">
                    <span className="platform__ring platform__ring--1" />
                    <span className="platform__ring platform__ring--2" />
                    <span className="platform__ring platform__ring--3" />
                  </div>
                  <div className="platform__disc" />
                  <div className="platform__wave" />
                </div>
                {companion && <IdleCycler sources={clipUrls(companion)} className="hero-video" />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== прогресс до следующего клинка ===== */}
      <motion.div custom={0} variants={stagger} initial="hidden" animate="show">
        <Panel animated={false}>
          <div className="prog-head">
            <span className="prog-head__lvl">{level}</span>
            <span className="prog-head__sep">·</span>
            <span className="prog-head__num">
              {levelDone} / {levelTotal}
            </span>
          </div>
          <div className="prog-track">
            <span className="prog-track__rail">
              <span className="prog-track__line" />
              <span className="prog-track__fill" style={{ width: `${fill}%` }} />
              {marks.map((b, i) => (
                <span
                  key={b.id}
                  className={`prog-track__dot ${learned >= b.threshold || i === 0 ? 'is-on' : ''}`}
                  style={{ left: `${i * step}%` }}
                  title={`${b.name} · ${b.threshold}`}
                />
              ))}
            </span>
            <MiniSaber />
          </div>
          <div className="prog-note">
            {next ? (
              <>
                Следующая награда: новый меч через <b>{next.threshold - learned}</b>{' '}
                {words(next.threshold - learned)}
              </>
            ) : (
              'Все клинки открыты'
            )}
          </div>
        </Panel>
      </motion.div>

      {/* ===== задание на сегодня ===== */}
      <motion.div custom={1} variants={stagger} initial="hidden" animate="show">
        <Panel tone="active" animated={false}>
          <div className="day-head">
            <span className="day-head__cap">Сегодня</span>
            <span className="day-head__count">
              {doneToday} <span>/ {norm}</span>
            </span>
          </div>
          {queue.length === 0 ? (
            <div className="day-big day-big--empty">На сегодня всё</div>
          ) : (
            <>
              <div className="day-big">
                {queue.length} <span>{plural(queue.length)}</span>
              </div>
              <div className="day-chips">
                {queue.slice(0, 3).map((id) => (
                  <span key={id} className="day-chip">
                    {WORDS[id].word}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="btn-start"
                onClick={() => {
                  haptic('tap');
                  navigate(`/card/${queue[0]}`);
                }}
              >
                <span>Начать</span>
              </button>
            </>
          )}
        </Panel>
      </motion.div>

      {/* ===== повторение ===== */}
      <motion.div custom={2} variants={stagger} initial="hidden" animate="show">
        <Panel animated={false}>
          <button
            type="button"
            className="review-row"
            disabled={due.length === 0}
            onClick={() => {
              haptic('tap');
              warpStarfield();
              navigate('/review');
            }}
          >
            <span className="review-row__ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round">
                <path d="M20 11a8 8 0 0 0-13.7-5.3L4 8" />
                <path d="M4 4v4h4" />
                <path d="M4 13a8 8 0 0 0 13.7 5.3L20 16" />
                <path d="M20 20v-4h-4" />
              </svg>
            </span>
            <span className="review-row__body">
              <span className="review-row__title">Повторение</span>
              <span className="review-row__count">
                <b>{due.length}</b> {words(due.length)}
              </span>
              <span className="review-row__note">
                {due.length > 0 ? 'Готово к повторению' : 'На сегодня всё'}
              </span>
            </span>
            <span className="review-row__arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        </Panel>
      </motion.div>

      {/* ===== карта сектора ===== */}
      <motion.div custom={3} variants={stagger} initial="hidden" animate="show">
        <MiniMap
          statuses={store.statuses}
          level={level}
          version={version}
          flashId={flashId}
          caption={`${level} · ${levelDone} / ${levelTotal}`}
          onClick={() => navigate('/galaxy')}
        />
      </motion.div>
    </div>
  );
}
