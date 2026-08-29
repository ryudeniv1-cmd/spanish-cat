import type { ReactNode } from 'react';

interface Props {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Голографическая панель HUD со скошенными углами и линией-акцентом. */
export function Panel({ title, aside, children, className }: Props) {
  return (
    <section className={`panel ${className ?? ''}`}>
      <div className="panel__inner">
        <div className="panel__accent" />
        {title !== undefined && (
          <div className="panel__title">
            <h2>{title}</h2>
            {aside}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
