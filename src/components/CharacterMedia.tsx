// Idle-ролики персонажей и силуэт закрытой карточки.
//
// Все видимые ролики обслуживает один общий пул: IntersectionObserver
// отмечает попавшие в кадр карточки, играют только первые MAX_PLAYING
// сверху вниз, остальные стоят на паузе. При prefers-reduced-motion
// ролик не запускается вовсе — показывается первый кадр.
import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
// через сборщик, а не абсолютным путём: иначе на GitHub Pages потеряется base
import silhouetteUrl from '../presets/siluet.png';

const MAX_PLAYING = 4;

const visible: HTMLVideoElement[] = [];
let suspended = false;
let io: IntersectionObserver | null = null;

function sync(): void {
  visible.forEach((v, i) => {
    if (!suspended && i < MAX_PLAYING) {
      if (v.paused) void v.play().catch(() => undefined);
    } else if (!v.paused) {
      v.pause();
    }
  });
}

/** Можно ли этому ролику играть прямо сейчас. */
function allowed(el: HTMLVideoElement): boolean {
  const at = visible.indexOf(el);
  return !suspended && at >= 0 && at < MAX_PLAYING;
}

/** Вставка с сохранением порядка документа: играют верхние карточки. */
function add(el: HTMLVideoElement): void {
  if (visible.includes(el)) return;
  const at = visible.findIndex(
    (o) => (o.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0,
  );
  if (at < 0) visible.push(el);
  else visible.splice(at, 0, el);
}

function drop(el: HTMLVideoElement): void {
  const at = visible.indexOf(el);
  if (at >= 0) visible.splice(at, 1);
  if (!el.paused) el.pause();
}

function observer(): IntersectionObserver {
  if (!io) {
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) add(v);
          else drop(v);
        }
        sync();
      },
      // небольшой запас, чтобы карточка успела начать играть до появления
      { rootMargin: '100px', threshold: 0.15 },
    );
  }
  return io;
}

/** Пауза всей сетке, пока открыт полноэкранный просмотр. */
export function suspendIdleVideos(on: boolean): void {
  suspended = on;
  sync();
}

export function IdleVideo({
  sources,
  className,
  label,
  standalone,
  holdMs,
}: {
  sources: string[];
  className?: string;
  label?: string;
  /** вне сетки (полноэкранный просмотр, Today) — играет всегда, мимо пула */
  standalone?: boolean;
  /** пауза между проигрываниями вместо непрерывного цикла */
  holdMs?: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();
  // случайный ролик выбирается один раз на всё время жизни карточки
  const [src] = useState(() => sources[Math.floor(Math.random() * sources.length)]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    if (reduced) {
      v.pause();
      // первый кадр без воспроизведения: перемотка в начало заставляет
      // браузер отрисовать кадр, дальше ролик стоит
      const frame = () => {
        try {
          v.currentTime = 0.001;
        } catch {
          /* кадр появится сам, когда метаданные догрузятся */
        }
      };
      if (v.readyState >= 1) frame();
      else v.addEventListener('loadedmetadata', frame, { once: true });
      return () => v.removeEventListener('loadedmetadata', frame);
    }

    if (standalone) {
      void v.play().catch(() => undefined);
      return;
    }


    const obs = observer();
    obs.observe(v);
    return () => {
      obs.unobserve(v);
      drop(v);
    };
  }, [reduced, standalone]);

  // Пауза между проигрываниями: ролик доигрывает, замирает на последнем
  // кадре на holdMs и запускается снова.
  useEffect(() => {
    const v = ref.current;
    if (!v || !holdMs || reduced) return;
    let timer = 0;
    const onEnded = () => {
      timer = window.setTimeout(() => {
        v.currentTime = 0;
        void v.play().catch(() => undefined);
      }, holdMs);
    };
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('ended', onEnded);
      if (timer) clearTimeout(timer);
    };
  }, [holdMs, reduced]);

  if (!src) return null;

  return (
    <video
      ref={ref}
      className={className ?? 'char-video'}
      src={src}
      autoPlay={!reduced && standalone}
      loop={!holdMs}
      muted
      playsInline
      preload="metadata"
      disablePictureInPicture
      aria-label={label}
      onPlay={
        standalone
          ? undefined
          : (e) => {
              // страховка: браузер мог сам возобновить ролик сверх лимита
              const v = e.currentTarget;
              if (!allowed(v)) v.pause();
            }
      }
    />
  );
}

