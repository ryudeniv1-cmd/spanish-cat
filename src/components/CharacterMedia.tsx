// Idle-ролики персонажей и силуэт закрытой карточки.
//
// Все видимые ролики обслуживает один общий пул: IntersectionObserver
// отмечает попавшие в кадр карточки, играют только первые MAX_PLAYING
// сверху вниз, остальные стоят на паузе. При prefers-reduced-motion
// ролик не запускается вовсе — показывается первый кадр.
import { useReducedMotion } from 'framer-motion';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type VideoHTMLAttributes,
} from 'react';
// через сборщик, а не абсолютным путём: иначе на GitHub Pages потеряется base
import silhouetteUrl from '../presets/siluet.png';


// ===== снятие чёрного фона =====
//
// Раньше фон снимал SVG-фильтр из index.html (filter: url(#luma-key)).
// На десктопе он работает, но WebView к <video> SVG-фильтры не применяет,
// и на телефоне вместо фигуры оставался чёрный прямоугольник. Поэтому ключ
// считаем сами: кадр уходит текстурой в WebGL, шейдер переносит яркость
// в альфу, результат рисуется в <canvas> поверх скрытого ролика. Это больше
// не зависит от того, что умеет конкретный WebView.

const VERT = `
attribute vec2 a;
varying vec2 uv;
void main() {
  uv = vec2((a.x + 1.0) * 0.5, (1.0 - a.y) * 0.5);
  gl_Position = vec4(a, 0.0, 1.0);
}`;

// Уровень чёрного берётся из углов кадра — там заведомо фон. Так ключ
// одинаково срабатывает и когда декодер отдал чистый ноль, и когда отдал
// limited range (чёрный = 16). Пологий участок у порога сохраняет сглаженный
// край фигуры, иначе по контуру идёт тёмная кайма.
const FRAG = `
precision mediump float;
uniform sampler2D tex;
varying vec2 uv;
const vec3 W = vec3(0.33, 0.5, 0.17);
float luma(vec2 p) { return dot(texture2D(tex, p).rgb, W); }
void main() {
  float black = min(
    min(luma(vec2(0.02, 0.02)), luma(vec2(0.98, 0.02))),
    min(luma(vec2(0.02, 0.98)), luma(vec2(0.98, 0.98)))
  );
  float a = clamp((luma(uv) - black - 0.004) / 0.016, 0.0, 1.0);
  gl_FragColor = vec4(texture2D(tex, uv).rgb * a, a);
}`;

interface Keyer {
  draw(v: HTMLVideoElement): void;
  dispose(): void;
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
}

