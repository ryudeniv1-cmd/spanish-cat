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
}: {
  sources: string[];
  className?: string;
  label?: string;
  /** вне сетки (полноэкранный просмотр, Today) — играет всегда, мимо пула */
  standalone?: boolean;
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

  if (!src) return null;

  return (
    <video
      ref={ref}
      className={className ?? 'char-video'}
      src={src}
      autoPlay={!reduced && standalone}
      loop
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
