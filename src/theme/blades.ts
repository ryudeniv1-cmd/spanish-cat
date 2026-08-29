// 12 клинков: пороги открытия, цвета, характер эффекта и силуэт рукояти.
// Открываются по числу выученных слов (статусы «Повторяю» + «Освоено»).

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
  core: string; // цвет сердцевины лезвия
  fx: BladeFx;
  // силуэт рукояти: длина, радиус, число насечек, форма гарды
  hilt: { len: number; r: number; rings: number; guard: 'flat' | 'ring' | 'swept' };
  bladeLen: number;
}

export const BLADES: Blade[] = [
  { id: 'ember', name: 'Ember', tier: 1, threshold: 10, tagline: 'The first spark never dies.', accent: '#FF8A3D', accent2: '#FFB454', core: '#FFD9B0', fx: 'sparks', hilt: { len: 1.05, r: 0.09, rings: 3, guard: 'flat' }, bladeLen: 2.6 },
  { id: 'dawn', name: 'Dawn', tier: 2, threshold: 25, tagline: 'Light grows quietly.', accent: '#FFC46B', accent2: '#FF9AAE', core: '#FFF1D6', fx: 'gradient', hilt: { len: 1.0, r: 0.085, rings: 2, guard: 'ring' }, bladeLen: 2.7 },
  { id: 'meridian', name: 'Meridian', tier: 3, threshold: 50, tagline: 'Perfect balance, perfect line.', accent: '#9FF3EC', accent2: '#E8FDFB', core: '#FFFFFF', fx: 'steady', hilt: { len: 1.1, r: 0.08, rings: 4, guard: 'flat' }, bladeLen: 2.85 },
  { id: 'dusk', name: 'Dusk', tier: 4, threshold: 100, tagline: 'The edge of night.', accent: '#A86BFF', accent2: '#6E3BD9', core: '#2A1450', fx: 'edge', hilt: { len: 1.08, r: 0.095, rings: 3, guard: 'swept' }, bladeLen: 2.75 },
  { id: 'eclipse', name: 'Eclipse', tier: 5, threshold: 200, tagline: 'Light bends around it.', accent: '#E8ECF4', accent2: '#8B9AB8', core: '#05070C', fx: 'eclipse', hilt: { len: 1.12, r: 0.09, rings: 5, guard: 'ring' }, bladeLen: 2.8 },
  { id: 'riptide', name: 'Riptide', tier: 6, threshold: 350, tagline: 'The current always returns.', accent: '#35E0C2', accent2: '#1FA3D9', core: '#D8FFF6', fx: 'waves', hilt: { len: 1.02, r: 0.088, rings: 3, guard: 'swept' }, bladeLen: 2.7 },
  { id: 'aurora', name: 'Aurora', tier: 7, threshold: 500, tagline: 'Colors of the high sky.', accent: '#5CE897', accent2: '#C86BFF', core: '#EFFFEF', fx: 'aurora', hilt: { len: 1.06, r: 0.085, rings: 4, guard: 'flat' }, bladeLen: 2.9 },
  { id: 'corona', name: 'Corona', tier: 8, threshold: 750, tagline: 'Born at the edge of a star.', accent: '#FFA22E', accent2: '#FF5C3D', core: '#FFF3DA', fx: 'corona', hilt: { len: 1.1, r: 0.1, rings: 3, guard: 'ring' }, bladeLen: 2.8 },
  { id: 'pulsar', name: 'Pulsar', tier: 9, threshold: 1000, tagline: 'A heartbeat measured in light.', accent: '#4D8DFF', accent2: '#9FC4FF', core: '#EAF2FF', fx: 'pulse', hilt: { len: 1.14, r: 0.09, rings: 6, guard: 'flat' }, bladeLen: 2.95 },
  { id: 'quasar', name: 'Quasar', tier: 10, threshold: 1500, tagline: 'Two rivers of fire.', accent: '#C84DFF', accent2: '#FF6BD5', core: '#F6E4FF', fx: 'jets', hilt: { len: 1.1, r: 0.092, rings: 4, guard: 'swept' }, bladeLen: 2.85 },
  { id: 'nova', name: 'Nova', tier: 11, threshold: 2500, tagline: 'Everything, all at once.', accent: '#F4FBFF', accent2: '#BFE9FF', core: '#FFFFFF', fx: 'nova', hilt: { len: 1.12, r: 0.09, rings: 5, guard: 'ring' }, bladeLen: 3.0 },
  { id: 'singularity', name: 'Singularity', tier: 12, threshold: 5000, tagline: 'Where all words end.', accent: '#B8A6FF', accent2: '#3B2E6E', core: '#0A0616', fx: 'warp', hilt: { len: 1.16, r: 0.095, rings: 6, guard: 'swept' }, bladeLen: 2.9 },
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
