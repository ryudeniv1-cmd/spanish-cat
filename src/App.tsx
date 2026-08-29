import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAppStore, useStoreVersion } from './AppContext';
import { Background } from './components/Background';
import { CompanionLayer } from './components/CompanionLayer';
import { TabBar } from './components/TabBar';
import { applyAccent } from './theme/accent';
import { BLADES, bladeById, unlockedBlades } from './theme/blades';
import { Archive } from './screens/Archive';
import { Armory } from './screens/Armory';
import { MapScreen } from './screens/MapScreen';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';
import { Today } from './screens/Today';
import { UnlockOverlay } from './screens/UnlockOverlay';
import { WordCard } from './screens/WordCard';

// Смена вкладки — сдвиг вбок; открытие карточки слова — раскрытие из строки.
// Только появление: анимации ухода здесь быть не может — см. Layout.
const SLIDE = {
  initial: { opacity: 0, x: 26 },
  animate: { opacity: 1, x: 0 },
};
const EXPAND = {
  initial: { opacity: 0, scale: 0.93, y: 18 },
  animate: { opacity: 1, scale: 1, y: 0 },
};

// Вкладки, кроме Today. Today рендерится и по '/', и по маршруту '*' —
// Telegram при запуске кладёт параметры в хеш (#tgWebAppData=...), и путь
// тогда не '/', поэтому проверять на равенство '/' нельзя.
const NOT_TODAY = ['/lexicon', '/galaxy', '/armory', '/settings', '/archive', '/map'];

function Layout() {
  const location = useLocation();
  const card = location.pathname.startsWith('/card');
  const bare = card || location.pathname.startsWith('/review');
  const today = !bare && !NOT_TODAY.some((p) => location.pathname.startsWith(p));
  return (
    <>
      <Background />
      {/* персонаж поверх неба, но под всем содержимым — только на Today */}
      {today && <CompanionLayer />}
      <div className={bare ? 'app app--bare' : 'app'}>
        {/* Смена key перемонтирует обёртку — этого достаточно, чтобы новый
            экран появился с анимацией. AnimatePresence с exit здесь работать
            не может: <Outlet/> внутри «уходящего» элемента рендерит уже новый
            маршрут, поэтому наружу уезжал не старый экран, а новый — он же
            и оставался невидимым, если анимация ухода не доигрывала. */}
        <motion.div
          key={location.pathname}
          {...(card ? EXPAND : SLIDE)}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.div>
      </div>
      {!bare && <TabBar />}
    </>
  );
}

function Loading() {
  return (
    <div className="gate">
      <Background />
      <div className="loading-star" />
      <span className="mono">синхронизация с бортовым хранилищем…</span>
    </div>
  );
}

/** Вспышка акцентного света на весь экран при «Выучил». */
function LearnedFlash() {
  const store = useAppStore();
  useStoreVersion();
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (store.lastLearnedAt > at && Date.now() - store.lastLearnedAt < 1500) {
      setAt(store.lastLearnedAt);
    }
  }, [store.lastLearnedAt, at]);
  return (
    <AnimatePresence>
      {at > 0 && Date.now() - at < 1500 && (
        <motion.div
          key={at}
          className="screen-flash"
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          onAnimationComplete={() => setAt(0)}
        />
      )}
    </AnimatePresence>
  );
}

/** Показ сцены открытия, когда выучено достаточно слов для нового клинка. */
function UnlockWatcher() {
  const store = useAppStore();
  useStoreVersion();
  const learned = store.learnedCount();
  const unlocked = unlockedBlades(learned).length;
  const seen = store.meta.blades_seen;
  if (unlocked <= seen) return null;
  const blade = BLADES[seen];
  return <UnlockOverlay blade={blade} seenCount={seen + 1} onClose={() => undefined} />;
}

export function App() {
  const store = useAppStore();
  useStoreVersion();

  // акцент экипированного клинка при старте
  useEffect(() => {
    if (store.ready) applyAccent(bladeById(store.meta.equipped_blade), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready]);

  if (!store.ready) return <Loading />;

  return (
    <HashRouter>
      <LearnedFlash />
      <UnlockWatcher />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Today />} />
          <Route path="lexicon" element={<Archive />} />
          <Route path="galaxy" element={<MapScreen />} />
          <Route path="armory" element={<Armory />} />
          <Route path="settings" element={<Settings />} />
          <Route path="card/:id" element={<WordCard />} />
          <Route path="review" element={<Review />} />
          {/* старые пути */}
          <Route path="archive" element={<Navigate to="/lexicon" replace />} />
          <Route path="map" element={<Navigate to="/galaxy" replace />} />
          <Route path="*" element={<Today />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
