// Живой космический фон на 2D-canvas: три слоя звёзд с мерцанием и параллаксом,
// дрейфующие туманности, планета с кольцом, падающие звёзды и «прыжок» (warp).
// При prefers-reduced-motion рисуется один статичный кадр.
import { useEffect, useRef } from 'react';

let warpUntil = 0;

/** «Прыжок»: звёзды вытягиваются в штрихи и возвращаются (600 мс). */
export function warpStarfield(): void {
  warpUntil = performance.now() + 600;
}

interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  phase: number;
  speed: number;
}

function makeLayer(count: number, rMin: number, rMax: number, seedBase: number): Star[] {
  let seed = seedBase;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    x: rnd(),
    y: rnd(),
    r: rMin + rnd() * (rMax - rMin),
    base: 0.25 + rnd() * 0.55,
    phase: rnd() * Math.PI * 2,
    speed: 0.3 + rnd() * 0.8,
  }));
}

const FAR = makeLayer(250, 0.35, 0.85, 11);
const MID = makeLayer(90, 0.7, 1.4, 22);
const NEAR = makeLayer(25, 1.3, 2.1, 33);

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
}

export function Background() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;
    let meteor: Meteor | null = null;
    let nextMeteorAt = performance.now() + 8000 + Math.random() * 15000;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) drawFrame(0);
    };

    const drawNebulae = (t: number) => {
      const drift = reduced ? 0 : t / 75000; // полный цикл ~75 с
      const nx = w * 0.22 + Math.sin(drift * Math.PI * 2) * w * 0.06;
      const ny = h * 0.16 + Math.cos(drift * Math.PI * 2) * h * 0.04;
      let g = ctx.createRadialGradient(nx, ny, 0, nx, ny, Math.max(w, h) * 0.55);
      g.addColorStop(0, 'rgba(120, 70, 220, 0.16)');
      g.addColorStop(1, 'rgba(120, 70, 220, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const bx = w * 0.85 - Math.cos(drift * Math.PI * 2) * w * 0.05;
      const by = h * 0.82 + Math.sin(drift * Math.PI * 2 + 1.4) * h * 0.05;
      g = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(w, h) * 0.5);
      g.addColorStop(0, 'rgba(35, 190, 190, 0.13)');
      g.addColorStop(1, 'rgba(35, 190, 190, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };

    const drawPlanet = (t: number) => {
      const cx = w * 0.78;
      const cy = h + h * 0.06;
      const R = Math.min(w, h) * 0.34;
      // кольцо (за диском)
      const ringT = reduced ? 0 : t / 90000;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.42 + Math.sin(ringT * Math.PI * 2) * 0.015);
      ctx.strokeStyle = 'rgba(180, 200, 255, 0.16)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 1.65, R * 0.4, 0, Math.PI * 0.97, Math.PI * 2.03);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(180, 200, 255, 0.07)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 1.5, R * 0.36, 0, Math.PI * 0.98, Math.PI * 2.02);
      ctx.stroke();
      ctx.restore();
      // диск
      let g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.45, R * 0.1, cx, cy, R);
      g.addColorStop(0, '#141B30');
      g.addColorStop(1, '#05070E');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      // светящийся полумесяц по краю
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R + 1.2, 0, Math.PI * 2);
      ctx.clip();
      g = ctx.createRadialGradient(cx - R * 0.55, cy - R * 0.75, 0, cx - R * 0.55, cy - R * 0.75, R * 1.35);
      g.addColorStop(0, 'rgba(160, 220, 255, 0.5)');
      g.addColorStop(0.25, 'rgba(160, 220, 255, 0.12)');
      g.addColorStop(0.5, 'rgba(160, 220, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4);
      ctx.restore();
    };

    const drawLayer = (
      stars: Star[],
      t: number,
      parallax: number,
      warp: number,
      rays: boolean,
    ) => {
      const scroll = reduced ? 0 : window.scrollY;
      const cx = w / 2;
      const cy = h / 2;
      for (const s of stars) {
        const x = s.x * w;
        const y = ((s.y * h - scroll * parallax * 0.01) % h + h) % h;
        const tw = reduced ? 1 : 0.72 + 0.28 * Math.sin(t / 900 * s.speed + s.phase);
        const a = s.base * tw;
        if (warp > 0) {
          const dx = x - cx;
          const dy = y - cy;
          ctx.strokeStyle = `rgba(226, 236, 252, ${a})`;
          ctx.lineWidth = s.r * 0.9;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + dx * warp * 0.22, y + dy * warp * 0.22);
          ctx.stroke();
          continue;
        }
        ctx.fillStyle = `rgba(226, 236, 252, ${a})`;
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (rays && s.r > 1.6) {
          ctx.strokeStyle = `rgba(226, 236, 252, ${a * 0.4})`;
          ctx.lineWidth = 0.7;
          const len = s.r * 3.2;
          ctx.beginPath();
          ctx.moveTo(x - len, y);
          ctx.lineTo(x + len, y);
          ctx.moveTo(x, y - len);
          ctx.lineTo(x, y + len);
          ctx.stroke();
        }
      }
    };

    const drawMeteor = (t: number) => {
      if (reduced) return;
      if (!meteor && t > nextMeteorAt) {
        const fromLeft = Math.random() < 0.5;
        meteor = {
          x: fromLeft ? -20 : w * (0.3 + Math.random() * 0.7),
          y: h * Math.random() * 0.35,
          vx: (fromLeft ? 1 : 0.6 + Math.random() * 0.5) * (w / 700),
          vy: 0.45 + Math.random() * 0.35,
          born: t,
        };
        nextMeteorAt = t + 20000 + Math.random() * 20000;
      }
      if (!meteor) return;
      const age = t - meteor.born;
      if (age > 700) {
        meteor = null;
        return;
      }
      const px = meteor.x + meteor.vx * age;
      const py = meteor.y + meteor.vy * age;
      const fade = 1 - age / 700;
      const g = ctx.createLinearGradient(px, py, px - meteor.vx * 90, py - meteor.vy * 90);
      g.addColorStop(0, `rgba(240, 248, 255, ${0.85 * fade})`);
      g.addColorStop(1, 'rgba(240, 248, 255, 0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - meteor.vx * 90, py - meteor.vy * 90);
      ctx.stroke();
    };

    const drawFrame = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      drawNebulae(t);
      drawPlanet(t);
      const warpLeft = warpUntil - t;
      // 0→1→0 за 600 мс
      const warp =
        warpLeft > 0 ? (warpLeft > 300 ? (600 - warpLeft) / 300 : warpLeft / 300) : 0;
      drawLayer(FAR, t, 1, warp, false);
      drawLayer(MID, t, 3, warp, false);
      drawLayer(NEAR, t, 6, warp, true);
      drawMeteor(t);
    };

    const loop = (t: number) => {
      if (!running) return;
      if (!document.hidden) drawFrame(t);
      raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener('resize', resize);
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="bg-canvas" aria-hidden="true" />;
}
