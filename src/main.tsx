import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { StoreContext } from './AppContext';
import { Starfield } from './components/Starfield';
import { AppStore } from './store';
import { localAdapter, telegramAdapter, type StorageAdapter } from './storage/adapter';
import { cloudStorageAvailable, initTelegramUi, isInTelegram, tg } from './telegram';

function Gate() {
  return (
    <div className="gate">
      <Starfield />
      <div className="loading-star" style={{ animation: 'none' }} />
      <h1>Открой приложение через Telegram</h1>
      <p style={{ color: 'var(--text2)', maxWidth: 420 }}>
        Данные хранятся в облаке Telegram и доступны только внутри мини-приложения. Открой бота и
        нажми кнопку меню — мостик будет ждать.
      </p>
    </div>
  );
}

initTelegramUi();

let adapter: StorageAdapter | null = null;
if (isInTelegram() && cloudStorageAvailable()) {
  adapter = telegramAdapter(tg!.CloudStorage as Parameters<typeof telegramAdapter>[0]);
} else if (import.meta.env.DEV) {
  // локальная разработка вне Telegram — адаптер поверх localStorage
  adapter = localAdapter();
}

const root = createRoot(document.getElementById('root')!);

if (!adapter) {
  root.render(<Gate />);
} else {
  const store = new AppStore(adapter);
  void store.init();
  // при сворачивании — дописать очередь записи; при разворачивании в новый
  // календарный день — пополнить задание на сегодня
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void store.queue.flushNow();
    else if (store.ready) store.dailyRefill();
  });
  root.render(
    <StrictMode>
      <StoreContext.Provider value={store}>
        <App />
      </StoreContext.Provider>
    </StrictMode>,
  );
}
