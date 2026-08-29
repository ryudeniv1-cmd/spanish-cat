// Звёздное небо: статичное поле ~300 звёзд, параллакс при прокрутке (2–3 px)
// и «разгон звёзд» при старте повторения. С prefers-reduced-motion — статика.
import { useEffect, useRef } from 'react';

let warpHandler: (() => void) | null = null;

/** Запустить анимацию «разгона звёзд» (300 мс). */
export function warpStarfield(): void {
  warpHandler?.();
}

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
}

function makeStars(count: number): Star[] {
  let seed = 20260101;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    x: rnd(),
    y: rnd(),
    r: 0.4 + rnd() * 1.2,
    a: 0.15 + rnd() * 0.6,
  }));
}

const STARS = makeStars(300);

export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0;
    let h = 0;
    let raf = 0;
    let warpT = -1; // -1 = нет варпа; 0..1 — прогресс
    let warpStart = 0;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const offset = reduced ? 0 : Math.max(-3, Math.min(3, window.scrollY * 0.02));
      const cx = w / 2;
      const cy = h / 2;
      for (const s of STARS) {
        const x = s.x * w;
        const y = s.y * h - offset * (0.5 + s.r);
        if (warpT >= 0) {
          // штрихи от центра
          const dx = x - cx;
          const dy = y - cy;
          const k = warpT * 0.16;
          ctx.strokeStyle = `rgba(230, 238, 248, ${s.a})`;
          ctx.lineWidth = s.r;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + dx * k, y + dy * k);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(230, 238, 248, ${s.a})`;
          ctx.beginPath();
          ctx.arc(x, y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const scheduleDraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };

    const warpTick = () => {
      const t = (performance.now() - warpStart) / 300;
      if (t >= 1) {
        warpT = -1;
        draw();
        return;
      }
      warpT = t;
      draw();
      raf = requestAnimationFrame(warpTick);
    };

    warpHandler = () => {
      if (reduced) return;
      warpStart = performance.now();
      warpT = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(warpTick);
    };

    resize();
    window.addEventListener('resize', resize);
    if (!reduced) window.addEventListener('scroll', scheduleDraw, { passive: true });
    return () => {
      warpHandler = null;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', scheduleDraw);
    };
  }, []);

  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}
