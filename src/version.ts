// Самообновление после деплоя.
//
// GitHub Pages отдаёт index.html с Cache-Control: max-age=600 и своих
// заголовков задать не даёт, а <meta http-equiv="Cache-Control"> на HTTP-кеш
// не влияет вовсе — браузеры его игнорируют. WebView Telegram держит страницу
// ещё дольше, и «Очистить кеш» в настройках Telegram чистит медиа-кеш клиента,
// а не кеш WebView. Бандлы адресуются по хешу, поэтому старый index.html
// намертво прибивает приложение к прошлой сборке: сколько ни деплой, ссылки
// в закешированной странице ведут на старые файлы.
//
// Поэтому сверяем версию в рантайме: рядом с бандлом лежит version.json
// с отметкой сборки (кладёт vite.config.ts). Разошлась с зашитой в бандл —
// уходим на тот же адрес с новым ?v=. Url другой, в кеше его нет, WebView
// вынужден сходить на сервер и получить свежий index.html.

const ATTEMPT_KEY = 'update-attempt';

/** Отметка сборки из version.json; null — ответ не тот, что ждём
    (например, Pages вернул html-страницу 404). */
export function parseBuild(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const build = (payload as { build?: unknown }).build;
  return typeof build === 'string' && build !== '' ? build : null;
}

/** Перезагружаться ли: версия на сервере известна, отличается от текущей
    и за неё ещё не пробовали. Последнее условие важно — без него неудачная
    перезагрузка уходит в бесконечный цикл. */
export function needsReload(
  current: string,
  remote: string | null,
  attempted: string | null,
): boolean {
  if (remote === null || remote === current) return false;
  return attempted !== remote;
}

/** sessionStorage в WebView может быть недоступен — молча обходимся без него,
    тогда защита от цикла слабее, но приложение работает. */
function readAttempt(): string | null {
  try {
    return sessionStorage.getItem(ATTEMPT_KEY);
  } catch {
    return null;
  }
}

function saveAttempt(build: string): void {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, build);
  } catch {
    // некритично
  }
}

async function fetchBuild(): Promise<string | null> {
  try {
    // уникальный параметр плюс no-store: version.json тоже отдаётся
    // с max-age=600, без этого мы бы читали закешированный ответ
    const url = `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return parseBuild(await res.json());
  } catch {
    return null;
  }
}

/** Уходим на тот же адрес с меткой версии. replace, а не assign: старая
    страница не должна остаться в истории — по «назад» её достанут из кеша. */
function reloadWith(build: string): void {
  const url = new URL(window.location.href);
  // в отметке «дата · хеш» для url берём только хеш коммита
  url.searchParams.set('v', build.split('·').pop()?.trim() ?? build);
  window.location.replace(url.toString());
}

async function checkForUpdate(): Promise<void> {
  const remote = await fetchBuild();
  if (!needsReload(__BUILD_ID__, remote, readAttempt())) return;
  saveAttempt(remote!);
  reloadWith(remote!);
}

/** Проверка на старте и при каждом возврате в приложение: мини-апп живёт
    свёрнутым сутками, и деплой случается прямо во время сессии. */
export function watchForUpdates(): void {
  if (import.meta.env.DEV) return;
  void checkForUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
}
