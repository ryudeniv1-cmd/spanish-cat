// Режим повторения: по одному слову, русский перевод -> «Показать ответ» ->
// «Вспомнил» / «Не вспомнил». «Не вспомнил» возвращает слово в конец сессии.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../AppContext';
import { WORDS } from '../data/words';
import { ExamplePair } from '../storage/codec';
import { haptic, onTelegramBack } from '../telegram';
import { LevelBadge } from '../components/badges';
import { Panel } from '../components/Panel';
import { warpStarfield } from '../components/Background';

export function Review() {
  const store = useAppStore();
  const navigate = useNavigate();

  const [session] = useState<number[]>(() => store.dueList());
  const [queue, setQueue] = useState<number[]>(session);
  const [done, setDone] = useState(0);
  const failed = useRef(new Set<number>());
  const [revealed, setRevealed] = useState(false);
  const [flip, setFlip] = useState<'none' | 'out' | 'in'>('none');
  const [input, setInput] = useState('');
  const [examples, setExamples] = useState<ExamplePair[] | null>(null);
  const [anim, setAnim] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const goHome = useCallback(() => navigate('/'), [navigate]);
  useEffect(() => onTelegramBack(goHome), [goHome]);
  useEffect(() => warpStarfield(), []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const current = queue[0];
  const word = current !== undefined ? WORDS[current] : null;
  const translation = current !== undefined ? store.translation(current) : '';

  const reveal = async () => {
    if (current === undefined) return;
    haptic('tap');
    const pairs = await store.buckets.getExamples(current);
    setExamples(pairs.filter((p) => p[0].trim()));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setRevealed(true);
      return;
    }
    setFlip('out');
    timers.current.push(
      setTimeout(() => {
        setRevealed(true);
        setFlip('in'); // мгновенно на +90°, без перехода
        // два кадра, чтобы браузер успел отрисовать +90° до возврата в 0
        requestAnimationFrame(() => requestAnimationFrame(() => setFlip('none')));
      }, 170),
    );
  };

  const advance = (removeCurrent: boolean) => {
    setQueue((q) => {
      const [head, ...rest] = q;
      return removeCurrent ? rest : [...rest, head];
    });
    setRevealed(false);
    setFlip('none');
    setInput('');
    setExamples(null);
  };

  const onRemembered = () => {
    if (current === undefined) return;
    haptic('remembered');
    if (!failed.current.has(current)) store.reviewRemembered(current);
    setDone((d) => d + 1);
    setAnim('wave-pulse');
    timers.current.push(
      setTimeout(() => {
        setAnim('');
        advance(true);
      }, 220),
    );
  };

  const onForgot = () => {
    if (current === undefined) return;
    haptic('forgot');
    if (!failed.current.has(current)) {
      store.reviewForgot(current);
      failed.current.add(current);
    }
    setAnim('flash-amber');
    timers.current.push(
      setTimeout(() => {
        setAnim('');
        advance(false);
      }, 260),
    );
  };

  if (session.length === 0 || queue.length === 0) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 60 }}>
        <h1 className="screen-title">Повторение закончено</h1>
        <p className="empty-note">
          {session.length === 0 ? 'Сегодня повторять нечего.' : `Пройдено слов: ${session.length}.`}
        </p>
        <button type="button" className="btn btn--primary" onClick={goHome}>
          На главный
        </button>
      </div>
    );
  }

  const match =
    input.trim().length > 0 && word
      ? input.trim().toLowerCase() === word.word.toLowerCase()
      : null;

  return (
    <div>
      <div className="topbar" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="back-btn" onClick={goHome}>
          ← Today
        </button>
        <span className="mono">
          {Math.min(done + 1, session.length)} из {session.length}
        </span>
      </div>

      <div className="review-stage">
        <div className={`review-card ${flip === 'none' ? '' : `review-card--${flip}`} ${anim}`}>
          {!revealed ? (
            <Panel title="Вспомни слово" animated={false}>
              <div className="review-translation">{translation || '— перевод не записан —'}</div>
              <label className="mono field-label" htmlFor="rev-input">
                Напиши по-испански (необязательно)
              </label>
              <input
                id="rev-input"
                className="input"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <div style={{ marginTop: 14 }}>
                <button type="button" className="btn btn--primary btn--block" onClick={() => void reveal()}>
                  Показать ответ
                </button>
              </div>
            </Panel>
          ) : (
            <div className="sheen">
              <Panel
                animated={false}
                title={
                  <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                    Ответ <LevelBadge level={word!.level} />
                  </span>
                }
              >
                <div className="card-word es-word" style={{ fontSize: 38, margin: '2px 0 8px' }}>
                  {word!.word}
                </div>
                {input.trim().length > 0 && (
                  <input
                    className={`input ${match ? 'input--match' : 'input--miss'}`}
                    value={input}
                    readOnly
                    style={{ marginBottom: 12 }}
                  />
                )}
                <div className="review-translation" style={{ fontSize: 18, margin: '0 0 14px' }}>
                  {translation}
                </div>
                {examples && examples.length > 0 ? (
                  examples.map((p, i) => (
                    <div key={i} className="review-example">
                      <div className="es">{p[0]}</div>
                      {p[1].trim() && <div className="ru">{p[1]}</div>}
                    </div>
                  ))
                ) : (
                  <div className="empty-note">Примеров нет</div>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button type="button" className="btn btn--amber" style={{ flex: 1 }} onClick={onForgot}>
                    Не вспомнил
                  </button>
                  <button type="button" className="btn btn--primary" style={{ flex: 1 }} onClick={onRemembered}>
                    Вспомнил
                  </button>
                </div>
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
