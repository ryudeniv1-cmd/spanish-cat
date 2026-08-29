// 12 клинков: пороги открытия, цвета, характер эффекта и силуэт рукояти.
// Открываются по числу выученных слов (статусы «Повторяю» + «Освоено»).
//
// Порядок — от светлых к тёмным: чем выше уровень, тем темнее лезвие и тем
// зрелищнее то, что вокруг него происходит. Яркость падает, эффекты растут.

export type BladeFx =
  | 'sparks' // тлеющие искры вдоль лезвия
  | 'gradient' // мягкий градиент к острию
  | 'steady' // ровное лабораторное свечение
  | 'edge' // тёмная сердцевина, светящаяся кромка
  | 'eclipse' // чёрный клинок, белая корона по контуру
  | 'waves' // бегущие волны
  | 'aurora' // переливающийся градиент
  | 'corona' // протуберанцы у гарды
  | 'pulse' // импульсы от рукояти к острию
  | 'jets' // два тонких луча вдоль основного
  | 'nova' // периодическая ударная волна
  | 'warp'; // искажение света вокруг

export interface Blade {
  id: string;
  name: string;
  threshold: number;
  /** 1..12 — насколько богатый эффект у клинка: ореол, частицы, волны. */
  tier: number;
  tagline: string; // короткая строка на английском для сцены открытия
  accent: string; // основной цвет клинка и акцент приложения
  accent2: string; // второй цвет (градиенты, частицы)
  // Цвет сердцевины лезвия. У младших клинков он почти белый, у старших
  // темнеет до чёрного — светится только кромка, а accent остаётся ярким,
  // потому что от него красится весь интерфейс.
  core: string;
  fx: BladeFx;
  // силуэт рукояти: длина, радиус, число насечек, форма гарды
  hilt: { len: number; r: number; rings: number; guard: 'flat' | 'ring' | 'swept' };
  bladeLen: number;
}

export const BLADES: Blade[] = [
  { id: 'meridian', name: 'Meridian', tier: 1, threshold: 10, tagline: 'Perfect balance, perfect line.', accent: '#EAF2FF', accent2: '#C7D8F5', core: '#FFFFFF', fx: 'steady', hilt: { len: 1.1, r: 0.08, rings: 4, guard: 'flat' }, bladeLen: 2.85 },
  { id: 'dawn', name: 'Dawn', tier: 2, threshold: 25, tagline: 'Light grows quietly.', accent: '#FFF0CF', accent2: '#FFD79A', core: '#FFFFFF', fx: 'gradient', hilt: { len: 1.0, r: 0.085, rings: 2, guard: 'ring' }, bladeLen: 2.7 },
  { id: 'aurora', name: 'Aurora', tier: 3, threshold: 50, tagline: 'Colors of the high sky.', accent: '#9FF3EC', accent2: '#C9FFF8', core: '#F2FFFD', fx: 'aurora', hilt: { len: 1.06, r: 0.085, rings: 4, guard: 'flat' }, bladeLen: 2.9 },
  { id: 'riptide', name: 'Riptide', tier: 4, threshold: 100, tagline: 'The current always returns.', accent: '#35E0C2', accent2: '#5CE897', core: '#D8FFF6', fx: 'waves', hilt: { len: 1.02, r: 0.088, rings: 3, guard: 'swept' }, bladeLen: 2.7 },
  { id: 'pulsar', name: 'Pulsar', tier: 5, threshold: 200, tagline: 'A heartbeat measured in light.', accent: '#4D9DFF', accent2: '#9FC4FF', core: '#EAF2FF', fx: 'pulse', hilt: { len: 1.14, r: 0.09, rings: 6, guard: 'flat' }, bladeLen: 2.95 },
  { id: 'nova', name: 'Nova', tier: 6, threshold: 350, tagline: 'Everything, all at once.', accent: '#FFE9A8', accent2: '#FFF6DE', core: '#FFFFFF', fx: 'nova', hilt: { len: 1.12, r: 0.09, rings: 5, guard: 'ring' }, bladeLen: 3.0 },
  { id: 'corona', name: 'Corona', tier: 7, threshold: 500, tagline: 'Born at the edge of a star.', accent: '#FFA22E', accent2: '#FFC46B', core: '#FFE7C2', fx: 'corona', hilt: { len: 1.1, r: 0.1, rings: 3, guard: 'ring' }, bladeLen: 2.8 },
  { id: 'ember', name: 'Ember', tier: 8, threshold: 750, tagline: 'The first spark never dies.', accent: '#FF6A2B', accent2: '#FF8A3D', core: '#FFD0A8', fx: 'sparks', hilt: { len: 1.05, r: 0.09, rings: 3, guard: 'flat' }, bladeLen: 2.6 },
  { id: 'quasar', name: 'Quasar', tier: 9, threshold: 1000, tagline: 'Two rivers of fire.', accent: '#E8365F', accent2: '#FF6B8E', core: '#FFC2CF', fx: 'jets', hilt: { len: 1.1, r: 0.092, rings: 4, guard: 'swept' }, bladeLen: 2.85 },
  { id: 'dusk', name: 'Dusk', tier: 10, threshold: 1500, tagline: 'The edge of night.', accent: '#A86BFF', accent2: '#7B3FE4', core: '#E4D2FF', fx: 'edge', hilt: { len: 1.08, r: 0.095, rings: 3, guard: 'swept' }, bladeLen: 2.75 },
  { id: 'eclipse', name: 'Eclipse', tier: 11, threshold: 2500, tagline: 'Light bends around it.', accent: '#8B5CF6', accent2: '#5B2FB0', core: '#120A26', fx: 'eclipse', hilt: { len: 1.12, r: 0.09, rings: 5, guard: 'ring' }, bladeLen: 2.8 },
  { id: 'singularity', name: 'Singularity', tier: 12, threshold: 5000, tagline: 'Where all words end.', accent: '#7C3AED', accent2: '#3B0F72', core: '#050208', fx: 'warp', hilt: { len: 1.16, r: 0.095, rings: 6, guard: 'swept' }, bladeLen: 2.9 },
];

export function bladeById(id: string | undefined): Blade | undefined {
  return BLADES.find((b) => b.id === id);
}

export function unlockedBlades(learned: number): Blade[] {
  return BLADES.filter((b) => learned >= b.threshold);
}

export function nextBlade(learned: number): Blade | undefined {
  return BLADES.find((b) => learned < b.threshold);
}

/** Клинок по умолчанию до первого открытия — нейтральный холодный акцент. */
export const DEFAULT_ACCENT = { accent: '#4FD8FF', accent2: '#9FF3EC', core: '#EAF9FF' };
