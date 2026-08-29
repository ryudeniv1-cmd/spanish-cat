// Idle-ролики персонажей и силуэт закрытой карточки.
//
// Все видимые ролики обслуживает один общий пул: IntersectionObserver
// отмечает попавшие в кадр карточки, играют только первые MAX_PLAYING
// сверху вниз, остальные стоят на паузе. При prefers-reduced-motion
// ролик не запускается вовсе — показывается первый кадр.
import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

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
  return (
    <svg
      viewBox="0 0 90 124"
      className={className ?? 'char-silhouette'}
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
    >
      <g fill="#0e1425" stroke="rgba(255,255,255,0.07)" strokeWidth="1">
        <ellipse cx="45" cy="26" rx="11" ry="13" />
        {/* плечи, руки вдоль тела и уходящий за нижний край плащ */}
        <path d="M45 40c-4.4 0-7 1-8 2.7-1.1 1.9-6.2 3.4-10.4 6.3-4.5 3.1-6.9 8-7.6 14.3L15.6 106c-.6 5.4.3 12 2.7 18h53.4c2.4-6 3.3-12.6 2.7-18l-3.4-42.7c-.7-6.3-3.1-11.2-7.6-14.3-4.2-2.9-9.3-4.4-10.4-6.3C52 41 49.4 40 45 40z" />
      </g>
    </svg>
  );
}
