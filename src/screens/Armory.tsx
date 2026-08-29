// Armory: два раздела — клинки и экипаж.
// Blades — сетка клинков, полноэкранный просмотр, «Экипировать».
// Crew — сетка персонажей: открытые играют idle-роликом, закрытые силуэт.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore, useStoreVersion } from '../AppContext';
import { CharacterSilhouette, IdleVideo, suspendIdleVideos } from '../components/CharacterMedia';
import {
  CHARACTERS,
  Character,
  clipUrls,
  isCharacterUnlocked,
  unlockLabel,
} from '../data/characters';
import { haptic } from '../telegram';
import { applyAccent } from '../theme/accent';
import { BLADES, Blade } from '../theme/blades';
import { BladeGlyph, webglAvailable } from '../three/glyph';
import { LazyBladeScene as BladeScene } from '../three/lazy';

type Tab = 'blades' | 'crew';
const TABS: { id: Tab; label: string }[] = [
  { id: 'blades', label: 'Blades' },
  { id: 'crew', label: 'Crew' },
];

export function Armory() {
  const store = useAppStore();
  const version = useStoreVersion();
  const [tab, setTab] = useState<Tab>('blades');
  const [view, setView] = useState<Blade | null>(null);
  const [crewView, setCrewView] = useState<Character | null>(null);

  const learned = store.learnedCount();
  const unlockedBladeCount = BLADES.filter((b) => learned >= b.threshold).length;
  const equippedId = store.meta.equipped_blade;
  const equippedChar = store.meta.equipped_character;
  // проверка создаёт WebGL-контекст — только один раз на монтирование
  const webgl = useMemo(() => webglAvailable(), []);

  const progress = useMemo(
    () => ({ learned: store.learnedCount(), completedLevels: store.completedLevels() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version],
  );
  const unlockedCrewCount = CHARACTERS.filter((c) => isCharacterUnlocked(c, progress)).length;

  // пока открыт полноэкранный просмотр, ролики в сетке стоят
  useEffect(() => {
    suspendIdleVideos(crewView !== null);
    return () => suspendIdleVideos(false);
  }, [crewView]);

  return (
    <div>
      <div className="topbar" style={{ justifyContent: 'space-between' }}>
        <h1 className="screen-title" style={{ margin: 0 }}>
          Armory
        </h1>
        <span className="mono" style={{ fontSize: 13 }}>
          {tab === 'blades'
            ? `${unlockedBladeCount} / ${BLADES.length}`
            : `${unlockedCrewCount} / ${CHARACTERS.length}`}
        </span>
      </div>

      <div className="seg" role="tablist" aria-label="Раздел Armory">
        <span className={`seg__pill ${tab === 'crew' ? 'seg__pill--right' : ''}`} aria-hidden="true" />
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`seg__btn ${tab === t.id ? 'seg__btn--on' : ''}`}
            onClick={() => {
              if (tab === t.id) return;
              haptic('tap');
              setTab(t.id);
            }}
          >
            <span className="seg__label">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'blades' ? (
        <div className="armory-grid">
          {BLADES.map((b, i) => {
            const unlocked = learned >= b.threshold;
            const equipped = equippedId === b.id;
            return (
              <motion.button
                key={b.id}
                type="button"
                className={`blade-card ${equipped ? 'blade-card--equipped' : ''} ${unlocked ? '' : 'blade-card--locked'}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: unlocked ? 1 : 0.55, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => {
                  if (unlocked) {
                    haptic('tap');
                    setView(b);
                  }
                }}
                style={unlocked ? { boxShadow: equipped ? undefined : `0 0 18px ${b.accent}22` } : undefined}
              >
                <BladeGlyph blade={b} locked={!unlocked} />
                <div className="blade-card__name" style={unlocked ? { color: b.accent } : undefined}>
                  {b.name}
                </div>
                <div className="blade-card__sub">
                  {unlocked
                    ? equipped
                      ? 'экипирован'
                      : `${b.threshold} слов`
                    : `до открытия: ${b.threshold - learned} слов`}
                </div>
              </motion.button>
            );
          })}
        </div>
      ) : (
        <div className="armory-grid">
          {CHARACTERS.map((c, i) => {
            const unlocked = isCharacterUnlocked(c, progress);
            const onToday = unlocked && equippedChar === c.id;
            const need = unlockLabel(c);
            // у доступного всегда персонажа строки с условием нет — только имя
            const sub = unlocked ? (onToday ? 'на Today' : need && `открыт за ${need}`) : need;
            return (
              <motion.button
                key={c.id}
                type="button"
                className={`char-card ${onToday ? 'char-card--equipped' : ''} ${unlocked ? '' : 'char-card--locked'}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => {
                  if (!unlocked) return;
                  haptic('tap');
                  setCrewView(c);
                }}
              >
                <div className="char-card__media">
                  {unlocked ? (
                    // закрытым видео не грузится вообще — только силуэт
                    <IdleVideo sources={clipUrls(c)} label={c.name} />
                  ) : (
                    <CharacterSilhouette />
                  )}
                </div>
                <div className="char-card__name">{unlocked ? c.name : '???'}</div>
                {sub && <div className="char-card__sub">{sub}</div>}
              </motion.button>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {view && (
          <motion.div
            className="blade-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="topbar" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="back-btn" onClick={() => setView(null)}>
                Закрыть
              </button>
            </div>
            <div className="blade-view__stage">
              {webgl ? (
                <BladeScene blade={view} bloomIntensity={1.7} />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <BladeGlyph blade={view} className="blade-glyph" />
                </div>
              )}
            </div>
            <h2 style={{ color: view.accent }}>{view.name}</h2>
            <p className="tagline">{view.tagline}</p>
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={equippedId === view.id}
              onClick={() => {
                haptic('learned');
                store.equipBlade(view.id);
                applyAccent(view);
                setView(null);
              }}
            >
              {equippedId === view.id ? 'Экипирован' : 'Экипировать'}
            </button>
          </motion.div>
        )}

        {crewView && (
          <motion.div
            className="blade-view char-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="topbar" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="back-btn" onClick={() => setCrewView(null)}>
                Закрыть
              </button>
            </div>
            <div className="char-view__stage">
              <IdleVideo
                sources={clipUrls(crewView)}
                className="char-view__video"
                label={crewView.name}
                standalone
              />
            </div>
            <h2>{crewView.name}</h2>
            {unlockLabel(crewView) && (
              <p className="tagline">открыт за {unlockLabel(crewView)}</p>
            )}
            {equippedChar === crewView.id ? (
              <button
                type="button"
                className="btn btn--ghost-dim btn--block"
                onClick={() => {
                  haptic('tap');
                  store.equipCharacter('');
                  setCrewView(null);
                }}
              >
                Убрать с Today
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--block"
                onClick={() => {
                  haptic('learned');
                  store.equipCharacter(crewView.id);
                  setCrewView(null);
                }}
              >
                Поставить на Today
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
