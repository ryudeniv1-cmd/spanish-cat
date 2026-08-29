// Мини-карта на «Мостике»: компактная полоса текущего сектора.
// При недавнем «Выучил» звезда слова вспыхивает.
import { useEffect, useRef } from 'react';
import { LEVEL_BOUNDS, Level } from '../data/words';
import { STATUS_COLORS, STRIP_X, STRIP_Y } from './starmath';

interface Props {
  statuses: Uint8Array;
  level: Level;
  version: number;
  flashId: number | null;
  onClick: () => void;
  caption: string;
}

export function MiniMap({ statuses, level, version, flashId, onClick, caption }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = 72;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const [from, to] = LEVEL_BOUNDS[level];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    const flashInBand = flashId !== null && flashId >= from && flashId < to ? flashId : null;
    const started = performance.now();

    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (let id = from; id < to; id++) {
        const st = statuses[id];
        const x = STRIP_X[id] * (w - 8) + 4;
        const y = STRIP_Y[id] * h;
        ctx.fillStyle = STATUS_COLORS[st];
        const r = st === 0 ? 1 : st === 4 ? 2.2 : 1.6;
        if (st >= 2) {
          ctx.shadowColor = STATUS_COLORS[st];
          ctx.shadowBlur = 4;
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      // вспышка недавно выученного слова
      if (flashInBand !== null && !reduced) {
        const t = (now - started) / 1000;
        if (t < 1) {
          const x = STRIP_X[flashInBand] * (w - 8) + 4;
          const y = STRIP_Y[flashInBand] * h;
          ctx.strokeStyle = `rgba(79, 216, 255, ${1 - t})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, 3 + t * 14, 0, Math.PI * 2);
          ctx.stroke();
          raf = requestAnimationFrame(draw);
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [statuses, level, version, flashId]);

  return (
    <button type="button" className="minimap panel" onClick={onClick} aria-label="Открыть карту галактики">
      <span className="panel__inner" style={{ display: 'block', padding: '10px 12px' }}>
        <span className="panel__accent" />
        <canvas ref={canvasRef} />
        <span className="mono" style={{ display: 'block', marginTop: 6 }}>
          {caption}
        </span>
      </span>
    </button>
  );
}
