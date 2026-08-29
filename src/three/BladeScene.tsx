// Единая 3D-сцена клинка: рукоять и лезвие из примитивов, частицы, bloom.
// Параметризуется определением из theme/blades.ts — все 12 клинков собираются кодом.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Blade } from '../theme/blades';

const PARTICLE_COUNT = 220;

interface BladeModelProps {
  blade: Blade;
  reveal?: number | null; // timestamp начала сцены открытия (лезвие выдвигается)
  particlesOff?: boolean;
  interactive?: boolean;
}

function BladeModel({ blade, reveal, particlesOff, interactive }: BladeModelProps) {
  const group = useRef<THREE.Group>(null);
  const bladeRef = useRef<THREE.Mesh>(null);
  const bladeMat = useRef<THREE.MeshStandardMaterial>(null);
  const auraRef = useRef<THREE.Mesh>(null);
  const auraMat = useRef<THREE.MeshBasicMaterial>(null);
  const novaRef = useRef<THREE.Mesh>(null);
  const points = useRef<THREE.Points>(null);
  const drag = useRef({ active: false, x: 0, vel: 0, extra: 0 });
  const tilt = useRef(0);
  const { gl } = useThree();

  const accent = useMemo(() => new THREE.Color(blade.accent), [blade]);
  const accent2 = useMemo(() => new THREE.Color(blade.accent2), [blade]);

  const dark = blade.fx === 'eclipse' || blade.fx === 'edge' || blade.fx === 'warp';

  // частицы: начальные позиции и фазы
  const pData = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const phase = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      phase[i] = Math.random();
      pos[i * 3] = (Math.random() - 0.5) * 0.5;
      pos[i * 3 + 1] = Math.random() * blade.bladeLen;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    }
    return { pos, phase };
  }, [blade]);

  // перетаскивание пальцем
  useEffect(() => {
    if (!interactive) return;
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      drag.current.active = true;
      drag.current.x = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (!drag.current.active) return;
      const dx = e.clientX - drag.current.x;
      drag.current.x = e.clientX;
      drag.current.extra += dx * 0.012;
      drag.current.vel = dx * 0.012;
    };
    const up = () => {
      drag.current.active = false;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [gl, interactive]);

  // наклон устройства
  useEffect(() => {
    if (!interactive) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null) tilt.current = THREE.MathUtils.clamp(e.gamma / 90, -1, 1) * 0.25;
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [interactive]);

  useFrame((state, dt) => {
    if (document.hidden) return;
    const t = state.clock.elapsedTime;
    const g = group.current;
    if (!g) return;

    // вращение: полный оборот ~24 с + инерция от перетаскивания
    if (!drag.current.active) {
      drag.current.vel *= Math.pow(0.05, dt);
      drag.current.extra += drag.current.vel;
    }
    g.rotation.y = (t * Math.PI * 2) / 24 + drag.current.extra;
    g.rotation.z = 0.09 + tilt.current;

    // сцена открытия: лезвие выдвигается
    if (reveal !== undefined && reveal !== null && bladeRef.current) {
      const age = (performance.now() - reveal) / 1000;
      const grow = THREE.MathUtils.clamp((age - 1.1) / 1.1, 0.001, 1);
      const e = 1 - Math.pow(1 - grow, 3);
      bladeRef.current.scale.y = e;
      bladeRef.current.position.y = 0.35 + (blade.bladeLen / 2) * e;
      if (auraRef.current) {
        auraRef.current.scale.y = e;
        auraRef.current.position.y = bladeRef.current.position.y;
      }
    }

    // характер клинка
    const m = bladeMat.current;
    const am = auraMat.current;
    if (m && am) {
      let inten = dark ? 0.25 : 1.6;
      let auraOp = 0.32;
      switch (blade.fx) {
        case 'steady':
          inten = 1.8;
          break;
        case 'waves':
          inten = 1.4 + 0.5 * Math.sin(t * 3.2);
          break;
        case 'pulse':
          inten = 1.2 + Math.max(0, Math.sin(t * 2.4)) ** 6 * 1.4;
          break;
        case 'aurora': {
          const k = (Math.sin(t * 0.9) + 1) / 2;
          am.color.copy(accent).lerp(accent2, k);
          inten = 1.5;
          break;
        }
        case 'nova':
          inten = 1.6 + Math.max(0, Math.sin(t * 1.55)) ** 10 * 1.6;
          break;
        case 'eclipse':
          auraOp = 0.5;
          break;
        case 'edge':
          auraOp = 0.55;
          break;
        case 'warp':
          auraOp = 0.4 + 0.12 * Math.sin(t * 1.7);
          if (auraRef.current) {
            auraRef.current.scale.x = 1 + 0.1 * Math.sin(t * 2.3);
            auraRef.current.scale.z = 1 + 0.1 * Math.cos(t * 1.9);
          }
          break;
        default:
          break;
      }
      // дыхание (период 4 с, небольшая амплитуда)
      m.emissiveIntensity = inten * (1 + 0.08 * Math.sin((t * Math.PI * 2) / 4));
      am.opacity = auraOp * (1 + 0.1 * Math.sin((t * Math.PI * 2) / 4));
    }

    // ударная волна Nova
    if (novaRef.current) {
      const cycle = (t % 4.05) / 4.05;
      const nm = novaRef.current.material as THREE.MeshBasicMaterial;
      if (cycle < 0.4) {
        const k = cycle / 0.4;
        novaRef.current.visible = true;
        novaRef.current.scale.setScalar(0.3 + k * 3.2);
        nm.opacity = 0.5 * (1 - k);
      } else {
        novaRef.current.visible = false;
      }
    }

    // частицы
    const pts = points.current;
    if (pts) {
      pts.visible = !particlesOff;
      if (!particlesOff) {
        const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const ph = pData.phase[i];
          const i3 = i * 3;
          switch (blade.fx) {
            case 'sparks':
            case 'gradient': {
              const life = (t * (0.25 + ph * 0.4) + ph) % 1;
              arr[i3] = Math.sin(ph * 40 + t) * 0.16 * (1 - life * 0.4);
              arr[i3 + 1] = 0.3 + life * blade.bladeLen;
              arr[i3 + 2] = Math.cos(ph * 34 + t) * 0.16 * (1 - life * 0.4);
              break;
            }
            case 'waves':
            case 'pulse':
            case 'nova': {
              const life = (t * 0.5 + ph) % 1;
              const ang = ph * Math.PI * 2 + t * 0.8;
              arr[i3] = Math.cos(ang) * 0.2;
              arr[i3 + 1] = 0.3 + life * blade.bladeLen;
              arr[i3 + 2] = Math.sin(ang) * 0.2;
              break;
            }
            case 'corona': {
              const ang = ph * Math.PI * 2 + t * (0.4 + ph * 0.6);
              const r = 0.35 + 0.22 * Math.sin(t * 1.6 + ph * 9);
              arr[i3] = Math.cos(ang) * r;
              arr[i3 + 1] = 0.3 + Math.sin(t * 2 + ph * 7) * 0.18;
              arr[i3 + 2] = Math.sin(ang) * r;
              break;
            }
            default: {
              // медленная орбита вокруг лезвия
              const ang = ph * Math.PI * 2 + t * (blade.fx === 'warp' ? 1.1 : 0.3);
              const r = 0.3 + ph * 0.25;
              arr[i3] = Math.cos(ang) * r;
              arr[i3 + 1] = 0.3 + ((ph * 7 + t * 0.22) % 1) * blade.bladeLen;
              arr[i3 + 2] = Math.sin(ang) * r;
              break;
            }
          }
        }
        attr.needsUpdate = true;
      }
    }
  });

  const hiltY = -blade.hilt.len / 2 + 0.16;
  const bladeY = reveal !== undefined && reveal !== null ? 0.35 : 0.35 + blade.bladeLen / 2;

  return (
    // наклон идёт от рукояти, поэтому группу сдвигаем влево —
    // иначе клинок уезжает вправо и левая половина сцены пустует
    <group ref={group} position={[-0.22, -1.35, 0]} scale={0.92}>
      {/* рукоять */}
      <mesh position={[0, hiltY, 0]}>
        <cylinderGeometry args={[blade.hilt.r, blade.hilt.r * 1.12, blade.hilt.len, 24]} />
        <meshStandardMaterial color="#161d2e" metalness={0.85} roughness={0.35} />
      </mesh>
      {/* насечки */}
      {Array.from({ length: blade.hilt.rings }, (_, i) => (
        <mesh key={i} position={[0, hiltY - blade.hilt.len / 2 + ((i + 1) * blade.hilt.len) / (blade.hilt.rings + 1), 0]}>
          <torusGeometry args={[blade.hilt.r * 1.06, 0.014, 10, 28]} />
          <meshStandardMaterial
            color={blade.accent}
            emissive={blade.accent}
            emissiveIntensity={0.7}
            metalness={0.6}
            roughness={0.3}
          />
        </mesh>
      ))}
      {/* навершие */}
      <mesh position={[0, hiltY - blade.hilt.len / 2 - 0.06, 0]}>
        <sphereGeometry args={[blade.hilt.r * 1.1, 18, 14]} />
        <meshStandardMaterial color="#0e1322" metalness={0.9} roughness={0.3} />
      </mesh>
      {/* гарда */}
      {blade.hilt.guard === 'flat' && (
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[0.5, 0.07, 0.16]} />
          <meshStandardMaterial color="#1c2540" metalness={0.85} roughness={0.3} />
        </mesh>
      )}
      {blade.hilt.guard === 'ring' && (
        <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.26, 0.045, 12, 32]} />
          <meshStandardMaterial
            color="#1c2540"
            emissive={blade.accent}
            emissiveIntensity={0.35}
            metalness={0.85}
            roughness={0.3}
          />
        </mesh>
      )}
      {blade.hilt.guard === 'swept' && (
        <group position={[0, 0.18, 0]}>
          <mesh rotation={[0, 0, 0.5]} position={[-0.18, 0.03, 0]}>
            <boxGeometry args={[0.36, 0.05, 0.1]} />
            <meshStandardMaterial color="#1c2540" metalness={0.85} roughness={0.3} />
          </mesh>
          <mesh rotation={[0, 0, -0.5]} position={[0.18, 0.03, 0]}>
            <boxGeometry args={[0.36, 0.05, 0.1]} />
            <meshStandardMaterial color="#1c2540" metalness={0.85} roughness={0.3} />
          </mesh>
        </group>
      )}
      {/* лезвие */}
      <mesh ref={bladeRef} position={[0, bladeY, 0]}>
        <capsuleGeometry args={[0.085, blade.bladeLen - 0.17, 6, 16]} />
        <meshStandardMaterial
          ref={bladeMat}
          color={dark ? '#05070c' : blade.core}
          emissive={blade.core}
          emissiveIntensity={dark ? 0.25 : 1.6}
          roughness={0.2}
          metalness={0.1}
        />
      </mesh>
      {/* ореол */}
      <mesh ref={auraRef} position={[0, bladeY, 0]}>
        <capsuleGeometry args={[0.15, blade.bladeLen - 0.1, 6, 16]} />
        <meshBasicMaterial
          ref={auraMat}
          color={blade.accent}
          transparent
          opacity={0.32}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* лучи Quasar */}
      {blade.fx === 'jets' && (
        <>
          <mesh position={[0.2, bladeY + 0.1, 0]} rotation={[0, 0, -0.06]}>
            <cylinderGeometry args={[0.018, 0.018, blade.bladeLen * 0.92, 8]} />
            <meshBasicMaterial color={blade.accent2} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <mesh position={[-0.2, bladeY + 0.1, 0]} rotation={[0, 0, 0.06]}>
            <cylinderGeometry args={[0.018, 0.018, blade.bladeLen * 0.92, 8]} />
            <meshBasicMaterial color={blade.accent2} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </>
      )}
      {/* ударная волна Nova */}
      {blade.fx === 'nova' && (
        <mesh ref={novaRef} position={[0, bladeY, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.4, 0.02, 8, 40]} />
          <meshBasicMaterial color={blade.core} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}
      {/* частицы */}
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[pData.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={blade.fx === 'eclipse' ? '#ffffff' : blade.accent2}
          size={0.045}
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

/** Следит за fps: при просадке ниже 40 снижает dpr и отключает частицы. */
function PerfGuard({ onDegrade }: { onDegrade: () => void }) {
  const frames = useRef(0);
  const start = useRef(0);
  const done = useRef(false);
  const { gl } = useThree();
  useFrame(() => {
    if (done.current || document.hidden) return;
    if (start.current === 0) start.current = performance.now();
    frames.current++;
    const elapsed = performance.now() - start.current;
    if (elapsed > 3000) {
      const fps = (frames.current / elapsed) * 1000;
      if (fps < 40) {
        gl.setPixelRatio(1);
        onDegrade();
      }
      done.current = true;
    }
  });
  return null;
}

export interface BladeSceneProps {
  blade: Blade;
  reveal?: number | null;
  interactive?: boolean;
  bloomIntensity?: number;
}

export function BladeScene({ blade, reveal, interactive = true, bloomIntensity = 1.5 }: BladeSceneProps) {
  const [degraded, setDegraded] = useState(false);
  return (
    <Canvas
      dpr={degraded ? 1 : [1, 2]}
      gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0.2, 8.2], fov: 38 }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.25} />
      <pointLight position={[2.5, 2, 3]} intensity={14} color={blade.accent} />
      <pointLight position={[-3, 1.5, -3.5]} intensity={20} color="#3d5f9e" />
      <directionalLight position={[0, 4, 2]} intensity={0.5} color="#c9d8ff" />
      <BladeModel blade={blade} reveal={reveal} particlesOff={degraded} interactive={interactive} />
      <PerfGuard onDegrade={() => setDegraded(true)} />
      {!degraded && (
        <EffectComposer>
          <Bloom intensity={bloomIntensity} luminanceThreshold={0.2} luminanceSmoothing={0.6} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
  );
}
