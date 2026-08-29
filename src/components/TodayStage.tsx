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
import { useEffect, useRef, type ReactNode } from 'react';
import type { Blade } from '../theme/blades';

type RGB = [number, number, number];

const COLD: RGB = [77, 141, 255]; // дальние кольца уходят в холодный синий
const WHITE: RGB = [255, 255, 255];

function parseRgb(v: string, fallback: RGB): RGB {
  const m = v.match(/(\d+(?:\.\d+)?)/g);
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
    const period = kind === 'dash' ? 8 + rnd() * 8 : kind === 'arc' ? 14 + rnd() * 12 : 26 + rnd() * 14;
    const sparks: Ring['sparks'] = [];
    const n = 3 + Math.floor(rnd() * 4);
    for (let s = 0; s < n; s++) {
      sparks.push({ a0: rnd() * Math.PI * 2, sp: (0.1 + rnd() * 0.28) * (rnd() < 0.5 ? -1 : 1), size: 0.8 + rnd() * 2.2 });
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
  p.vy = 26 + Math.random() * 46;
  p.ph = Math.random() * Math.PI * 2;
  p.amp = 3 + Math.random() * 10;
  p.size = 0.6 + p.depth * 2.2;
  p.age = 0;
  p.life = 1.5 + Math.random() * 1.5;
}

interface Props {
  blade: Blade | undefined;
  /** доля высоты, на которой «земля»: подошвы и низ рукояти */
  groundFrac?: number;
  children?: ReactNode;
}

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
    const refl = document.createElement('canvas');
    const rctx = refl.getContext('2d');

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
      refl.width = 96;
      refl.height = 128;
    };
    resize();

    const readAccent = () => {
      const s = getComputedStyle(document.documentElement);
      accent = parseRgb(s.getPropertyValue('--accent'), accent);
      accent2 = parseRgb(s.getPropertyValue('--accent2'), accent2);
    };
    readAccent();

    // --- меч ---
    const drawSaber = (ctx: CanvasRenderingContext2D, cx: number, groundY: number) => {
      const b = bladeRef.current;
      if (!b) return;
      const tier = b.tier;
      const k = (tier - 1) / 11; // 0 у Ember, 1 у Singularity

      const total = h * 0.74;
      const hiltH = total * 0.28 * (b.hilt.len / 1.1);
      const bladeH = total * 0.72 * (b.bladeLen / 2.85);
      const hw = Math.max(6, hiltH * 0.24 * (b.hilt.r / 0.09));
      const hiltTop = groundY - hiltH;
      const bladeBottom = hiltTop + 2;
      const bladeTop = bladeBottom - bladeH;

      const core = mix(accent, WHITE, 0.75);
      // лёгкая нестабильность энергии: колебание 5..8 %, не мигание
      const flick = reduced ? 1 : 1 + 0.045 * Math.sin(t * 3.1) + 0.02 * Math.sin(t * 7.7 + 1.3);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // подсветка фона вокруг меча — заметна с 7 уровня
      if (tier >= 7) {
        const gr = ctx.createRadialGradient(cx, (bladeTop + bladeBottom) / 2, 0, cx, (bladeTop + bladeBottom) / 2, bladeH * 0.75);
        gr.addColorStop(0, css(accent, 0.03 + k * 0.055));
        gr.addColorStop(1, css(accent, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(cx - bladeH, bladeTop - bladeH * 0.3, bladeH * 2, bladeH * 1.6);
      }

      // ореол: несколько проходов от широкого к узкому. С уровнем растут
      // и ширина, и яркость; с 10-го добавляется второй, ещё более широкий
      const passes = 6 + Math.round(k * 3);
      const haloW = hw * (1.5 + k * 1.9) * flick;
      for (let i = passes; i >= 1; i--) {
        const f = i / passes;
        const ww = haloW * f;
        ctx.fillStyle = css(accent, (0.038 + k * 0.016) * (1 - f * 0.45));
        rrect(ctx, cx - ww, bladeTop - ww * 0.5, ww * 2, bladeH + ww * 0.5, ww);
        ctx.fill();
      }
      if (tier >= 10) {
        const ww = haloW * 2.1;
        ctx.fillStyle = css(accent2, 0.022 + k * 0.018);
        rrect(ctx, cx - ww, bladeTop - ww * 0.4, ww * 2, bladeH + ww * 0.4, ww);
        ctx.fill();
      }

      // средний слой в цвете клинка
      const midW = hw * 0.42 * flick;
      ctx.fillStyle = css(accent, 0.95);
      rrect(ctx, cx - midW, bladeTop, midW * 2, bladeH, midW);
      ctx.fill();

      // бегущие волны яркости по лезвию — с 4 уровня
      if (tier >= 4 && !reduced) {
        const bands = 1 + Math.floor(k * 3);
        for (let i = 0; i < bands; i++) {
          const p = ((t * (0.22 + k * 0.3) + i / bands) % 1);
          const y = bladeBottom - p * bladeH;
          const bh = bladeH * (0.1 + k * 0.1);
          const g = ctx.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
          const peak = 0.09 + k * 0.12;
          g.addColorStop(0, css(accent, 0));
          g.addColorStop(0.5, css(mix(accent, WHITE, 0.4), peak));
          g.addColorStop(1, css(accent, 0));
          ctx.fillStyle = g;
          ctx.fillRect(cx - midW * 2, y - bh / 2, midW * 4, bh);
        }
      }

      // ядро — почти белое и узкое
      const coreW = Math.max(1, hw * 0.16) * flick;
      ctx.fillStyle = css(core, 0.98);
      rrect(ctx, cx - coreW, bladeTop + 1, coreW * 2, bladeH - 2, coreW);
      ctx.fill();

      ctx.restore();

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

      // искры у гарды и вдоль лезвия — плотность растёт с уровнем
      if (!reduced) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const n = 2 + Math.round(k * 22);
        for (let i = 0; i < n; i++) {
          const ph = (t * (0.3 + k * 0.6) + i * 0.137) % 1;
          const y = bladeBottom - ph * bladeH * (tier < 4 ? 0.25 : 1);
          const sway = Math.sin(t * 2 + i) * hw * (0.3 + k * 0.5);
          const a = (1 - ph) * (0.5 + k * 0.5);
          const sz = 0.5 + Math.random() * 0.6 + k;
          ctx.fillStyle = css(mix(accent, WHITE, 0.35), a);
          ctx.beginPath();
          ctx.arc(cx + sway, y, sz, 0, Math.PI * 2);
          ctx.fill();
          if (tier >= 4) {
            ctx.fillStyle = css(accent, a * 0.4);
            ctx.beginPath();
            ctx.arc(cx + sway * 0.8, y + bladeH * 0.03, sz * 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // дымка у основания с 4 уровня
        if (tier >= 4) {
          const g = ctx.createRadialGradient(cx, bladeBottom, 0, cx, bladeBottom, hw * (2 + k * 3));
          g.addColorStop(0, css(accent, 0.1 + k * 0.12));
          g.addColorStop(1, css(accent, 0));
          ctx.fillStyle = g;
          ctx.fillRect(cx - hw * 6, bladeBottom - hw * 6, hw * 12, hw * 12);
        }
        ctx.restore();
      }
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

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
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
      const charX = w * 0.66;
      const rx = Math.min(w * 0.3, h * 0.4);
      const ry = rx * 0.28;

      // отражение фигуры на «полу»
      const vid = box.querySelector<HTMLVideoElement>('video.hero-video[style*="opacity: 1"]');
      if (rctx && vid && vid.readyState >= 2) {
        rctx.clearRect(0, 0, refl.width, refl.height);
        rctx.drawImage(vid, 0, 0, refl.width, refl.height);
        bctx.save();
        bctx.globalAlpha = 0.15;
        bctx.translate(charX, groundY);
        bctx.scale(1, -1);
        const rw = rx * 1.5;
        const rh = rw * (refl.height / refl.width);
        bctx.drawImage(refl, -rw / 2, -rh, rw, rh);
        bctx.restore();
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
      drawSaber(bctx, saberX, groundY);
      drawRings(fctx, charX, groundY, rx, ry, true);

      // восходящие частицы
      if (!reduced) {
        const want = 50;
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
          const y = p.y - k * rise * (p.vy / 46);
          const x = p.x + Math.sin(p.ph + t * 1.8) * p.amp * k;
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
    <div className="stage" ref={boxRef}>
      <canvas ref={backRef} className="stage__c" aria-hidden="true" />
      {children}
      <canvas ref={frontRef} className="stage__c stage__c--front" aria-hidden="true" />
    </div>
  );
}
