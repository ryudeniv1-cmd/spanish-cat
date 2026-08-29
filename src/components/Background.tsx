// Живой космический фон на 2D-canvas.
//
// Слои снизу вверх: туманности (запечены в offscreen и блитятся одним
// вызовом), три слоя звёзд с параллаксом и мерцанием, дальняя половина
// кольца, ореол атмосферы, диск планеты, огни ночной стороны, ближняя
// половина кольца, луна и дальняя планета, метеор, приглушение под контентом.
//
// Планета процедурная, без картинок-текстур. Шум считается один раз в
// равнопромежуточную (equirectangular) текстуру, дальше кадр только выбирает
// из неё по нормали сферы — поэтому детали сжимаются к краю диска, а
// вращение сводится к сдвигу по горизонтали. Тело рисуется в offscreen по
// одной горизонтальной полосе за кадр и растягивается: обороты идут минуты,
// разницы не видно, а тяжёлый проход перестаёт быть всплеском. Резкие детали
// (дуга лимба, кольцо, огни) идут векторно поверх, поэтому мягкость апскейла
// не бросается в глаза.
import { useEffect, useRef } from 'react';

type RGB = [number, number, number];

const TAU = Math.PI * 2;

let warpUntil = 0;

/** «Прыжок»: звёзды вытягиваются в штрихи и возвращаются (600 мс). */
export function warpStarfield(): void {
  warpUntil = performance.now() + 600;
}

// ===================== шум =====================
// Значимый (value) шум по трёхмерной точке на сфере, а не по (u, v): иначе
// у полюсов текстура схлопывается в веер. fBm из него даёт пятна-континенты,
// ridged-вариант — прожилки и кратеры.

function hash3(i: number, j: number, k: number): number {
  let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1442695041);
  n = n ^ (n >>> 13);
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = x - xi;
  const v = y - yi;
  const wz = z - zi;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const sw = wz * wz * (3 - 2 * wz);
  const h000 = hash3(xi, yi, zi);
  const h100 = hash3(xi + 1, yi, zi);
  const h010 = hash3(xi, yi + 1, zi);
  const h110 = hash3(xi + 1, yi + 1, zi);
  const h001 = hash3(xi, yi, zi + 1);
  const h101 = hash3(xi + 1, yi, zi + 1);
  const h011 = hash3(xi, yi + 1, zi + 1);
  const h111 = hash3(xi + 1, yi + 1, zi + 1);
  const a0 = h000 + (h100 - h000) * su;
  const a1 = h010 + (h110 - h010) * su;
  const b0 = h001 + (h101 - h001) * su;
  const b1 = h011 + (h111 - h011) * su;
  const c0 = a0 + (a1 - a0) * sv;
  const c1 = b0 + (b1 - b0) * sv;
  return c0 + (c1 - c0) * sw;
}

