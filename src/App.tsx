import { HashRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAppStore, useStoreVersion } from './AppContext';
import { Starfield } from './components/Starfield';
import { TabBar } from './components/TabBar';
import { Archive } from './screens/Archive';
import { Bridge } from './screens/Bridge';
import { MapScreen } from './screens/MapScreen';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';
import { WordCard } from './screens/WordCard';

function Layout() {
  const location = useLocation();
  const bare = location.pathname.startsWith('/card') || location.pathname.startsWith('/review');
  return (
    <>
      <Starfield />
      <div className={bare ? 'app app--bare' : 'app'}>
        <Outlet />
      </div>
      {!bare && <TabBar />}
    </>
  );
}

function Loading() {
  return (
    <div className="gate">
      <Starfield />
      <div className="loading-star" />
      <span className="mono">синхронизация с бортовым хранилищем…</span>
    </div>
  );
}

export function App() {
  const store = useAppStore();
  useStoreVersion();

  if (!store.ready) return <Loading />;

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Bridge />} />
          <Route path="archive" element={<Archive />} />
          <Route path="map" element={<MapScreen />} />
          <Route path="settings" element={<Settings />} />
          <Route path="card/:id" element={<WordCard />} />
          <Route path="review" element={<Review />} />
          <Route path="*" element={<Bridge />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
