// Ленивый мост к three.js: тяжёлая сцена подгружается отдельным чанком.
import { Suspense, lazy } from 'react';
import type { BladeSceneProps } from './BladeScene';

const Scene = lazy(() => import('./BladeScene').then((m) => ({ default: m.BladeScene })));

export function LazyBladeScene(props: BladeSceneProps) {
  return (
    <Suspense fallback={null}>
      <Scene {...props} />
    </Suspense>
  );
}
