import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AppStore } from './store';

export const StoreContext = createContext<AppStore | null>(null);

export function useAppStore(): AppStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext не инициализирован');
  return store;
}

/** Подписка на изменения состояния (версия растёт при каждом emit). */
export function useStoreVersion(): number {
  const store = useAppStore();
  return useSyncExternalStore(store.subscribe, store.getVersion);
}
