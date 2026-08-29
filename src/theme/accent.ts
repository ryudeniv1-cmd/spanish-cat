// Акцент приложения = цвет экипированного клинка.
// Переменные --accent / --accent-glow / --accent-dim интерполируются 600 мс.
import { Blade, DEFAULT_ACCENT } from './blades';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

let current: [number, number, number] = hexToRgb(DEFAULT_ACCENT.accent);
let current2: [number, number, number] = hexToRgb(DEFAULT_ACCENT.accent2);
let raf = 0;

function setVars(rgb: [number, number, number], rgb2: [number, number, number]): void {
  const s = document.documentElement.style;
  const [r, g, b] = rgb;
  s.setProperty('--accent', `rgb(${r}, ${g}, ${b})`);
  s.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.35)`);
  s.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.14)`);
  s.setProperty('--accent-dim', `rgba(${r}, ${g}, ${b}, 0.55)`);
  s.setProperty('--accent2', `rgb(${rgb2[0]}, ${rgb2[1]}, ${rgb2[2]})`);
}

export function applyAccent(blade: Blade | undefined, animate = true): void {
  const target = hexToRgb(blade?.accent ?? DEFAULT_ACCENT.accent);
  const target2 = hexToRgb(blade?.accent2 ?? DEFAULT_ACCENT.accent2);
  cancelAnimationFrame(raf);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduced) {
    current = target;
    current2 = target2;
    setVars(target, target2);
    return;
  }
  const from = current;
  const from2 = current2;
  const started = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - started) / 600);
    const e = 1 - Math.pow(1 - t, 3);
    const rgb = from.map((v, i) => v + (target[i] - v) * e) as [number, number, number];
    const rgb2 = from2.map((v, i) => v + (target2[i] - v) * e) as [number, number, number];
    setVars(rgb, rgb2);
    if (t < 1) raf = requestAnimationFrame(tick);
    else {
      current = target;
      current2 = target2;
    }
  };
  raf = requestAnimationFrame(tick);
}

export { mix, hexToRgb };