function fbm(x: number, y: number, z: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// ===================== текстуры =====================

const TW = 256; // долгота
const TH = 128; // широта
const CW = 192;
const CH = 96;

let ELEV: Uint8Array | null = null; // «высота»: континенты и полосы
let FINE: Uint8Array | null = null; // мелкая деталь: кратеры и прожилки
let CLOUD: Uint8Array | null = null;

/** Считается один раз, лениво: первый кадр фона может подождать ~15 мс. */
function buildTextures(): void {
  if (ELEV) return;
  const elev = new Uint8Array(TW * TH);
  const fine = new Uint8Array(TW * TH);
  for (let j = 0; j < TH; j++) {
    const lat = ((j + 0.5) / TH) * Math.PI - Math.PI / 2;
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    for (let i = 0; i < TW; i++) {
      const lon = ((i + 0.5) / TW) * TAU;
      const x = cl * Math.sin(lon);
      const y = sl;
      const z = cl * Math.cos(lon);
      // крупные материки + широтные полосы, размытые тем же шумом
      const cont = fbm(x * 1.9 + 13, y * 1.9 + 5, z * 1.9 - 7, 5);
      const bands = 0.5 + 0.5 * Math.sin(lat * 6.2 + (fbm(x * 2.4, y * 2.4, z * 2.4, 3) - 0.5) * 5);
      elev[j * TW + i] = Math.max(0, Math.min(255, Math.round((cont * 0.76 + bands * 0.24) * 255)));
      // ridged — прожилки, высокочастотный обычный — крапины кратеров
      const veins = 1 - Math.abs(2 * vnoise(x * 11 + 3, y * 11, z * 11) - 1);
      const craters = vnoise(x * 26, y * 26 + 9, z * 26);
      fine[j * TW + i] = Math.round(Math.min(1, veins * 0.6 + craters * 0.4) * 255);
    }
  }
  const cloud = new Uint8Array(CW * CH);
  for (let j = 0; j < CH; j++) {
    const lat = ((j + 0.5) / CH) * Math.PI - Math.PI / 2;
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    for (let i = 0; i < CW; i++) {
      const lon = ((i + 0.5) / CW) * TAU;
      // по широте частота выше — облака вытягиваются в полосы
      const x = cl * Math.sin(lon) * 2.6;
      const y = sl * 5.2;
      const z = cl * Math.cos(lon) * 2.6;
      cloud[j * CW + i] = Math.round(Math.min(1, fbm(x + 31, y - 17, z + 3, 4)) * 255);
    }
  }
  ELEV = elev;
  FINE = fine;
  CLOUD = cloud;
}

// ===================== палитра =====================
//
// Планета не повторяет акцент: база — приглушённый сине-стальной, акцент
// подмешивается отливом. Совпадай они, фон спорил бы с интерфейсом.

interface Pal {
  deep: RGB;
  land: RGB;
  high: RGB;
  cloud: RGB;
  atmo: RGB;
  night: RGB;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function palette(a: RGB): Pal {
  return {
    deep: mix([20, 28, 45], a, 0.12),
    land: mix([48, 64, 95], a, 0.22),
    high: mix([108, 128, 162], a, 0.2),
    cloud: mix([176, 196, 224], a, 0.14),
    atmo: mix([96, 168, 255], a, 0.34),
    night: mix([9, 13, 22], a, 0.1),
  };
}

function css(c: RGB, alpha: number): string {
  return `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${alpha})`;
}

/** Понимает и `rgb(r, g, b)` из CSS-переменной, и `#rrggbb`. */
function parseRgb(v: string, fallback: RGB): RGB {
  const s = v.trim();
  if (s.startsWith('#')) {
    const n = parseInt(s.slice(1), 16);
    return Number.isNaN(n) ? fallback : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/(\d+(?:\.\d+)?)/g);
  return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : fallback;
}

// ===================== геометрия планеты и кольца =====================

// Свет слева-сверху и чуть из-за планеты. Видна только верхняя левая часть
// диска, и при свете «спереди» она была бы освещена целиком: ни терминатора,
// ни ночной стороны в кадре. Из-за спины источник кладёт светлую часть на
// сам край, а середина видимого куска уходит в ночь — там и живут огни.
const LX = -0.775;
const LY = 0.49;
const LZ = -0.4;

// Наклон отрицательный: тогда ближняя половина кольца проходит выше центра
// планеты. Планета срезана нижним краем экрана, и при положительном наклоне
// эта половина оказалась бы за экраном — перекрытия было бы не видно.
const TILT = -0.3; // наклон оси (и плоскости кольца) от зрителя
const ROLL = -0.34; // и поворот в плоскости экрана
const COS_T = Math.cos(TILT);
const SIN_T = Math.sin(TILT);
const COS_R = Math.cos(ROLL);
const SIN_R = Math.sin(ROLL);

// свет в системе планеты (мир → планета: Rx(-TILT)·Rz(-ROLL))
const LP_X = LX * COS_R + LY * SIN_R;
const LP_Y0 = -LX * SIN_R + LY * COS_R;
const LP_Y = LP_Y0 * COS_T + LZ * SIN_T;
const LP_Z = -LP_Y0 * SIN_T + LZ * COS_T;

/** Полосы кольца в долях радиуса планеты: [от, до, плотность]. */
const RING_BANDS: [number, number, number][] = [
  [1.24, 1.44, 0.24],
  [1.5, 1.74, 0.34],
  [1.79, 1.95, 0.18],
  [2.0, 2.13, 0.09],
];
const RING_MAX = 0.34;
const RING_IN = RING_BANDS[0][0];
const RING_OUT = RING_BANDS[RING_BANDS.length - 1][1];

// Тень от кольца на поверхности: плотность по радиусу готовой таблицей —
// перебирать полосы в попиксельном проходе дорого.
const SHADOW_N = 160;
const SHADOW = new Float32Array(SHADOW_N);
for (let i = 0; i < SHADOW_N; i++) {
  const r = RING_IN + (i / (SHADOW_N - 1)) * (RING_OUT - RING_IN);
  let d = 0;
  for (const [a, b, k] of RING_BANDS) {
    if (r > a && r < b) d = (k / RING_MAX) * Math.min(1, Math.min(r - a, b - r) / 0.04);
  }
  SHADOW[i] = d;
}
const SHADOW_K = (SHADOW_N - 1) / (RING_OUT - RING_IN);

// ===================== рендер тела =====================

interface Off {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData | null;
  /** положение и размер в CSS-пикселях */
  x: number;
  y: number;
  w: number;
  h: number;
}

function makeOff(): Off {
  const canvas = document.createElement('canvas');
  return { canvas, ctx: canvas.getContext('2d')!, img: null, x: 0, y: 0, w: 0, h: 0 };
}

interface BodyOpts {
  pal: Pal;
  spin: number; // оборот поверхности, доли текстуры
  cspin: number; // оборот облаков
  clouds: number; // 0 — без атмосферы (луна)
  ring: boolean; // тень от кольца
  rough: number; // сила мелкой детализации
  scale: number; // внутреннее разрешение относительно экранного
  /** Полосы: за кадр считается только одна, полный круг — за `slices`. */
  slice: number;
  slices: number;
}

/**
 * Рисует шар в offscreen. Возвращает false, если тело целиком за экраном.
 * Внутри — единственный тяжёлый цикл фона, поэтому в нём нет ни вызовов
 * наружу, ни аллокаций.
 *
 * За кадр считается одна горизонтальная полоса: разом весь диск давал всплеск
 * в 7–8 мс раз в несколько кадров, а на телефоне такой всплеск — сорванный
 * кадр. Полосы приходят из разных моментов времени, но оборот идёт минуты,
 * и за пару кадров картинка не меняется.
 */
function renderBody(
  off: Off,
  cx: number,
  cy: number,
  R: number,
  vw: number,
  vh: number,
  o: BodyOpts,
): boolean {
  const elev = ELEV;
  const fine = FINE;
  const cloudTex = CLOUD;
  if (!elev || !fine || !cloudTex) return false;
  const x0 = Math.max(0, Math.floor(cx - R) - 1);
  const y0 = Math.max(0, Math.floor(cy - R) - 1);
  const x1 = Math.min(vw, Math.ceil(cx + R) + 1);
  const y1 = Math.min(vh, Math.ceil(cy + R) + 1);
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw <= 0 || bh <= 0) return false;

  const ow = Math.max(1, Math.round(bw * o.scale));
  const oh = Math.max(1, Math.round(bh * o.scale));
  // Съехал буфер (или slice < 0 — сменилась палитра) — прежнее содержимое
  // не годится: считаем все полосы сразу.
  const fresh =
    o.slice < 0 ||
    off.canvas.width !== ow ||
    off.canvas.height !== oh ||
    !off.img ||
    off.x !== x0 ||
    off.y !== y0;
  if (fresh || !off.img) {
    off.canvas.width = ow;
    off.canvas.height = oh;
    off.img = off.ctx.createImageData(ow, oh);
  }
  const img = off.img;
  off.x = x0;
  off.y = y0;
  off.w = bw;
  off.h = bh;
  const jFrom = fresh ? 0 : Math.floor((oh * o.slice) / o.slices);
  const jTo = fresh ? oh : Math.floor((oh * (o.slice + 1)) / o.slices);
  if (jTo <= jFrom) return true;

  const data = img.data;
  const edgeK = (R * ow) / bw; // край сглаживается на один offscreen-пиксель
  const invR = 1 / R;
  const deep = o.pal.deep;
  const land = o.pal.land;
  const high = o.pal.high;
  const cloudCol = o.pal.cloud;
  const atmo = o.pal.atmo;
  const night = o.pal.night;
  const stepX = bw / ow;
  const stepY = bh / oh;

  for (let j = jFrom; j < jTo; j++) {
    const ny = (y0 + (j + 0.5) * stepY - cy) * invR;
    const ny2 = ny * ny;
    let p = j * ow * 4;
    for (let i = 0; i < ow; i++, p += 4) {
      const nx = (x0 + (i + 0.5) * stepX - cx) * invR;
      const d2 = nx * nx + ny2;
      const cover = d2 > 1.1 ? 0 : Math.min(1, Math.max(0, (1 - Math.sqrt(d2)) * edgeK + 0.5));
      if (cover <= 0) {
        data[p] = 0;
        data[p + 1] = 0;
        data[p + 2] = 0;
        data[p + 3] = 0;
        continue;
      }
      const nz = Math.sqrt(Math.max(0, 1 - d2));
      // нормаль в мире: экранный y растёт вниз
      const wy = -ny;
      const diff = nx * LX + wy * LY + nz * LZ;
      // мягкий терминатор: переход шириной ~25 % радиуса
      const lt = Math.min(1, Math.max(0, (diff + 0.24) / 0.5));
      let lam = lt * lt * (3 - 2 * lt);

      // мир → система планеты
      const a1 = nx * COS_R + wy * SIN_R;
      const b1 = -nx * SIN_R + wy * COS_R;
      const px3 = a1;
      const py3 = b1 * COS_T + nz * SIN_T;
      const pz3 = -b1 * SIN_T + nz * COS_T;

      // тень от кольца: луч из точки к источнику до плоскости кольца
      if (o.ring && lam > 0.01) {
        const tHit = -py3 / LP_Y;
        if (tHit > 0) {
          const qx = px3 + tHit * LP_X;
          const qz = pz3 + tHit * LP_Z;
          const rr = Math.sqrt(qx * qx + qz * qz);
          if (rr > RING_IN && rr < RING_OUT) {
            lam *= 1 - 0.7 * SHADOW[((rr - RING_IN) * SHADOW_K) | 0];
          }
        }
      }

      const lat = Math.asin(py3 < -1 ? -1 : py3 > 1 ? 1 : py3);
      const lon = Math.atan2(px3, pz3);
      let u = lon * (1 / TAU) + 0.5 + o.spin;
      u -= Math.floor(u);
      const v = Math.min(0.9999, Math.max(0, lat / Math.PI + 0.5));

      // билинейно: по долготе с заворотом, по широте с зажимом
      const fu = u * TW - 0.5;
      let iu = Math.floor(fu);
      const du = fu - iu;
      iu = ((iu % TW) + TW) % TW;
      const iu1 = iu + 1 === TW ? 0 : iu + 1;
      const fvv = v * TH - 0.5;
      let iv = Math.floor(fvv);
      const dv = fvv - iv;
      if (iv < 0) iv = 0;
      if (iv > TH - 1) iv = TH - 1;
      const iv1 = iv + 1 > TH - 1 ? TH - 1 : iv + 1;
      const r0 = iv * TW;
      const r1 = iv1 * TW;
      const e =
        ((elev[r0 + iu] + (elev[r0 + iu1] - elev[r0 + iu]) * du) * (1 - dv) +
          (elev[r1 + iu] + (elev[r1 + iu1] - elev[r1 + iu]) * du) * dv) /
        255;

      let cr: number;
      let cg: number;
      let cb: number;
      if (e < 0.5) {
        const k = e * 1.2;
        cr = deep[0] + (land[0] - deep[0]) * k;
        cg = deep[1] + (land[1] - deep[1]) * k;
        cb = deep[2] + (land[2] - deep[2]) * k;
      } else {
        const k = (e - 0.5) * 2;
        cr = land[0] + (high[0] - land[0]) * k;
        cg = land[1] + (high[1] - land[1]) * k;
        cb = land[2] + (high[2] - land[2]) * k;
      }
      // мелкая деталь: едва различима, но даёт ощущение масштаба.
      // Текстура того же размера — веса интерполяции берём готовые.
      const fn =
        ((fine[r0 + iu] + (fine[r0 + iu1] - fine[r0 + iu]) * du) * (1 - dv) +
          (fine[r1 + iu] + (fine[r1 + iu1] - fine[r1 + iu]) * du) * dv) /
        255;
      const rough = 1 + (fn - 0.5) * o.rough;
      cr *= rough;
      cg *= rough;
      cb *= rough;

      // облака: свой слой шума, вращается быстрее поверхности
      if (o.clouds > 0) {
        let cu = lon * (1 / TAU) + 0.5 + o.cspin;
        cu -= Math.floor(cu);
        const cfu = cu * CW - 0.5;
        let ciu = Math.floor(cfu);
        const cdu = cfu - ciu;
        ciu = ((ciu % CW) + CW) % CW;
        const ciu1 = ciu + 1 === CW ? 0 : ciu + 1;
        const cfv = v * CH - 0.5;
        let civ = Math.floor(cfv);
        const cdv = cfv - civ;
        if (civ < 0) civ = 0;
        if (civ > CH - 1) civ = CH - 1;
        const civ1 = civ + 1 > CH - 1 ? CH - 1 : civ + 1;
        const cq0 = civ * CW;
        const cq1 = civ1 * CW;
        const cv =
          ((cloudTex[cq0 + ciu] + (cloudTex[cq0 + ciu1] - cloudTex[cq0 + ciu]) * cdu) * (1 - cdv) +
            (cloudTex[cq1 + ciu] + (cloudTex[cq1 + ciu1] - cloudTex[cq1 + ciu]) * cdu) * cdv) /
          255;
        const ct = Math.min(1, Math.max(0, (cv - 0.54) / 0.3));
        const amount = ct * ct * (3 - 2 * ct) * o.clouds;
        if (amount > 0.002) {
          cr += (cloudCol[0] - cr) * amount;
          cg += (cloudCol[1] - cg) * amount;
          cb += (cloudCol[2] - cb) * amount;
        }
      }

      // ночная сторона не чёрная: очень тёмный оттенок собственного цвета
      const li = 0.085 + lam * 0.915;
      cr = night[0] * (1 - lam) + cr * li;
      cg = night[1] * (1 - lam) + cg * li;
      cb = night[2] * (1 - lam) + cb * li;

      // дымка над горизонтом: голубоватое рассеивание у края диска
      if (o.clouds > 0) {
        const rim = d2 * d2 * d2 * d2 * (0.2 + 0.8 * lam) * 0.5;
        cr += (atmo[0] - cr) * rim;
        cg += (atmo[1] - cg) * rim;
        cb += (atmo[2] - cb) * rim;
      }

      data[p] = cr < 0 ? 0 : cr > 255 ? 255 : cr;
      data[p + 1] = cg < 0 ? 0 : cg > 255 ? 255 : cg;
      data[p + 2] = cb < 0 ? 0 : cb > 255 ? 255 : cb;
      data[p + 3] = (cover * 255) | 0;
    }
  }
  off.ctx.putImageData(img, 0, 0, 0, jFrom, ow, jTo - jFrom);
  return true;
}

// ===================== ореол атмосферы =====================
//
// Ореол и дуга лимба зависят только от радиуса и палитры, поэтому пекутся
// в отдельные холсты и дальше блитятся одним вызовом. Направленность (ярче
// со стороны источника) даёт линейный градиент через destination-in — иначе
// пришлось бы собирать кольцо из десятков сегментов на каждом кадре.

function bakeGlow(
  R: number,
  col: RGB,
  from: number,
  to: number,
  peak: number,
  dark: number,
): HTMLCanvasElement {
  const rad = R * to;
  const size = Math.max(2, Math.ceil(rad * 2));
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g2 = c.getContext('2d')!;
  const m = size / 2;
  const g = g2.createRadialGradient(m, m, R * from, m, m, rad);
  g.addColorStop(0, css(col, 0));
  g.addColorStop(0.16, css(col, peak));
  g.addColorStop(1, css(col, 0));
  g2.fillStyle = g;
  g2.fillRect(0, 0, size, size);
  // ярче со стороны света, почти исчезает на теневой
  g2.globalCompositeOperation = 'destination-in';
  const dir = g2.createLinearGradient(m + LX * rad, m - LY * rad, m - LX * rad, m + LY * rad);
  dir.addColorStop(0, 'rgba(0,0,0,1)');
  dir.addColorStop(0.55, `rgba(0,0,0,${Math.min(1, 0.3 + dark)})`);
  dir.addColorStop(1, `rgba(0,0,0,${dark})`);
  g2.fillStyle = dir;
  g2.fillRect(0, 0, size, size);
  return c;
}

// ===================== звёзды =====================

const STAR_WHITE: RGB = [228, 238, 255];
const STAR_BLUE: RGB = [176, 206, 255];
const STAR_WARM: RGB = [255, 214, 172];

interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  phase: number;
  speed: number;
  col: RGB;
}