/** null — WebGL недоступен, вызывающий откатится на прежний путь. */
function createKeyer(canvas: HTMLCanvasElement): Keyer | null {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return {
    draw(v) {
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      if (!vw || !vh) return;
      // холст под фактический размер на экране; выше 2x смысла нет
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      gl.viewport(0, 0, cw, ch);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // то же, что object-fit: contain и object-position: center bottom
      const scale = Math.min(cw / vw, ch / vh);
      const dw = Math.round(vw * scale);
      const dh = Math.round(vh * scale);
      gl.viewport(Math.round((cw - dw) / 2), 0, dw, dh);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

// Один общий кадровый цикл на все ролики: стоящий на паузе не перерисовываем,
// пока не сменился кадр или размер холста.
interface KeyState {
  keyer: Keyer;
  canvas: HTMLCanvasElement;
  at: number;
  w: number;
  h: number;
}

const keyed = new Map<HTMLVideoElement, KeyState>();
let pumping = 0;

function pump(): void {
  pumping = requestAnimationFrame(pump);
  for (const [v, s] of keyed) {
    if (v.readyState < 2) continue;
    const w = s.canvas.clientWidth;
    const h = s.canvas.clientHeight;
    if (v.paused && s.at === v.currentTime && s.w === w && s.h === h) continue;
    s.keyer.draw(v);
    s.at = v.currentTime;
    s.w = w;
    s.h = h;
  }
}

function keyOn(v: HTMLVideoElement, canvas: HTMLCanvasElement): boolean {
  const keyer = createKeyer(canvas);
  if (!keyer) return false;
  keyed.set(v, { keyer, canvas, at: -1, w: 0, h: 0 });
  if (!pumping) pumping = requestAnimationFrame(pump);
  return true;
}

function keyOff(v: HTMLVideoElement): void {
  const s = keyed.get(v);
  if (!s) return;
  s.keyer.dispose();
  keyed.delete(v);
  if (keyed.size === 0 && pumping) {
    cancelAnimationFrame(pumping);
    pumping = 0;
  }
}

/**
 * Ролик со снятым фоном. Наружу ведёт себя как <video>: ref отдаёт сам
 * элемент, поэтому пул, IntersectionObserver и кроссфейд работают как прежде.
 * Класс раскладки уходит на обёртку, ролик и холст занимают её целиком.
 */
const KeyedVideo = forwardRef<HTMLVideoElement, VideoHTMLAttributes<HTMLVideoElement>>(
  function KeyedVideo({ className, ...rest }, ref) {
    const boxRef = useRef<HTMLSpanElement>(null);
    const vRef = useRef<HTMLVideoElement>(null);
    const cRef = useRef<HTMLCanvasElement>(null);
    const [raw, setRaw] = useState(false);

    useImperativeHandle(ref, () => vRef.current!, []);

    useEffect(() => {
      const v = vRef.current;
      const c = cRef.current;
      const box = boxRef.current;
      if (!v || !c || !box) return;

      // Ролик внутри обёртки спозиционирован абсолютно и её размер не
      // задаёт. Там, где раскладка считала ширину из высоты по пропорциям
      // видео, пропорции переносим на обёртку.
      const ratio = () => {
        if (v.videoWidth) box.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`;
      };
      if (v.readyState >= 1) ratio();
      v.addEventListener('loadedmetadata', ratio);

      const keying = keyOn(v, c);
      if (!keying) setRaw(true);
      return () => {
        v.removeEventListener('loadedmetadata', ratio);
        if (keying) keyOff(v);
      };
    }, []);

    return (
      <span
        ref={boxRef}
        className={`keyed ${className ?? 'char-video'}${raw ? ' keyed--raw' : ''}`}
      >
        <video ref={vRef} className="keyed__src" {...rest} />
        <canvas ref={cRef} className="keyed__out" aria-hidden="true" />
      </span>
    );
  },
);

/** Кроссфейд идёт по обёртке: на ней лежит класс с переходом. */
function fade(v: HTMLVideoElement, to: 0 | 1): void {
  (v.parentElement ?? v).style.opacity = String(to);
}

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
  holdMs,
}: {
  sources: string[];
  className?: string;
  label?: string;
  /** вне сетки (полноэкранный просмотр, Today) — играет всегда, мимо пула */
  standalone?: boolean;
  /** пауза между проигрываниями вместо непрерывного цикла */
  holdMs?: number;
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

  // Пауза между проигрываниями: ролик доигрывает, замирает на последнем
  // кадре на holdMs и запускается снова.
  useEffect(() => {
    const v = ref.current;
    if (!v || !holdMs || reduced) return;
    let timer = 0;
    const onEnded = () => {
      timer = window.setTimeout(() => {
        v.currentTime = 0;
        void v.play().catch(() => undefined);
      }, holdMs);
    };
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('ended', onEnded);
      if (timer) clearTimeout(timer);
    };
  }, [holdMs, reduced]);

  if (!src) return null;

  return (
    <KeyedVideo
      ref={ref}
      className={className}
      src={src}
      autoPlay={!reduced && standalone}
      loop={!holdMs}
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

/**
 * Персонаж на Today: один ролик целиком, пауза 5–10 с на последнем кадре,
 * затем следующий случайный. Два наложенных <video> с кроссфейдом — пока
 * играет передний, задний уже держит первый кадр следующего ролика, поэтому
 * смены не видно: ни рывка, ни чёрного кадра.
 */
const HOLD_MIN = 5000;
const HOLD_MAX = 10000;
const FADE_MS = 420;

export function IdleCycler({ sources, className }: { sources: string[]; className?: string }) {
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b || sources.length === 0) return;

    let alive = true;
    let holdTimer = 0;
    let swapTimer = 0;
    let front = 0;

    const pick = (not?: string): string => {
      const pool = sources.length > 1 ? sources.filter((s) => s !== not) : sources;
      return pool[Math.floor(Math.random() * pool.length)];
    };
    const el = (i: number) => (i === 0 ? a! : b!);

    // первый кадр появляется и без воспроизведения: перемотка в начало
    const showFirstFrame = (v: HTMLVideoElement) => {
      const seek = () => {
        try {
          v.currentTime = 0.001;
        } catch {
          /* кадр появится, когда догрузятся метаданные */
        }
      };
      if (v.readyState >= 1) seek();
      else v.addEventListener('loadedmetadata', seek, { once: true });
    };

    let frontSrc = pick();
    a.src = frontSrc;
    fade(a, 1);
    fade(b, 0);

    if (reduced) {
      showFirstFrame(a);
      return () => {
        alive = false;
      };
    }

    let backSrc = pick(frontSrc);
    b.src = backSrc;
    showFirstFrame(b);

    const onEnded = () => {
      if (!alive) return;
      // ролик замер на последнем кадре — держим паузу и уходим в следующий
      const hold = HOLD_MIN + Math.random() * (HOLD_MAX - HOLD_MIN);
      holdTimer = window.setTimeout(swap, hold);
    };

    const swap = () => {
      if (!alive) return;
      const cur = el(front);
      const nxt = el(1 - front);
      void nxt.play().catch(() => undefined);
      fade(nxt, 1);
      fade(cur, 0);
      front = 1 - front;
      frontSrc = backSrc;
      // освободившийся элемент готовит следующий ролик уже под кроссфейдом
      swapTimer = window.setTimeout(() => {
        if (!alive) return;
        cur.pause();
        backSrc = pick(frontSrc);
        cur.src = backSrc;
        cur.load();
        showFirstFrame(cur);
      }, FADE_MS + 60);
    };

    a.addEventListener('ended', onEnded);
    b.addEventListener('ended', onEnded);
    void a.play().catch(() => undefined);

    return () => {
      alive = false;
      clearTimeout(holdTimer);
      clearTimeout(swapTimer);
      a.removeEventListener('ended', onEnded);
      b.removeEventListener('ended', onEnded);
      a.pause();
      b.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, sources.join('|')]);

  if (sources.length === 0) return null;

  return (
    <>
      <KeyedVideo ref={aRef} className={className} muted playsInline preload="auto" disablePictureInPicture aria-hidden="true" />
      <KeyedVideo ref={bRef} className={className} muted playsInline preload="auto" disablePictureInPicture aria-hidden="true" />
    </>
  );
}
