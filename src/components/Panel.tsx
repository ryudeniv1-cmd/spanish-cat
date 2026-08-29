import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Иерархия яркости: active светится, dim 70 %, far 45 %. */
  tone?: 'active' | 'normal' | 'dim' | 'far';
  /** Порядок в каскаде появления: задержка order × 60 мс. */
  order?: number;
  /** Выключить собственное появление, если панель уже обёрнута анимацией. */
  animated?: boolean;
}

const TONE_OPACITY = { active: 1, normal: 1, dim: 0.7, far: 0.45 } as const;

/** Стеклянная панель с подсветкой (ТЗ по дизайну, раздел 5). */
export function Panel({
  title,
  aside,
  children,
  className,
  tone = 'normal',
  order = 0,
  animated = true,
}: Props) {
  const toneClass =
    tone === 'active' ? 'glass--active' : tone === 'dim' ? 'glass--dim' : tone === 'far' ? 'glass--far' : '';

  const body = (
    <div className="glass__shape">
      {title !== undefined && (
        <div className="glass__title">
          <h2>{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </div>
  );

  const cls = `glass ${toneClass} ${className ?? ''}`;
  if (!animated) return <section className={cls}>{body}</section>;

  return (
    <motion.section
      className={cls}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: TONE_OPACITY[tone], y: 0 }}
      transition={{ delay: order * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {body}
    </motion.section>
  );
}
