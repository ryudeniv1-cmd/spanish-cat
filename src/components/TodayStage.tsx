// Верхняя сцена Today на двух холстах: меч, платформа под персонажем,
// искры на кольцах и восходящие частицы. Один requestAnimationFrame на всё.
//
// Холста два, потому что персонаж — это <video> между ними: задний холст
// рисует меч, дальние дуги колец и отражение, передний — ближние дуги
// (они проходят перед ногами) и часть частиц. Так фигура стоит внутри
// платформы, а не над ней.
//
// Свечение набирается несколькими проходами с 'lighter': это дешевле, чем
// filter: blur() на весь холст, и не срывает 60 fps на телефоне.
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { Blade } from '../theme/blades';

type RGB = [number, number, number];

const COLD: RGB = [77, 141, 255]; // дальние кольца уходят в холодный синий
const WHITE: RGB = [255, 255, 255];

/** Понимает и `rgb(r, g, b)` из CSS-переменной, и `#rrggbb` из данных клинка. */
function parseRgb(v: string, fallback: RGB): RGB {
  const s = v.trim();
  if (s.startsWith('#')) {
    const n = parseInt(s.slice(1), 16);
    if (Number.isNaN(n)) return fallback;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/(\d+(?:\.\d+)?)/g);
  if (!m || m.length < 3) return fallback;
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function css(c: RGB, alpha: number): string {
  return `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${alpha})`;
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// --- кольца платформы -------------------------------------------------

type RingKind = 'solid' | 'dash' | 'arc';

interface Ring {
  r: number; // доля от максимального радиуса
  kind: RingKind;
  turns: number; // оборотов в секунду, знак задаёт направление
  width: number;
  alpha: number;
  span: number; // для дуги — доля окружности
  dash: [number, number];
  sparks: { a0: number; sp: number; size: number }[];
}

/** Детерминированный генератор: набор колец не должен прыгать между кадрами. */
function makeRings(): Ring[] {
  let seed = 20260829;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const kinds: RingKind[] = ['solid', 'dash', 'arc', 'dash', 'solid', 'arc', 'dash', 'arc'];
  const out: Ring[] = [];
  for (let i = 0; i < 8; i++) {
    const kind = kinds[i];
    // пунктирные крутятся заметно быстрее сплошных: 8..40 с на оборот
    const period = kind === 'dash' ? 16 + rnd() * 16 : kind === 'arc' ? 30 + rnd() * 20 : 55 + rnd() * 25;
    const sparks: Ring['sparks'] = [];
    const n = 3 + Math.floor(rnd() * 4);
    for (let s = 0; s < n; s++) {
      sparks.push({ a0: rnd() * Math.PI * 2, sp: (0.03 + rnd() * 0.07) * (rnd() < 0.5 ? -1 : 1), size: 0.8 + rnd() * 2.2 });
    }
    out.push({
      r: 0.3 + (i / 7) * 0.7,
      kind,
      turns: (1 / period) * (i % 2 === 0 ? 1 : -1),
      width: 1 + rnd() * 0.5,
      alpha: 0.85 - (i / 7) * 0.55,
      span: 0.4 + rnd() * 0.3,
      dash: [1.5 + rnd() * 1.5, 5 + rnd() * 5],
      sparks,
    });
  }
  return out;
}

// --- восходящие частицы -----------------------------------------------

interface Particle {
  x: number;
  y: number;
  vy: number;
  ph: number;
  amp: number;
  size: number;
  depth: number; // 0 — дальняя и мелкая, 1 — ближняя и крупная
  age: number;
  life: number;
}

function spawn(p: Particle, rx: number, ry: number, cx: number, cy: number): void {
  const a = Math.random() * Math.PI * 2;
  const rr = Math.sqrt(Math.random());
  p.x = cx + Math.cos(a) * rx * rr;
  p.y = cy + Math.sin(a) * ry * rr;
  p.depth = Math.random();
  p.vy = 14 + Math.random() * 26;
  p.ph = Math.random() * Math.PI * 2;
  p.amp = 3 + Math.random() * 9;
  p.size = 0.6 + p.depth * 2.2;
  p.age = 0;
  p.life = 2.6 + Math.random() * 2.6;
}

/** Искра у лезвия: у старших клинков часть летит наружу, у 12-го — внутрь. */
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
}

interface Props {
  blade: Blade | undefined;
  /** доля высоты, на которой «земля»: подошвы и низ рукояти */
  groundFrac?: number;
  children?: ReactNode;
}

/** Ось платформы, доля ширины сцены. Ролик встаёт на неё же: сцена отдаёт
    эту долю в --fig-cx, а фигуру по ней центрует ключ (CharacterMedia). */
const CHAR_X = 0.66;

export function TodayStage({ blade, groundFrac = 0.84, children }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const bladeRef = useRef(blade);
  bladeRef.current = blade;

  useEffect(() => {
    const box = boxRef.current;
    const back = backRef.current;
    const front = frontRef.current;
    if (!box || !back || !front) return;
    const bctx = back.getContext('2d');
    const fctx = front.getContext('2d');
    if (!bctx || !fctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rings = makeRings();
    const particles: Particle[] = [];
    const sparks: Spark[] = [];
    let sparkDebt = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let t = 0;
    let tick = 0;
    let accent: RGB = [79, 216, 255];
    let accent2: RGB = [159, 243, 236];
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = box.clientWidth;
      h = box.clientHeight;
      for (const c of [back, front]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
    };
    resize();

    const readAccent = () => {
      const s = getComputedStyle(document.documentElement);
      accent = parseRgb(s.getPropertyValue('--accent'), accent);
      accent2 = parseRgb(s.getPropertyValue('--accent2'), accent2);
    };
    readAccent();

    // --- меч ---
    // Ореол намеренно узкий: не больше haloPx вокруг лезвия. Зрелищность
    // старших клинков даёт не размер свечения, а частицы и детали.
    const drawSaber = (ctx: CanvasRenderingContext2D, cx: number, groundY: number, dt: number) => {
      const b = bladeRef.current;
      if (!b) return;
      const tier = b.tier;
      const k = (tier - 1) / 11;
      const core = parseRgb(b.core, WHITE);
      const dark = tier >= 11;

      const total = h * 0.74;
      const hiltH = total * 0.28 * (b.hilt.len / 1.1);
      const bladeH = total * 0.72 * (b.bladeLen / 2.85);
      const hw = Math.max(6, hiltH * 0.24 * (b.hilt.r / 0.09));
      const hiltTop = groundY - hiltH;
      const bladeBottom = hiltTop + 2;
      const bladeTop = bladeBottom - bladeH;
      const bodyW = Math.max(2.2, hw * 0.3);

      // нестабильность энергии: колебание 5..8 %, не мигание
      const flick = reduced ? 1 : 1 + 0.045 * Math.sin(t * 3.1) + 0.02 * Math.sin(t * 7.7 + 1.3);

      // Сначала ореол, потом корпус: если наоборот, проходы с 'lighter'
      // засвечивают лезвие изнутри и тёмные клинки перестают быть тёмными.
      ctx.globalCompositeOperation = 'lighter';
      const haloPx = (8 + k * 4) * flick;
      for (let i = 4; i >= 1; i--) {
        const ext = (haloPx * i) / 4;
        ctx.fillStyle = css(accent, 0.16 * (1 - (i - 1) / 4.6));
        rrect(ctx, cx - bodyW - ext, bladeTop - ext, (bodyW + ext) * 2, bladeH + ext, bodyW + ext);
        ctx.fill();
      }

      // 12: аура переливается, вокруг слегка ведёт пространство
      if (tier >= 12 && !reduced) {
        const sh = 0.5 + 0.5 * Math.sin(t * 0.6);
        const aur = mix(accent, [26, 10, 48], sh);
        const flow = (t * 0.12) % 1;
        const g = ctx.createLinearGradient(0, bladeTop, 0, bladeBottom);
        g.addColorStop(0, css(aur, 0));
        g.addColorStop(Math.max(0.01, flow), css(aur, 0.3));
        g.addColorStop(Math.min(0.99, flow + 0.35), css(mix(accent, WHITE, 0.25), 0.16));
        g.addColorStop(1, css(aur, 0));
        ctx.fillStyle = g;
        rrect(ctx, cx - bodyW - haloPx, bladeTop - haloPx, (bodyW + haloPx) * 2, bladeH + haloPx * 2, bodyW + haloPx);
        ctx.fill();
        // искажение: редкие точки уводит по дуге вокруг лезвия
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + t * 0.15;
          const rr = 22 + ((i * 7) % 26) + Math.sin(t * 0.8 + i) * 5;
          const yy = bladeTop + bladeH * ((i * 0.37) % 1);
          ctx.fillStyle = css(mix(accent, WHITE, 0.4), 0.16 + 0.1 * Math.sin(t + i));
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * rr, yy + Math.sin(a) * 5, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // корпус: обычный режим, поэтому тёмные клинки действительно тёмные
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = css(core, 1);
      rrect(ctx, cx - bodyW, bladeTop, bodyW * 2, bladeH, bodyW);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';

      if (dark) {
        // тёмное лезвие: светится только кромка
        const ew = Math.max(1, bodyW * 0.34);
        ctx.fillStyle = css(accent, 0.9);
        rrect(ctx, cx - bodyW, bladeTop, ew, bladeH, ew / 2);
        ctx.fill();
        rrect(ctx, cx + bodyW - ew, bladeTop, ew, bladeH, ew / 2);
        ctx.fill();
      } else {
        ctx.fillStyle = css(accent, 0.7);
        rrect(ctx, cx - bodyW, bladeTop, bodyW * 2, bladeH, bodyW);
        ctx.fill();
        const cw = bodyW * 0.45;
        ctx.fillStyle = css(mix(core, WHITE, 0.5), 0.95);
        rrect(ctx, cx - cw, bladeTop + 1, cw * 2, bladeH - 2, cw);
        ctx.fill();
      }

      // 9+: импульсы снизу вверх и дымка у гарды
      if (tier >= 9 && !reduced) {
        const bands = tier >= 11 ? 3 : 2;
        for (let i = 0; i < bands; i++) {
          const pr = (t * 0.32 + i / bands) % 1;
          const y = bladeBottom - pr * bladeH;
          const bh = bladeH * 0.09;
          const g = ctx.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
          g.addColorStop(0, css(accent, 0));
          g.addColorStop(0.5, css(mix(accent, WHITE, 0.45), 0.22));
          g.addColorStop(1, css(accent, 0));
          ctx.fillStyle = g;
          ctx.fillRect(cx - bodyW - 4, y - bh / 2, (bodyW + 4) * 2, bh);
        }
        const hg = ctx.createRadialGradient(cx, bladeBottom, 0, cx, bladeBottom, 26);
        hg.addColorStop(0, css(accent, 0.16));
        hg.addColorStop(1, css(accent, 0));
        ctx.fillStyle = hg;
        ctx.fillRect(cx - 30, bladeBottom - 30, 60, 60);
      }

      // 11: отблески по кромке и медленные дуги вокруг
      if (tier >= 11 && !reduced) {
        for (let i = 0; i < 3; i++) {
          const pr = (t * 0.45 + i / 3) % 1;
          const y = bladeBottom - pr * bladeH;
          ctx.fillStyle = css(mix(accent, WHITE, 0.6), 0.5 * (1 - Math.abs(pr - 0.5) * 1.2));
          rrect(ctx, cx - bodyW, y - bladeH * 0.05, 1.6, bladeH * 0.1, 0.8);
          ctx.fill();
          rrect(ctx, cx + bodyW - 1.6, y - bladeH * 0.05, 1.6, bladeH * 0.1, 0.8);
          ctx.fill();
        }
        ctx.lineWidth = 1;
        for (let i = 0; i < 3 && tier === 11; i++) {
          const a = t * (0.12 + i * 0.05) + (i * Math.PI * 2) / 3;
          const rr = 26 + i * 11;
          ctx.strokeStyle = css(accent, 0.3 - i * 0.07);
          ctx.beginPath();
          ctx.ellipse(cx, bladeTop + bladeH * 0.5, rr, rr * 2.6, 0, a, a + 1.5);
          ctx.stroke();
        }
      }

      // искры у лезвия: с 6 уровня, у 12-го втягиваются внутрь
      if (tier >= 6 && !reduced) {
        const inward = tier >= 12;
        const rate = tier <= 8 ? 7 : tier <= 10 ? 15 : 13;
        const cap = tier <= 8 ? 10 : tier <= 10 ? 24 : 22;
        sparkDebt += rate * dt;
        while (sparkDebt >= 1 && sparks.length < cap) {
          sparkDebt -= 1;
          const y = bladeTop + Math.random() * bladeH;
          const side = Math.random() < 0.5 ? -1 : 1;
          if (inward) {
            const d = 24 + Math.random() * 34;
            sparks.push({
              x: cx + side * d,
              y: y + (Math.random() - 0.5) * 50,
              vx: -side * (16 + Math.random() * 24),
              vy: -4 + Math.random() * 8,
              age: 0,
              life: 0.8 + Math.random() * 0.7,
              size: 0.6 + Math.random(),
            });
          } else {
            sparks.push({
              x: cx + side * bodyW,
              y,
              vx: side * (10 + Math.random() * 26),
              vy: -(14 + Math.random() * 38),
              age: 0,
              life: 0.5 + Math.random() * 0.5,
              size: 0.6 + Math.random() * 1.2,
            });
          }
        }
        if (sparkDebt > 4) sparkDebt = 4;
        const trail = tier >= 9;
        const scol = tier >= 11 ? mix(accent, [40, 16, 70], 0.35) : mix(accent, WHITE, 0.35);
        for (let i = sparks.length - 1; i >= 0; i--) {
          const sp = sparks[i];
          sp.age += dt;
          if (sp.age >= sp.life) {
            sparks.splice(i, 1);
            continue;
          }
          sp.x += sp.vx * dt;
          sp.y += sp.vy * dt;
          const a = 1 - sp.age / sp.life;
          if (trail) {
            ctx.strokeStyle = css(scol, a * 0.35);
            ctx.lineWidth = sp.size * 0.9;
            ctx.beginPath();
            ctx.moveTo(sp.x, sp.y);
            ctx.lineTo(sp.x - sp.vx * 0.05, sp.y - sp.vy * 0.05);
            ctx.stroke();
          }
          ctx.fillStyle = css(scol, a * 0.95);
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size * a, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = 'source-over';

      // --- рукоять: тёмный металл с бликами ---
      ctx.save();
      const seg = (y: number, hgt: number, halfW: number, r = 2) => {
        const g = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
        g.addColorStop(0, '#0b0f19');
        g.addColorStop(0.18, '#39445e');
        g.addColorStop(0.34, '#1b2233');
        g.addColorStop(0.72, '#141a28');
        g.addColorStop(1, '#0a0e17');
        ctx.fillStyle = g;
        rrect(ctx, cx - halfW, y, halfW * 2, hgt, r);
        ctx.fill();
      };

      // навершие с фаской
      const pomH = hiltH * 0.13;
      ctx.fillStyle = '#0d121d';
      ctx.beginPath();
      ctx.moveTo(cx - hw * 0.62, groundY - pomH);
      ctx.lineTo(cx + hw * 0.62, groundY - pomH);
      ctx.lineTo(cx + hw * 0.44, groundY);
      ctx.lineTo(cx - hw * 0.44, groundY);
      ctx.closePath();
      ctx.fill();

      // корпус
      seg(hiltTop, hiltH - pomH, hw * 0.52, hw * 0.22);

      // продольные грани
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      for (const fx of [-0.22, 0.1]) {
        ctx.beginPath();
        ctx.moveTo(cx + hw * fx, hiltTop + hiltH * 0.08);
        ctx.lineTo(cx + hw * fx, groundY - pomH - hiltH * 0.05);
        ctx.stroke();
      }

      // рифлёная секция хвата
      const gripTop = hiltTop + hiltH * 0.42;
      const gripH = hiltH * 0.34;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      for (let y = gripTop; y < gripTop + gripH; y += Math.max(2, hiltH * 0.045)) {
        ctx.beginPath();
        ctx.moveTo(cx - hw * 0.5, y);
        ctx.lineTo(cx + hw * 0.5, y);
        ctx.stroke();
      }

      // кольца-насечки разной толщины
      const ringsN = b.hilt.rings;
      for (let i = 0; i < ringsN; i++) {
        const y = hiltTop + hiltH * (0.12 + i * (0.26 / Math.max(1, ringsN - 1)));
        const th = i % 2 === 0 ? hiltH * 0.035 : hiltH * 0.02;
        ctx.fillStyle = i % 2 === 0 ? '#4a5573' : '#2a3145';
        rrect(ctx, cx - hw * 0.58, y, hw * 1.16, th, 1);
        ctx.fill();
      }

      // вентиляционные прорези
      ctx.fillStyle = '#05070c';
      for (let i = 0; i < 3; i++) {
        const y = hiltTop + hiltH * (0.58 + i * 0.07);
        rrect(ctx, cx - hw * 0.3, y, hw * 0.6, Math.max(1, hiltH * 0.014), 1);
        ctx.fill();
      }

      // эмиссивная вставка-активатор
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const insY = hiltTop + hiltH * 0.3;
      const insH = hiltH * 0.09;
      ctx.fillStyle = css(accent, 0.9);
      rrect(ctx, cx - hw * 0.16, insY, hw * 0.32, insH, 1.5);
      ctx.fill();
      ctx.fillStyle = css(accent, 0.28);
      rrect(ctx, cx - hw * 0.38, insY - insH * 0.5, hw * 0.76, insH * 2, 3);
      ctx.fill();
      // отражение цвета клинка на верхней части рукояти
      const rg = ctx.createLinearGradient(0, hiltTop, 0, hiltTop + hiltH * 0.5);
      rg.addColorStop(0, css(accent, 0.3));
      rg.addColorStop(1, css(accent, 0));
      ctx.fillStyle = rg;
      rrect(ctx, cx - hw * 0.52, hiltTop, hw * 1.04, hiltH * 0.5, hw * 0.2);
      ctx.fill();
      ctx.restore();

      // узкая светлая полоса вдоль грани
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      rrect(ctx, cx - hw * 0.5, hiltTop + hiltH * 0.06, hw * 0.09, hiltH * 0.8, 1);
      ctx.fill();

      // гарда у основания лезвия
      const guardW = b.hilt.guard === 'flat' ? hw * 1.5 : b.hilt.guard === 'ring' ? hw * 1.25 : hw * 1.7;
      const guardH = hiltH * 0.07;
      ctx.fillStyle = '#333c55';
      rrect(ctx, cx - guardW / 2, hiltTop - guardH, guardW, guardH, 2);
      ctx.fill();
      if (b.hilt.guard === 'ring') {
        ctx.strokeStyle = css(accent, 0.5);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, hiltTop - guardH / 2, guardW * 0.62, guardH * 1.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

    };

    // --- платформа ---
    const drawRings = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, frontOnly: boolean) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i];
        const RX = rx * r.r;
        const RY = ry * r.r;
        const f = i / (rings.length - 1);
        // ближе к центру светлее, дальше — насыщенный акцент и холодный синий
        const col = f < 0.5 ? mix(mix(accent, WHITE, 0.55), accent, f * 2) : mix(accent, COLD, (f - 0.5) * 1.5);
        const phase = reduced ? 0 : t * r.turns * Math.PI * 2;
        const alpha = r.alpha * (frontOnly ? 0.55 : 1);

        ctx.strokeStyle = css(col, alpha);
        ctx.lineWidth = r.width;
        ctx.setLineDash(r.kind === 'dash' ? r.dash : []);
        ctx.lineDashOffset = r.kind === 'dash' ? -phase * RX : 0;

        if (r.kind === 'arc') {
          const a0 = phase;
          const span = r.span * Math.PI * 2;
          // затухание на концах — три вложенных прохода
          for (let s = 0; s < 3; s++) {
            const shrink = s * 0.18;
            ctx.strokeStyle = css(col, alpha * (0.35 + s * 0.3));
            ctx.beginPath();
            const from = a0 + span * shrink;
            const to = a0 + span * (1 - shrink);
            if (frontOnly) ctx.ellipse(cx, cy, RX, RY, 0, Math.max(from, 0), Math.min(to, Math.PI));
            else ctx.ellipse(cx, cy, RX, RY, 0, from, to);
            ctx.stroke();
          }
        } else {
          ctx.beginPath();
          if (frontOnly) ctx.ellipse(cx, cy, RX, RY, 0, 0, Math.PI);
          else ctx.ellipse(cx, cy, RX, RY, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // искры, бегущие по кольцу, с коротким шлейфом
        if (!reduced) {
          for (const sp of r.sparks) {
            const a = sp.a0 + t * sp.sp * Math.PI * 2;
            const sy = Math.sin(a);
            if (frontOnly !== sy > 0) continue;
            for (let tr = 0; tr < 4; tr++) {
              const aa = a - tr * 0.05 * Math.sign(sp.sp);
              const px = cx + Math.cos(aa) * RX;
              const py = cy + Math.sin(aa) * RY;
              ctx.fillStyle = css(mix(col, WHITE, 0.5), alpha * (0.9 - tr * 0.22));
              ctx.beginPath();
              ctx.arc(px, py, sp.size * (1 - tr * 0.18), 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      ctx.restore();
    };

    let lastDraw = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      // при prefers-reduced-motion сцена статична: гонять её 60 раз в секунду
      // незачем, хватает редкой перерисовки на смену клинка и размера
      if (reduced && now - lastDraw < 250) return;
      lastDraw = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      tick++;
      if (tick % 5 === 0) readAccent();

      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, w, h);
      fctx.clearRect(0, 0, w, h);

      const groundY = h * groundFrac;
      const saberX = w * 0.21;
      const charX = w * CHAR_X;
      const rx = Math.min(w * 0.3, h * 0.4);
      const ry = rx * 0.28;

      // Отражение фигуры на «полу»: зеркалим относительно groundY уже
      // очищенный от фона холст персонажа. Совмещать ничего не нужно —
      // ролик и так стоит подошвами на этой линии, а вместе с ним едет
      // и параллакс: обе стороны висят на одной scroll-timeline.
      let reflected = false;
      for (const el of box.querySelectorAll<HTMLElement>('.hero-video')) {
        const canvas = el.querySelector('canvas');
        const a = Number(getComputedStyle(el).opacity);
        if (!canvas || !canvas.width || !(a > 0.01)) continue;
        bctx.save();
        bctx.globalCompositeOperation = 'lighter';
        bctx.globalAlpha = 0.16 * a;
        bctx.translate(0, groundY * 2);
        bctx.scale(1, -1);
        bctx.drawImage(canvas, 0, 0, w, h);
        bctx.restore();
        reflected = true;
      }
      if (reflected) {
        // быстрое затухание книзу
        bctx.save();
        bctx.globalCompositeOperation = 'destination-out';
        const fade = bctx.createLinearGradient(0, groundY, 0, groundY + ry * 3);
        fade.addColorStop(0, 'rgba(0,0,0,0)');
        fade.addColorStop(1, 'rgba(0,0,0,1)');
        bctx.fillStyle = fade;
        bctx.fillRect(0, groundY, w, ry * 3);
        bctx.restore();
      }

      // светлое пятно под ногами
      bctx.save();
      bctx.globalCompositeOperation = 'lighter';
      const spot = bctx.createRadialGradient(charX, groundY, 0, charX, groundY, rx * 0.9);
      spot.addColorStop(0, css(mix(accent, WHITE, 0.5), 0.3));
      spot.addColorStop(0.5, css(accent, 0.1));
      spot.addColorStop(1, css(accent, 0));
      bctx.fillStyle = spot;
      bctx.beginPath();
      bctx.ellipse(charX, groundY, rx, ry * 1.6, 0, 0, Math.PI * 2);
      bctx.fill();
      bctx.restore();

      drawRings(bctx, charX, groundY, rx, ry, false);
      drawSaber(bctx, saberX, groundY, dt);
      drawRings(fctx, charX, groundY, rx, ry, true);

      // восходящие частицы
      if (!reduced) {
        const want = 32;
        while (particles.length < want) {
          const p: Particle = { x: 0, y: 0, vy: 0, ph: 0, amp: 0, size: 0, depth: 0, age: 0, life: 1 };
          spawn(p, rx, ry, charX, groundY);
          p.age = Math.random() * p.life;
          particles.push(p);
        }
        const rise = h * 0.34; // растворяются к уровню колен
        for (const p of particles) {
          p.age += dt;
          if (p.age >= p.life) spawn(p, rx, ry, charX, groundY);
          const k = p.age / p.life;
          const y = p.y - k * rise * (p.vy / 26);
          const x = p.x + Math.sin(p.ph + t * 0.9) * p.amp * k;
          // из нуля, ярче всего на нижней трети, полностью гаснут вверху
          const a = k < 0.33 ? k / 0.33 : 1 - (k - 0.33) / 0.67;
          const ctx = p.depth > 0.5 ? fctx : bctx;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = css(mix(accent, WHITE, p.depth * 0.6), a * (0.4 + p.depth * 0.55));
          ctx.beginPath();
          ctx.arc(x, y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(box);
    const io = new IntersectionObserver((e) => {
      visible = e[0].isIntersecting;
    });
    io.observe(box);
    const onVis = () => {
      visible = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', onVis);

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [groundFrac]);

  return (
    <div
      className="stage"
      ref={boxRef}
      style={{ '--fig-cx': CHAR_X, '--fig-base': groundFrac } as CSSProperties}
    >
      <canvas ref={backRef} className="stage__c" aria-hidden="true" />
      {children}
      <canvas ref={frontRef} className="stage__c stage__c--front" aria-hidden="true" />
    </div>
  );
}