function makeLayer(count: number, rMin: number, rMax: number, seedBase: number): Star[] {
  let seed = seedBase;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const p = rnd();
    // большинство белые, часть голубая, немного тёплых
    const col = p < 0.74 ? STAR_WHITE : p < 0.9 ? STAR_BLUE : STAR_WARM;
    return {
      x: rnd(),
      y: rnd(),
      r: rMin + rnd() * (rMax - rMin),
      base: 0.25 + rnd() * 0.55,
      phase: rnd() * TAU,
      speed: 0.3 + rnd() * 0.9,
      col,
    };
  });
}

const FAR = makeLayer(230, 0.35, 0.8, 11);
const MID = makeLayer(90, 0.7, 1.4, 22);
const NEAR = makeLayer(26, 1.3, 2.2, 33);

// ===================== огни ночной стороны =====================

interface Light {
  u: number;
  v: number;
  ph: number;
  s: number;
}

/** Не по всей поверхности, а несколькими скоплениями. */
function makeLights(): Light[] {
  let seed = 909;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out: Light[] = [];
  for (let c = 0; c < 13; c++) {
    const cu = rnd();
    const cv = 0.26 + rnd() * 0.48; // средние широты, не полюса
    const n = 5 + Math.floor(rnd() * 9);
    for (let i = 0; i < n; i++) {
      out.push({
        u: cu + (rnd() - 0.5) * 0.075,
        v: cv + (rnd() - 0.5) * 0.05,
        ph: rnd() * TAU,
        s: 0.5 + rnd() * 0.8,
      });
    }
  }
  return out;
}

