// Сцена открытия клинка: затемнение, точка света, рост клинка, вспышка,
// имя по буквам, кнопка «Забрать». 5–6 секунд, пропускается тапом.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../AppContext';
import { haptic } from '../telegram';
import { applyAccent } from '../theme/accent';
import type { Blade } from '../theme/blades';
import { BladeGlyph, webglAvailable } from '../three/glyph';
import { LazyBladeScene as BladeScene } from '../three/lazy';

const EASE = [0.22, 1, 0.36, 1] as const;

interface Props {
  blade: Blade;
  seenCount: number; // новое значение meta.blades_seen после закрытия
  onClose: () => void;
}

export function UnlockOverlay({ blade, seenCount, onClose }: Props) {
  const store = useAppStore();
  // фазы: 0 тьма · 1 точка света · 2 рост клинка · 3 вспышка · 4 имя · 5 кнопка
  const [phase, setPhase] = useState(0);
  const [reveal, setReveal] = useState<number | null>(null);
  const webgl = useMemo(() => webglAvailable(), []);
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    if (reduced || !webgl) {
      setPhase(5);
      setReveal(null);
      haptic('unlock');
      return;
    }
    const start = performance.now();
    setReveal(start);
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1100),
      setTimeout(() => {
        setPhase(3);
        haptic('unlock');
      }, 2400),
      setTimeout(() => setPhase(4), 2800),
      setTimeout(() => setPhase(5), 3400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduced, webgl]);

  const skip = () => {
    if (phase < 5) {
      setPhase(5);
      setReveal(null); // лезвие сразу целиком
    }
  };

  const take = () => {
    store.equipBlade(blade.id);
    store.markBladesSeen(seenCount);
    applyAccent(blade);
    onClose();
  };

  return (
    <motion.div
      className="unlock-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onClick={skip}
    >
      {/* точка света */}
      <AnimatePresence>
        {phase === 1 && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            style={{
              position: 'absolute',
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: blade.core,
              boxShadow: `0 0 60px 22px ${blade.accent}`,
            }}
          />
        )}
      </AnimatePresence>

      {/* сцена */}
      {phase >= 2 && (
        <div className="stage">
          {webgl ? (
            <BladeScene blade={blade} reveal={reveal} interactive={false} bloomIntensity={1.8} />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <BladeGlyph blade={blade} className="blade-glyph" />
            </div>
          )}
        </div>
      )}

      {/* вспышка */}
      <AnimatePresence>
        {phase === 3 && (
          <motion.div
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{ position: 'fixed', inset: 0, background: blade.core, pointerEvents: 'none' }}
          />
        )}
      </AnimatePresence>

      {/* имя по буквам */}
      {phase >= 4 && (
        <div style={{ textAlign: 'center' }}>
          <div className="unlock-name" style={{ color: blade.accent, justifyContent: 'center' }}>
            {blade.name.split('').map((ch, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3, ease: EASE }}
              >
                {ch}
              </motion.span>
            ))}
          </div>
          <motion.div
            className="unlock-tagline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            {blade.tagline}
          </motion.div>
        </div>
      )}

      {/* кнопка */}
      {phase >= 5 && (
        <motion.button
          type="button"
          className="btn btn--primary"
          style={{ marginTop: 22, minWidth: 180 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          onClick={(e) => {
            e.stopPropagation();
            take();
          }}
        >
          Забрать
        </motion.button>
      )}
    </motion.div>
  );
}
