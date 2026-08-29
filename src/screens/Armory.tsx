// Armory: сетка клинков, полноэкранный просмотр, «Экипировать».
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useAppStore, useStoreVersion } from '../AppContext';
import { haptic } from '../telegram';
import { applyAccent } from '../theme/accent';
import { BLADES, Blade } from '../theme/blades';
import { BladeGlyph, webglAvailable } from '../three/glyph';
import { LazyBladeScene as BladeScene } from '../three/lazy';

export function Armory() {
  const store = useAppStore();
  useStoreVersion();
  const [view, setView] = useState<Blade | null>(null);

  const learned = store.learnedCount();
  const unlockedCount = BLADES.filter((b) => learned >= b.threshold).length;
  const equippedId = store.meta.equipped_blade;
  const webgl = webglAvailable();

  return (
    <div>
      <div className="topbar" style={{ justifyContent: 'space-between' }}>
        <h1 className="screen-title" style={{ margin: 0 }}>
          Armory
        </h1>
        <span className="mono" style={{ fontSize: 13 }}>
          {unlockedCount} / {BLADES.length}
        </span>
      </div>

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
      </AnimatePresence>
    </div>
  );
}
