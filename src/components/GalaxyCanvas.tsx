// Карта галактики: 5000 слов-звёзд на одном canvas, масштабирование щипком,
// перетаскивание, нажатие на звезду — подсказка (через onSelect).
import { useCallback, useEffect, useRef } from 'react';
import { TOTAL_WORDS } from '../storage/codec';
import type { LevelStats } from '../store';
import { LEVEL_CUM, LEVEL_NAMES, STAR_X, STAR_Y, makeSprites } from './starmath';

interface Props {
  statuses: Uint8Array;
  stats: LevelStats[];
  version: number;
  height: number;
  onSelect: (id: number | null, x: number, y: number) => void;
}

interface View {
  zoom: number;
  cx: number; // мировая точка в центре экрана
  cy: number;
}

export function GalaxyCanvas({ statuses, stats, version, height, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ zoom: 1, cx: 0, cy: 0 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const spritesRef = useRef<ReturnType<typeof makeSprites> | null>(null);
  const rafRef = useRef(0);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const baseScale = useCallback(() => {
    const { w, h } = sizeRef.current;
    return (Math.min(w, h) / 2) * 0.94;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (!spritesRef.current) spritesRef.current = makeSprites(dpr);
    const sprites = spritesRef.current;
    const { w, h } = sizeRef.current;
    const v = viewRef.current;
    const S = baseScale() * v.zoom;
    const ox = w / 2 - v.cx * S;
    const oy = h / 2 - v.cy * S;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // направляющие кольца секторов
    ctx.strokeStyle = 'rgba(79, 216, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      const r = Math.sqrt(LEVEL_CUM[i] / TOTAL_WORDS) * S;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // звёзды (с отсечением за пределами экрана)
    const margin = 12;
    for (let id = 0; id < TOTAL_WORDS; id++) {
      const sx = STAR_X[id] * S + ox;
      if (sx < -margin || sx > w + margin) continue;
      const sy = STAR_Y[id] * S + oy;
      if (sy < -margin || sy > h + margin) continue;
      const sp = sprites[statuses[id]];
      ctx.drawImage(
        sp.canvas,
        sx - sp.half,
        sy - sp.half,
        sp.half * 2,
        sp.half * 2,
      );
    }

    // подписи секторов сверху
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      const rMid =
        ((Math.sqrt(LEVEL_CUM[i] / TOTAL_WORDS) + Math.sqrt(LEVEL_CUM[i + 1] / TOTAL_WORDS)) / 2) * S;
      const s = stats[i];
      const touched = s.known + s.learned + s.learning;
      const y = oy - rMid;
      if (y < 4 || y > h) continue;
      ctx.fillStyle = 'rgba(143, 163, 191, 0.95)';
      ctx.fillText(`${LEVEL_NAMES[i]} · ${touched}/${s.total}`, ox, y - 4);
    }
  }, [statuses, stats, baseScale, dpr]);

  const scheduleDraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // размер и DPR
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      const h = height;
      sizeRef.current = { w, h };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      scheduleDraw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [height, dpr, scheduleDraw]);

  useEffect(() => {
    scheduleDraw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [version, scheduleDraw]);

  // жесты
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; t: number } | null = null;
    let moved = false;
    let pinchDist = 0;
    let pinchZoom = 1;

    const clampView = () => {
      const v = viewRef.current;
      v.zoom = Math.min(14, Math.max(0.7, v.zoom));
      v.cx = Math.max(-1.1, Math.min(1.1, v.cx));
      v.cy = Math.max(-1.1, Math.min(1.1, v.cy));
    };

    const toLocal = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = toLocal(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        start = { ...p, t: performance.now() };
        moved = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        pinchZoom = viewRef.current.zoom;
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = toLocal(e);
      const prev = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, p);
      const v = viewRef.current;
      const S = baseScale() * v.zoom;
      if (pointers.size === 1) {
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        if (Math.abs(p.x - (start?.x ?? p.x)) + Math.abs(p.y - (start?.y ?? p.y)) > 6) moved = true;
        v.cx -= dx / S;
        v.cy -= dy / S;
        clampView();
        scheduleDraw();
      } else if (pointers.size === 2) {
        moved = true;
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) {
          const { w, h } = sizeRef.current;
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const before = screenToWorld(midX, midY, v, baseScale(), w, h);
          v.zoom = pinchZoom * (d / pinchDist);
          clampView();
          const after = screenToWorld(midX, midY, v, baseScale(), w, h);
          v.cx += before.x - after.x;
          v.cy += before.y - after.y;
          clampView();
          scheduleDraw();
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      const wasTap =
        pointers.size === 1 && !moved && start && performance.now() - start.t < 400;
      pointers.delete(e.pointerId);
      if (wasTap && start) {
        const v = viewRef.current;
        const S = baseScale() * v.zoom;
        const { w, h } = sizeRef.current;
        const world = screenToWorld(start.x, start.y, v, baseScale(), w, h);
        let best = -1;
        let bestD = (12 / S) * (12 / S);
        for (let id = 0; id < TOTAL_WORDS; id++) {
          const dx = STAR_X[id] - world.x;
          const dy = STAR_Y[id] - world.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = id;
          }
        }
        if (best >= 0) onSelect(best, start.x, start.y);
        else onSelect(null, 0, 0);
        start = null;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const p = toLocal(e);
      const { w, h } = sizeRef.current;
      const before = screenToWorld(p.x, p.y, v, baseScale(), w, h);
      v.zoom *= e.deltaY < 0 ? 1.15 : 1 / 1.15;
      clampView();
      const after = screenToWorld(p.x, p.y, v, baseScale(), w, h);
      v.cx += before.x - after.x;
      v.cy += before.y - after.y;
      clampView();
      scheduleDraw();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [baseScale, onSelect, scheduleDraw]);

  return (
    <div ref={wrapRef} className="galaxy-wrap" style={{ height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function screenToWorld(
  sx: number,
  sy: number,
  v: View,
  base: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const S = base * v.zoom;
  return { x: (sx - w / 2) / S + v.cx, y: (sy - h / 2) / S + v.cy };
}