/** Тёмный силуэт фигуры для закрытой карточки: видео не грузится. */
export function CharacterSilhouette({ className }: { className?: string }) {
  return <img className={className ?? 'char-silhouette'} src={silhouetteUrl} alt="" aria-hidden="true" />;
}

/**
 * Персонаж на Today: один ролик целиком, пауза 5–10 с на последнем кадре,
 * затем следующий случайный. Два наложенных <video> с кроссфейдом — пока
 * играет передний, задний уже держит первый кадр следующего ролика, поэтому
 * смены не видно: ни рывка, ни чёрного кадра.
 */
const HOLD_MIN = 5000;
const HOLD_MAX = 10000;
const FADE_MS = 420;

export function IdleCycler({ sources, className }: { sources: string[]; className?: string }) {
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b || sources.length === 0) return;

    let alive = true;
    let holdTimer = 0;
    let swapTimer = 0;
    let front = 0;

    const pick = (not?: string): string => {
      const pool = sources.length > 1 ? sources.filter((s) => s !== not) : sources;
      return pool[Math.floor(Math.random() * pool.length)];
    };
    const el = (i: number) => (i === 0 ? a! : b!);

    // первый кадр появляется и без воспроизведения: перемотка в начало
    const showFirstFrame = (v: HTMLVideoElement) => {
      const seek = () => {
        try {
          v.currentTime = 0.001;
        } catch {
          /* кадр появится, когда догрузятся метаданные */
        }
      };
      if (v.readyState >= 1) seek();
      else v.addEventListener('loadedmetadata', seek, { once: true });
    };

    let frontSrc = pick();
    a.src = frontSrc;
    a.style.opacity = '1';
    b.style.opacity = '0';

    if (reduced) {
      showFirstFrame(a);
      return () => {
        alive = false;
      };
    }

    let backSrc = pick(frontSrc);
    b.src = backSrc;
    showFirstFrame(b);

    const onEnded = () => {
      if (!alive) return;
      // ролик замер на последнем кадре — держим паузу и уходим в следующий
      const hold = HOLD_MIN + Math.random() * (HOLD_MAX - HOLD_MIN);
      holdTimer = window.setTimeout(swap, hold);
    };

    const swap = () => {
      if (!alive) return;
      const cur = el(front);
      const nxt = el(1 - front);
      void nxt.play().catch(() => undefined);
      nxt.style.opacity = '1';
      cur.style.opacity = '0';
      front = 1 - front;
      frontSrc = backSrc;
      // освободившийся элемент готовит следующий ролик уже под кроссфейдом
      swapTimer = window.setTimeout(() => {
        if (!alive) return;
        cur.pause();
        backSrc = pick(frontSrc);
        cur.src = backSrc;
        cur.load();
        showFirstFrame(cur);
      }, FADE_MS + 60);
    };

    a.addEventListener('ended', onEnded);
    b.addEventListener('ended', onEnded);
    void a.play().catch(() => undefined);

    return () => {
      alive = false;
      clearTimeout(holdTimer);
      clearTimeout(swapTimer);
      a.removeEventListener('ended', onEnded);
      b.removeEventListener('ended', onEnded);
      a.pause();
      b.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, sources.join('|')]);

  if (sources.length === 0) return null;

  return (
    <>
      <video ref={aRef} className={className} muted playsInline preload="auto" disablePictureInPicture aria-hidden="true" />
      <video ref={bRef} className={className} muted playsInline preload="auto" disablePictureInPicture aria-hidden="true" />
    </>
  );
}