const LIGHTS = makeLights();

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
}

// Диск планеты обновляется полосами: за кадр считается 1/SLICES, полный круг
// проходит за SLICES кадров (~10 раз в секунду). Обороты идут минуты, так что
// глазу этого хватает, а попиксельный проход перестаёт быть всплеском.
const SLICES = 6;
const SURFACE_TURN = 240000; // полный оборот поверхности, мс
const CLOUD_TURN = 165000; // облака идут заметно быстрее

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
    let frame = 0;
    let meteor: Meteor | null = null;
    let nextMeteorAt = performance.now() + 8000 + Math.random() * 15000;

    let accent: RGB = [79, 216, 255];
    let pal = palette(accent);

    let pcx = 0;
    let pcy = 0;
    let PR = 1;
    let planetScale = 0.8;
    const planet = makeOff();
    const moon = makeOff();
    const far = makeOff();
    let planetOk = false;
    let moonOk = false;
    let farOk = false;
    let glow: HTMLCanvasElement | null = null;
    let limb: HTMLCanvasElement | null = null;
    let nebula: HTMLCanvasElement | null = null;
    let dirty = true; // сменились палитра или размер — перерисовать тела

    const readAccent = () => {
      const next = parseRgb(
        getComputedStyle(document.documentElement).getPropertyValue('--accent'),
        accent,
      );
      if (next[0] === accent[0] && next[1] === accent[1] && next[2] === accent[2]) return;
      accent = next;
      pal = palette(accent);
      glow = null;
      limb = null;
      dirty = true;
    };

    // --- туманности: пекутся один раз, дальше только медленный дрейф ---
    const bakeNebula = () => {
      const s = 0.3;
      const nw = Math.max(2, Math.round(w * 1.18 * s));
      const nh = Math.max(2, Math.round(h * 1.18 * s));
      const c = document.createElement('canvas');
      c.width = nw;
      c.height = nh;
      const g2 = c.getContext('2d')!;
      // размытые пятна очень низкой прозрачности; апскейл делает края мягкими
      const blobs: [number, number, number, RGB, number][] = [
        [0.22, 0.16, 0.58, [120, 70, 220], 0.17],
        [0.86, 0.8, 0.52, [35, 190, 190], 0.13],
        [0.56, 0.42, 0.3, [84, 110, 240], 0.07],
        [0.1, 0.62, 0.26, [190, 90, 200], 0.06],
        [0.72, 0.12, 0.2, [60, 150, 255], 0.06],
      ];
      const m = Math.max(nw, nh);
      for (const [bx, by, br, col, a] of blobs) {
        const x = bx * nw;
        const y = by * nh;
        const g = g2.createRadialGradient(x, y, 0, x, y, m * br);
        g.addColorStop(0, css(col, a));
        g.addColorStop(1, css(col, 0));
        g2.fillStyle = g;
        g2.fillRect(0, 0, nw, nh);
      }
      nebula = c;
    };

    const layout = () => {
      // Планета частично уходит за край экрана: виден не весь диск, а его
      // часть — так масштаб читается лучше. Верхняя дуга проходит сразу под
      // сценой Today: ниже начинаются панели, и там от планеты остаётся
      // только просвет между ними.
      // Потолок в пикселях — ради широких экранов: без него на десктопе диск
      // занимает почти весь кадр и перетягивает внимание на себя.
      PR = Math.min(Math.min(w, h) * 0.62, 430);
      pcx = w * 0.68;
      pcy = h * 0.79;
      // Внутреннее разрешение подгоняется под площадь видимой части: бюджет
      // тяжёлого прохода не должен зависеть от размера экрана.
      const bw = Math.min(w, pcx + PR) - Math.max(0, pcx - PR);
      const bh = Math.min(h, pcy + PR) - Math.max(0, pcy - PR);
      planetScale = Math.max(0.34, Math.min(0.85, Math.sqrt(45000 / Math.max(1, bw * bh))));
      glow = null;
      limb = null;
      dirty = true;
    };

    // --- кольцо ---
    // Точка кольца в экранных координатах: планета → мир → экран.
    // z < 0 — дальняя половина (за диском), z > 0 — ближняя (перед ним).
    // результат кладётся в rpx/rpy: за кадр точек около тысячи, и массив
    // на каждую был бы напрасным мусором для сборщика
    let rpx = 0;
    let rpy = 0;
    const ringPt = (r: number, a: number): void => {
      const sx = r * Math.sin(a);
      const sz = r * Math.cos(a);
      const y1 = -sz * SIN_T;
      rpx = pcx + (sx * COS_R - y1 * SIN_R) * PR;
      rpy = pcy - (sx * SIN_R + y1 * COS_R) * PR;
    };

    const RING_STEPS = 36; // точек на дугу полосы

    /**
     * Половина полосы — один замкнутый контур. Собирать её из штрихов нельзя:
     * перекрытия складывают альфу и полоса покрывается «чешуёй». Неровность
     * плотности (а с ней и видимый оборот) даёт линейный градиент вдоль
     * большой оси проекции: положение вдоль неё монотонно по углу.
     */
    const drawRing = (front: boolean, t: number, dim: number) => {
      const spin = reduced ? 0 : (t / 420000) * TAU;
      // ближняя половина — там, где cos θ > 0: она и проходит перед диском
      const a0 = front ? -Math.PI / 2 : Math.PI / 2;
      const col = mix([188, 206, 240], accent, 0.22);
      for (const [r0, r1, dens] of RING_BANDS) {
        ctx.beginPath();
        for (let i = 0; i <= RING_STEPS; i++) {
          ringPt(r1, a0 + (i / RING_STEPS) * Math.PI);
          if (i === 0) ctx.moveTo(rpx, rpy);
          else ctx.lineTo(rpx, rpy);
        }
        for (let i = RING_STEPS; i >= 0; i--) {
          ringPt(r0, a0 + (i / RING_STEPS) * Math.PI);
          ctx.lineTo(rpx, rpy);
        }
        ctx.closePath();
        const rm = ((r0 + r1) / 2) * PR;
        const g = ctx.createLinearGradient(
          pcx - rm * COS_R,
          pcy + rm * SIN_R,
          pcx + rm * COS_R,
          pcy - rm * SIN_R,
        );
        // дальняя половина уходит за планету и тонет в её тени
        const base = dens * (front ? 1 : 0.7) * dim;
        for (let i = 0; i <= 8; i++) {
          const p = i / 8;
          const k = 0.74 + 0.18 * Math.sin(p * 7 - spin) + 0.12 * Math.sin(p * 13 + spin * 1.7);
          g.addColorStop(p, css(col, base * k));
        }
        ctx.fillStyle = g;
        ctx.fill();
      }
    };

    const drawLights = (t: number, spin: number) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const L of LIGHTS) {
        const lon = (L.u - 0.5 - spin) * TAU;
        const lat = (L.v - 0.5) * Math.PI;
        const cl = Math.cos(lat);
        const px = cl * Math.sin(lon);
        const py = Math.sin(lat);
        const pz = cl * Math.cos(lon);
        // планета → мир: Rz(ROLL)·Rx(TILT)
        const y1 = py * COS_T - pz * SIN_T;
        const z1 = py * SIN_T + pz * COS_T;
        if (z1 <= 0.08) continue; // за горизонтом
        const wx = px * COS_R - y1 * SIN_R;
        const wy = px * SIN_R + y1 * COS_R;
        const diff = wx * LX + wy * LY + z1 * LZ;
        if (diff > 0.05) continue; // на дневной стороне огни не видны
        const night = Math.min(1, (0.05 - diff) / 0.28);
        const edge = Math.min(1, z1 * 3.4); // у лимба гаснут: взгляд скользит
        const tw = reduced ? 1 : 0.62 + 0.38 * Math.sin(t / 620 + L.ph);
        const a = night * edge * tw * 0.72;
        if (a < 0.02) continue;
        const x = pcx + wx * PR;
        const y = pcy - wy * PR;
        if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
        // размер огня привязан к радиусу планеты: на большом диске точки
        // фиксированного размера теряются, на маленьком лезут в глаза
        const s = L.s * Math.min(1.9, Math.max(1, PR * 0.008));
        ctx.fillStyle = `rgba(255, 206, 138, ${a * 0.3})`;
        ctx.beginPath();
        ctx.arc(x, y, s * 3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 226, 176, ${a})`;
        ctx.beginPath();
        ctx.arc(x, y, s * 0.9, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawLayer = (stars: Star[], t: number, parallax: number, warp: number, rays: boolean) => {
      const scroll = reduced ? 0 : window.scrollY;
      const cx = w / 2;
      const cy = h / 2;
      for (const s of stars) {
        const x = s.x * w;
        const y = (((s.y * h - scroll * parallax * 0.01) % h) + h) % h;
        const tw = reduced ? 1 : 0.7 + 0.3 * Math.sin((t / 900) * s.speed + s.phase);
        const a = s.base * tw;
        const col = s.col;
        if (warp > 0) {
          const dx = x - cx;
          const dy = y - cy;
          ctx.strokeStyle = css(col, a);
          ctx.lineWidth = s.r * 0.9;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + dx * warp * 0.22, y + dy * warp * 0.22);
          ctx.stroke();
          continue;
        }
        ctx.fillStyle = css(col, a);
        // мелкие точки — прямоугольником: дуга с заливкой заметно дороже,
        // а на размере меньше пикселя разницы не видно
        if (s.r < 0.9) {
          ctx.fillRect(x - s.r, y - s.r, s.r * 2, s.r * 2);
          continue;
        }
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, TAU);
        ctx.fill();
        if (rays && s.r > 1.55) {
          ctx.strokeStyle = css(col, a * 0.38);
          ctx.lineWidth = 0.7;
          const len = s.r * 3.4;
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

    // Луна и дальняя планета: положение считается здесь, чтобы совпасть
    // с перерисовкой их тел (она идёт не каждый кадр). Размах дрейфа выбран
    // так, чтобы луна не уезжала за левый край.
    const moonAt = (t: number): [number, number, number] => {
      const a = -2.1 + (reduced ? 0 : Math.sin(t / 96000) * 0.22);
      const dist = PR * 1.42;
      return [pcx + Math.cos(a) * dist, pcy + Math.sin(a) * dist, PR * 0.1];
    };
    const farAt = (t: number): [number, number, number] => {
      const drift = reduced ? 0 : Math.sin(t / 150000) * 10;
      return [w * 0.19 + drift, h * 0.23 - drift * 0.4, Math.max(4, Math.min(w, h) * 0.021)];
    };

    const drawFrame = (t: number) => {
      buildTextures();
      if (frame % 10 === 0) readAccent();

      ctx.clearRect(0, 0, w, h);

      // туманности: один блит вместо двух полноэкранных градиентов
      if (nebula) {
        const drift = reduced ? 0 : t / 75000;
        const dx = -w * 0.09 + Math.sin(drift * TAU) * w * 0.035;
        const dy = -h * 0.09 + Math.cos(drift * TAU) * h * 0.025;
        ctx.drawImage(nebula, dx, dy, w * 1.18, h * 1.18);
      }

      const warpLeft = warpUntil - t;
      // 0→1→0 за 600 мс
      const warp = warpLeft > 0 ? (warpLeft > 300 ? (600 - warpLeft) / 300 : warpLeft / 300) : 0;
      drawLayer(FAR, t, 1, warp, false);
      drawLayer(MID, t, 3, warp, false);
      drawLayer(NEAR, t, 6, warp, true);

      const spin = reduced ? 0.12 : (t / SURFACE_TURN) % 1;
      const cspin = reduced ? 0.31 : (t / CLOUD_TURN) % 1;
      const [mx, my, mr] = moonAt(t);
      const [fx, fy, fr] = farAt(t);

      // за кадр — одна полоса планеты; спутники целиком, но по очереди
      // и в те кадры, когда планета уже посчитана не полностью
      const slice = frame % SLICES;
      planetOk = renderBody(planet, pcx, pcy, PR, w, h, {
        pal,
        spin,
        cspin,
        clouds: 0.62,
        ring: true,
        rough: 0.16,
        scale: planetScale,
        slice: dirty ? -1 : slice,
        slices: SLICES,
      });
      if (dirty || slice === 2) {
        moonOk = renderBody(moon, mx, my, mr, w, h, {
          pal,
          spin: spin * 2.4,
          cspin: 0,
          clouds: 0,
          ring: false,
          rough: 0.5,
          scale: 1,
          slice: -1,
          slices: 1,
        });
      }
      if (dirty || slice === 4) {
        farOk = renderBody(far, fx, fy, fr, w, h, {
          pal,
          spin: spin * 0.4 + 0.4,
          cspin: 0,
          clouds: 0.5,
          ring: false,
          rough: 0.2,
          scale: 1,
          slice: -1,
          slices: 1,
        });
      }
      dirty = false;

      // дальняя половина кольца — за диском
      drawRing(false, t, 1);

      // ореол атмосферы за пределами диска, ярче со стороны света
      if (!glow) glow = bakeGlow(PR, pal.atmo, 0.985, 1.085, 0.5, 0.04);
      if (!limb) limb = bakeGlow(PR, mix(pal.atmo, [255, 255, 255], 0.5), 0.978, 1.004, 0.8, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow, pcx - PR * 1.085, pcy - PR * 1.085, PR * 2.17, PR * 2.17);
      ctx.restore();

      // диск: непрозрачный, поэтому звёзды сквозь планету не просвечивают
      if (planetOk) ctx.drawImage(planet.canvas, planet.x, planet.y, planet.w, planet.h);

      // узкая яркая дуга точно по освещённому краю — самая светлая точка кадра
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(limb, pcx - PR * 1.004, pcy - PR * 1.004, PR * 2.008, PR * 2.008);
      ctx.restore();

      drawLights(t, spin);

      // Ближняя половина кольца — поверх диска. Там, где она проходит перед
      // планетой, полоса приглушена: иначе кольцо выглядит наклеенным.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(pcx, pcy, PR, 0, TAU);
      ctx.clip('evenodd');
      drawRing(true, t, 1);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.arc(pcx, pcy, PR, 0, TAU);
      ctx.clip();
      drawRing(true, t, 0.55);
      ctx.restore();

      if (moonOk) ctx.drawImage(moon.canvas, moon.x, moon.y, moon.w, moon.h);
      if (farOk) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.drawImage(far.canvas, far.x, far.y, far.w, far.h);
        ctx.restore();
      }

      drawMeteor(t);

      // Приглушение: ровная лёгкая вуаль на весь кадр и поверх неё — полоса
      // шириной с колонку .app с мягкими краями. Фон остаётся живым, но под
      // текстом панелей яркость дополнительно падает.
      ctx.fillStyle = 'rgba(7, 10, 18, 0.1)';
      ctx.fillRect(0, 0, w, h);
      const col = Math.min(w, 640);
      const cx0 = (w - col) / 2;
      const feather = Math.min(0.24, Math.min(70, col * 0.18) / col);
      const sc = ctx.createLinearGradient(cx0, 0, cx0 + col, 0);
      sc.addColorStop(0, 'rgba(7, 10, 18, 0)');
      sc.addColorStop(feather, 'rgba(7, 10, 18, 0.15)');
      sc.addColorStop(1 - feather, 'rgba(7, 10, 18, 0.15)');
      sc.addColorStop(1, 'rgba(7, 10, 18, 0)');
      ctx.fillStyle = sc;
      ctx.fillRect(cx0, 0, col, h);

      frame++;
    };

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bakeNebula();
      layout();
      if (reduced) drawFrame(performance.now());
    };

    const loop = (t: number) => {
      if (!running) return;
      if (!document.hidden) drawFrame(t);
      raf = requestAnimationFrame(loop);
    };

    // При prefers-reduced-motion всё статично, но детализация сохраняется:
    // кадр перерисовывается только на смену акцента или размера.
    let idle = 0;
    const still = () => {
      if (!running) return;
      // getComputedStyle — принудительный пересчёт стилей; каждый кадр он тут
      // не нужен: акцент меняется за 600 мс, четырёх проверок хватает
      if (++idle % 15 === 0) readAccent();
      if (dirty) drawFrame(performance.now());
      raf = requestAnimationFrame(still);
    };

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(reduced ? still : loop);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="bg-canvas" aria-hidden="true" />;
}
