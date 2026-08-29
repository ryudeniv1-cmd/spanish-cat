// Galaxy: карта галактики + прогресс по уровням + график за 30 дней.
import { motion } from 'framer-motion';
import { useCallback, useState } from 'react';
import { useAppStore, useStoreVersion } from '../AppContext';
import { WORDS } from '../data/words';
import { Panel } from '../components/Panel';
import { GalaxyCanvas } from '../components/GalaxyCanvas';
import { LevelBadge, STATUS_RU } from '../components/badges';

interface Tip {
  id: number;
  x: number;
  y: number;
}

export function MapScreen() {
  const store = useAppStore();
  const version = useStoreVersion();
  const [tip, setTip] = useState<Tip | null>(null);

  const stats = store.levelStats();
  const learnedTotal = stats.reduce((n, s) => n + s.learned, 0);
  const masteredTotal = stats.reduce((n, s) => n + s.mastered, 0);
  const reviewNow = learnedTotal - masteredTotal;
  const chart = store.learnedByDay(30);
  const chartMax = Math.max(1, ...chart);

  const onSelect = useCallback((id: number | null, x: number, y: number) => {
    setTip(id === null ? null : { id, x, y });
  }, []);

  const height = Math.min(430, Math.max(300, Math.round(window.innerHeight * 0.48)));

  return (
    <div>
      <h1 className="screen-title">Galaxy</h1>

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <GalaxyCanvas
          statuses={store.statuses}
          stats={stats}
          version={version}
          height={height}
          onSelect={onSelect}
        />
        {tip && (
          <div
            className="galaxy-tooltip"
            style={{
              left: Math.min(tip.x, window.innerWidth - 240),
              top: Math.max(6, tip.y - 74),
            }}
          >
            <div className="es-word">{WORDS[tip.id].word}</div>
            <div className="mono">
              {WORDS[tip.id].level} · №{WORDS[tip.id].rank} · {STATUS_RU[store.status(tip.id)]}
            </div>
          </div>
        )}
      </div>

      <Panel title="Сектора" order={0}>
        {stats.map((s) => {
          const pct = Math.round(((s.known + s.learned) / s.total) * 100);
          return (
            <div key={s.level} className="sector-row">
              <div className="sector-row__head">
                <LevelBadge level={s.level} />
                <span className="mono sector-row__count">
                  {s.known + s.learned} / {s.total}
                </span>
                <span className="mono sector-row__pct">{pct} %</span>
              </div>
              <div className="stat-bar">
                <div style={{ width: `${(s.known / s.total) * 100}%`, background: 'var(--st-known)' }} />
                <div style={{ width: `${(s.learned / s.total) * 100}%`, background: 'var(--accent)' }} />
                <div style={{ width: `${(s.learning / s.total) * 100}%`, background: 'var(--warm)' }} />
              </div>
            </div>
          );
        })}
        <div className="sector-legend">
          <span>
            <i style={{ background: 'var(--st-known)' }} />
            знаю
          </span>
          <span>
            <i style={{ background: 'var(--accent)' }} />
            выучено
          </span>
          <span>
            <i style={{ background: 'var(--warm)' }} />
            учу
          </span>
        </div>
      </Panel>

      <Panel title="Показания" tone="dim" order={1}>
        <div className="stat-numbers">
          <div className="stat-cell">
            <div className="num">{learnedTotal}</div>
            <div className="mono">всего выучено</div>
          </div>
          <div className="stat-cell">
            <div className="num num--white">{masteredTotal}</div>
            <div className="mono">из них освоено</div>
          </div>
          <div className="stat-cell">
            <div className="num">{reviewNow}</div>
            <div className="mono">на повторении</div>
          </div>
          <div className="stat-cell">
            <div className="num num--warm">{store.meta.sentences_total}</div>
            <div className="mono">предложений всего</div>
          </div>
        </div>
      </Panel>

      <Panel title="Выучено за 30 дней" tone="dim" order={2} aside={<span className="mono">слов/день</span>}>
        <div className="chart30">
          {chart.map((n, i) => (
            <motion.div
              key={i}
              className={`col ${n === 0 ? 'col--zero' : ''}`}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: i * 0.018, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              style={{ height: `${Math.max(3, (n / chartMax) * 100)}%` }}
              title={`${n}`}
            />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span className="mono">-30 дн</span>
          <span className="mono">сегодня</span>
        </div>
      </Panel>
    </div>
  );
}
