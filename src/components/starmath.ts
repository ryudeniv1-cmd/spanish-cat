// Геометрия звёздной карты: детерминированные позиции 5000 звёзд.
// A1 — центральный диск, дальше кольца A2, B1, B2, C1; площадь кольца
// пропорциональна числу слов, поэтому плотность звёзд равномерна.
import { TOTAL_WORDS } from '../storage/codec';

export const LEVEL_CUM = [0, 500, 1200, 2500, 4000, 5000] as const;
export const LEVEL_NAMES = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;

export function bandOf(id: number): number {
  if (id < 500) return 0;
  if (id < 1200) return 1;
  if (id < 2500) return 2;
  if (id < 4000) return 3;
  return 4;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export const STAR_X = new Float32Array(TOTAL_WORDS);
export const STAR_Y = new Float32Array(TOTAL_WORDS);
// координаты для мини-карты (равномерно в прямоугольнике 0..1)
export const STRIP_X = new Float32Array(TOTAL_WORDS);
export const STRIP_Y = new Float32Array(TOTAL_WORDS);

for (let id = 0; id < TOTAL_WORDS; id++) {
  const rng = mulberry32(Math.imul(id + 1, 2654435761));
  const b = bandOf(id);
  const r = Math.sqrt((LEVEL_CUM[b] + rng() * (LEVEL_CUM[b + 1] - LEVEL_CUM[b])) / TOTAL_WORDS);
  const ang = rng() * Math.PI * 2;
  STAR_X[id] = r * Math.cos(ang);
  STAR_Y[id] = r * Math.sin(ang);
  STRIP_X[id] = rng();
  STRIP_Y[id] = 0.1 + rng() * 0.8;
}

// цвет и размер звезды по статусу (new, known, learning, review, mastered);
// «Учу» — акцент экипированного клинка, читается из CSS-переменной
export function statusColors(): string[] {
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4FD8FF';
  return ['#33405C', '#7A8AA6', accent, '#FFB454', '#FFFFFF'];
}
const SPRITE_R = [1.5, 1.9, 2.3, 2.5, 3.0] as const;
const SPRITE_GLOW = [0, 0, 5, 6, 8] as const;

/** '#RRGGBB' или 'rgb(r, g, b)' -> 'rgba(r, g, b, a)'. */
export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  return color;
}

/** Пререндер спрайтов звёзд (быстрее, чем 5000 arc() за кадр). */
export function makeSprites(dpr: number): { canvas: HTMLCanvasElement; half: number }[] {
  return statusColors().map((color, i) => {
    const r = SPRITE_R[i];
    const glow = SPRITE_GLOW[i];
    const half = r + glow + 1;
    const size = Math.ceil(half * 2 * dpr);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const cx = half;
    if (glow > 0) {
      const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, half);
      g.addColorStop(0, color);
      g.addColorStop(0.4, withAlpha(color, 0.33));
      g.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, half * 2, half * 2);
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    ctx.fill();
    return { canvas: c, half };
  });
}
