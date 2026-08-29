// Кольцо из 10 сегментов = примеры к слову; центр закрашен, если есть перевод.
// Новый заполненный пример зажигается с микро-пульсацией (ТЗ по дизайну, 7).
import { useEffect, useRef, useState, type ReactNode } from 'react';

const SEGMENTS = 10;

interface Props {
  filled: number;
  hasTr?: boolean;
  size?: number;
  children?: ReactNode; // содержимое центра
}

export function ExampleRing({ filled, hasTr = false, size = 148, children }: Props) {
  const prev = useRef(filled);
  const [lit, setLit] = useState<number | null>(null);

  useEffect(() => {
    if (filled > prev.current) {
      setLit(filled - 1);
      const timer = setTimeout(() => setLit(null), 620);
      prev.current = filled;
      return () => clearTimeout(timer);
    }
    prev.current = filled;
  }, [filled]);

  // геометрия в системе 148×148, масштабируется через viewBox
  const c = 74;
  const r = 64;
  const thin = size < 80;
  // мелкое кольцо: сегменты толще, поэтому зазор нужен шире, иначе сливаются
  const gap = thin ? 0.16 : 0.06;

  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 148 148">
        {Array.from({ length: SEGMENTS }, (_, i) => {
          // старт сверху: -90° плюс зазор между сегментами
          const a0 = (i / SEGMENTS) * Math.PI * 2 - Math.PI / 2 + gap;
          const a1 = ((i + 1) / SEGMENTS) * Math.PI * 2 - Math.PI / 2 - gap;
          const on = i < filled;
          return (
            <path
              key={i}
              className={`ring-seg ${on ? 'ring-seg--on' : ''} ${lit === i ? 'ring-seg--lit' : ''}`}
              d={`M ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${
                c + r * Math.cos(a1)
              } ${c + r * Math.sin(a1)}`}
              fill="none"
              strokeWidth={on ? (thin ? 9 : 5) : thin ? 6 : 3.5}
              strokeLinecap="round"
            />
          );
        })}
        {hasTr && <circle cx={c} cy={c} r={40} fill="var(--accent-soft)" />}
      </svg>
      {children !== undefined && <div className="progress-ring__center">{children}</div>}
    </div>
  );
}
