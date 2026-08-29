// Звук интерфейса на Web Audio: всё синтезируется на лету, файлов нет.
//
// Контекст создаётся лениво, при первом же звуке: до жеста пользователя
// браузер всё равно держит его в состоянии suspended. Любая ошибка здесь
// не должна ломать нажатие, поэтому всё завёрнуто в try/catch.

export type Sfx =
  | 'tap' // нажатие на кнопку
  | 'nav' // переход по вкладкам
  | 'select' // выбор персонажа, открытие карточки
  | 'success' // «Выучил», экипировка, «Поставить на Today»
  | 'soft' // «Вспомнил»
  | 'low' // «Не вспомнил»
  | 'saber'; // включение светового меча

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (!on && ctx) {
    try {
      void ctx.suspend();
    } catch {
      /* noop */
    }
  }
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.3;
      master.connect(ctx.destination);
    }
    if (ctx.state !== 'running') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Короткий тон с экспоненциальным затуханием. */
function tone(
  c: AudioContext,
  opts: { from: number; to?: number; dur: number; type?: OscillatorType; gain?: number; at?: number },
): void {
  const t = c.currentTime + (opts.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'triangle';
  osc.frequency.setValueAtTime(opts.from, t);
  if (opts.to !== undefined) osc.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
  const peak = opts.gain ?? 0.22;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + opts.dur + 0.02);
}

/** Буфер белого шума на заданную длительность. */
function noise(c: AudioContext, dur: number): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Включение светового меча: щелчок-шипение плюс поднимающийся гул,
 * который выходит на ровное гудение с лёгкой вибрацией и затухает.
 */
function saber(c: AudioContext): void {
  const t = c.currentTime;

  // щелчок: короткий всплеск шума через полосовой фильтр, съезжающий вниз
  const snap = c.createBufferSource();
  snap.buffer = noise(c, 0.22);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(2600, t);
  bp.frequency.exponentialRampToValueAtTime(500, t + 0.2);
  bp.Q.value = 0.9;
  const sg = c.createGain();
  sg.gain.setValueAtTime(0.35, t);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  snap.connect(bp).connect(sg).connect(master!);
  snap.start(t);
  snap.stop(t + 0.24);

  // гул: две расстроенные пилы через резонансный низкочастотный фильтр
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
  lp.frequency.exponentialRampToValueAtTime(760, t + 1.1);
  lp.Q.value = 6;

  const hum = c.createGain();
  hum.gain.setValueAtTime(0.0001, t);
  hum.gain.exponentialRampToValueAtTime(0.3, t + 0.09);
  hum.gain.setValueAtTime(0.3, t + 0.5);
  hum.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
  lp.connect(hum).connect(master!);

  // характерная вибрация частоты
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 7.5;
  lfoGain.gain.value = 3.2;
  lfo.connect(lfoGain);

  for (const base of [82, 123]) {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    // «раскрутка» при включении
    osc.frequency.setValueAtTime(base * 0.45, t);
    osc.frequency.exponentialRampToValueAtTime(base, t + 0.16);
    lfoGain.connect(osc.frequency);
    osc.connect(lp);
    osc.start(t);
    osc.stop(t + 1.3);
  }
  lfo.start(t);
  lfo.stop(t + 1.3);
}

export function sfx(kind: Sfx): void {
  const c = audio();
  if (!c || !master) return;
  try {
    switch (kind) {
      case 'tap':
        tone(c, { from: 660, to: 420, dur: 0.07, gain: 0.16 });
        break;
      case 'nav':
        tone(c, { from: 520, to: 760, dur: 0.09, gain: 0.16 });
        break;
      case 'select':
        tone(c, { from: 620, dur: 0.08, gain: 0.15 });
        tone(c, { from: 930, dur: 0.12, gain: 0.14, at: 0.06 });
        break;
      case 'success':
        tone(c, { from: 660, dur: 0.1, gain: 0.16 });
        tone(c, { from: 880, dur: 0.1, gain: 0.15, at: 0.08 });
        tone(c, { from: 1320, dur: 0.22, gain: 0.13, at: 0.16 });
        break;
      case 'soft':
        tone(c, { from: 780, to: 980, dur: 0.11, gain: 0.14 });
        break;
      case 'low':
        tone(c, { from: 300, to: 190, dur: 0.16, type: 'sine', gain: 0.18 });
        break;
      case 'saber':
        saber(c);
        break;
    }
  } catch {
    /* звук не должен ломать нажатие */
  }
}
