// Обёртка над window.Telegram.WebApp: инициализация, безопасные зоны,
// haptic, подтверждения, буфер обмена. Все вызовы защищены проверками версий.
import { Sfx, sfx } from './audio';

interface TgHaptic {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
}

interface TgBackButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface TgInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number } };
  version: string;
  platform: string;
  colorScheme: string;
  isVersionAtLeast(v: string): boolean;
  ready(): void;
  expand(): void;
  requestFullscreen?(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  safeAreaInset?: TgInset;
  contentSafeAreaInset?: TgInset;
  HapticFeedback?: TgHaptic;
  BackButton?: TgBackButton;
  CloudStorage?: unknown;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export const tg: TgWebApp | undefined =
  typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

export function isInTelegram(): boolean {
  return !!tg && (tg.initData !== '' || (tg.platform !== '' && tg.platform !== 'unknown'));
}

export function cloudStorageAvailable(): boolean {
  try {
    return !!tg?.CloudStorage && tg.isVersionAtLeast('6.9');
  } catch {
    return false;
  }
}

export function telegramUserId(): number | null {
  return tg?.initDataUnsafe?.user?.id ?? null;
}

const BG = '#070A12';

function applySafeArea(): void {
  const root = document.documentElement.style;
  const s = tg?.safeAreaInset;
  const c = tg?.contentSafeAreaInset;
  root.setProperty('--tg-safe-top', `${(s?.top ?? 0) + (c?.top ?? 0)}px`);
  root.setProperty('--tg-safe-bottom', `${s?.bottom ?? 0}px`);
  root.setProperty('--tg-safe-left', `${Math.max(s?.left ?? 0, c?.left ?? 0)}px`);
  root.setProperty('--tg-safe-right', `${Math.max(s?.right ?? 0, c?.right ?? 0)}px`);
}

/** Инициализация Mini App: полноэкранный режим, тёмная тема, безопасные зоны. */
export function initTelegramUi(): void {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.(BG);
    tg.setBackgroundColor?.(BG);
    if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.();
    if (tg.isVersionAtLeast('8.0')) tg.requestFullscreen?.();
  } catch {
    // старые клиенты — просто продолжаем
  }
  applySafeArea();
  for (const ev of ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged']) {
    try {
      tg.onEvent(ev, applySafeArea);
    } catch {
      /* событие не поддерживается */
    }
  }
}

/** Звук в пару к отдаче: одно нажатие — один отклик. */
const HAPTIC_SFX: Record<string, Sfx> = {
  tap: 'tap',
  learned: 'success',
  unlock: 'select',
  remembered: 'soft',
  forgot: 'low',
};

export function haptic(
  kind: 'learned' | 'remembered' | 'forgot' | 'tap' | 'unlock',
  sound: Sfx | false = HAPTIC_SFX[kind],
): void {
  if (sound) sfx(sound);
  const h = tg?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === 'learned') h.notificationOccurred('success');
    else if (kind === 'unlock') {
      h.notificationOccurred('success');
      h.impactOccurred('heavy');
    } else if (kind === 'remembered') h.impactOccurred('light');
    else if (kind === 'forgot') h.notificationOccurred('warning');
    else h.impactOccurred('light');
  } catch {
    /* noop */
  }
}

export function showConfirm(message: string): Promise<boolean> {
  if (tg?.showConfirm && tg.isVersionAtLeast('6.2')) {
    return new Promise((res) => {
      try {
        tg.showConfirm!(message, (ok) => res(ok));
      } catch {
        res(window.confirm(message));
      }
    });
  }
  return Promise.resolve(window.confirm(message));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Кнопка «Назад» Telegram; возвращает функцию отписки. */
export function onTelegramBack(cb: () => void): () => void {
  const b = tg?.BackButton;
  if (!b || !tg?.isVersionAtLeast('6.1')) return () => undefined;
  try {
    b.onClick(cb);
    b.show();
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      b.offClick(cb);
      b.hide();
    } catch {
      /* noop */
    }
  };
}
