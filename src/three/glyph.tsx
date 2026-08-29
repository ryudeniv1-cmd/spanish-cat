// Лёгкая часть без three.js: проверка WebGL и SVG-силуэт клинка
// (фолбэк и карточки Armory). Загружается в основном бандле.
import type { Blade } from '../theme/blades';

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function BladeGlyph({ blade, locked, className }: { blade: Blade; locked?: boolean; className?: string }) {
  const c = locked ? '#2a3350' : blade.accent;
  const coreC = locked ? '#1a2138' : blade.core;
  const guard = blade.hilt.guard;
  return (
    <svg viewBox="0 0 60 120" className={className ?? 'blade-glyph'} aria-hidden="true">
      {!locked && <ellipse cx="30" cy="45" rx="14" ry="42" fill={blade.accent} opacity="0.16" />}
      <rect
        x="27.2"
        y="8"
        width="5.6"
        height="68"
        rx="2.8"
        fill={coreC}
        style={locked ? undefined : { filter: `drop-shadow(0 0 6px ${c})` }}
      />
      {guard === 'flat' && <rect x="18" y="76" width="24" height="4" rx="2" fill="#232c48" />}
      {guard === 'ring' && <circle cx="30" cy="78" r="7" fill="none" stroke="#232c48" strokeWidth="3" />}
      {guard === 'swept' && (
        <path d="M18 82 Q30 72 42 82" fill="none" stroke="#232c48" strokeWidth="3.4" strokeLinecap="round" />
      )}
      <rect x="26.4" y="82" width="7.2" height={blade.hilt.len * 22} rx="3" fill="#161d2e" />
      {Array.from({ length: blade.hilt.rings }, (_, i) => (
        <rect key={i} x="25.4" y={86 + i * 5} width="9.2" height="1.7" rx="0.8" fill={c} opacity={locked ? 0.5 : 0.9} />
      ))}
      <circle cx="30" cy={84 + blade.hilt.len * 22} r="4" fill="#0e1322" />
    </svg>
  );
}
