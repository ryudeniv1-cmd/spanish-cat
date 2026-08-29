// Карточка слова: перевод + 10 примеров, автосохранение, «Выучил» / «Уже знаю».
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore, useStoreVersion } from '../AppContext';
import { POS_RU, WORDS } from '../data/words';
import { ExamplePair, Status, dateFromDay } from '../storage/codec';
import { haptic, onTelegramBack, showConfirm } from '../telegram';
import { LevelBadge, SaveIndicator, STATUS_RU } from '../components/badges';
import { Panel } from '../components/Panel';

const EXAMPLE_SLOTS = 10;
const MAX_FIELD = 250;

function padPairs(pairs: ExamplePair[]): ExamplePair[] {
  const out = pairs.slice(0, EXAMPLE_SLOTS).map((p) => [p[0] ?? '', p[1] ?? ''] as ExamplePair);
  while (out.length < EXAMPLE_SLOTS) out.push(['', '']);
  return out;
}

function autoResize(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export function WordCard() {
  const params = useParams();
  const id = Number(params.id);
  const word = WORDS[id];
  const store = useAppStore();
  useStoreVersion();
  const navigate = useNavigate();

  const status = store.status(id);
  const [translation, setTranslation] = useState(() => store.translation(id));
  const [pairs, setPairs] = useState<ExamplePair[] | null>(null);
  const dirty = useRef(false);
  const latest = useRef({ translation, pairs });
  latest.current = { translation, pairs };

  const goBack = useCallback(() => navigate(-1), [navigate]);
  useEffect(() => onTelegramBack(goBack), [goBack]);

  // загрузка примеров (лениво из корзины)
  useEffect(() => {
    let alive = true;
    void store.buckets.getExamples(id).then((p) => {
      if (alive) setPairs(padPairs(p));
    });
    return () => {
      alive = false;
    };
  }, [store, id]);

  const save = useCallback(() => {
    const { translation: t, pairs: p } = latest.current;
    if (!dirty.current || p === null) return;
    dirty.current = false;
    void store.saveCard(id, t, p);
  }, [store, id]);

  // автосохранение с debounce ~700 мс
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(save, 700);
    return () => clearTimeout(timer);
  }, [translation, pairs, save]);

  // уход с экрана — сохранить черновик немедленно
  useEffect(
    () => () => {
      save();
      void store.queue.flushNow();
    },
    [save, store],
  );

  if (!word) {
    return (
      <div>
        <button type="button" className="back-btn" onClick={goBack}>
          ← Назад
        </button>
        <p className="empty-note">Слово не найдено</p>
      </div>
    );
  }

  const filled = pairs?.filter((p) => p[0].trim()).length ?? 0;
  const min = store.meta.min_sentences;
  const canLearn = translation.trim().length > 0 && filled >= min && pairs !== null;
  const srs = store.srsOf(id);

  const onLearned = () => {
    dirty.current = true;
    save();
    haptic('learned');
    store.markLearned(id);
    navigate('/');
  };

  const onAlreadyKnown = () => {
    haptic('tap');
    store.markAlreadyKnown(id);
    navigate('/');
  };

  const onDemote = async () => {
    if (await showConfirm('Снять слово со всех повторений?')) {
      store.demoteToKnown(id);
      goBack();
    }
  };

  return (
    <div>
      <div className="topbar" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="back-btn" onClick={goBack}>
          ← Назад
        </button>
        <SaveIndicator status={store.saveStatus} />
      </div>

      <div className="card-word es-word">{word.word}</div>
      <div className="card-meta">
        <LevelBadge level={word.level} />
        <span className="mono">ранг {word.rank}</span>
        <span className="mono">{POS_RU[word.pos]}</span>
        <span className="mono">{STATUS_RU[status]}</span>
        {status === Status.Review && srs && (
          <span className="mono">
            повтор {dateFromDay(srs.next).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
          </span>
        )}
      </div>

      <Panel title="Перевод на русский">
        <input
          className="input"
          value={translation}
          maxLength={300}
          placeholder="Напиши перевод…"
          onChange={(e) => {
            dirty.current = true;
            setTranslation(e.target.value);
          }}
        />
      </Panel>

      <Panel
        title="Примеры"
        aside={
          <span className="mono">
            {filled}/10 · мин. {min}
          </span>
        }
      >
        {pairs === null ? (
          <div className="empty-note">Загрузка…</div>
        ) : (
          pairs.map((p, i) => (
            <div key={i} className="example-block">
              <span className="mono field-label">Пример {i + 1}</span>
              <textarea
                className="textarea"
                rows={1}
                maxLength={MAX_FIELD}
                placeholder="По-испански"
                value={p[0]}
                ref={autoResize}
                onChange={(e) => {
                  dirty.current = true;
                  autoResize(e.target);
                  setPairs((prev) => {
                    const next = prev!.map((x) => [...x] as ExamplePair);
                    next[i][0] = e.target.value;
                    return next;
                  });
                }}
              />
              <textarea
                className="textarea"
                rows={1}
                maxLength={MAX_FIELD}
                placeholder="Перевод"
                value={p[1]}
                ref={autoResize}
                onChange={(e) => {
                  dirty.current = true;
                  autoResize(e.target);
                  setPairs((prev) => {
                    const next = prev!.map((x) => [...x] as ExamplePair);
                    next[i][1] = e.target.value;
                    return next;
                  });
                }}
              />
            </div>
          ))
        )}
      </Panel>

      {status === Status.Learning && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={!canLearn}
            onClick={onLearned}
          >
            Выучил
          </button>
          {!canLearn && (
            <span className="mono" style={{ textAlign: 'center' }}>
              нужен перевод и минимум {min} примеров
            </span>
          )}
          <button type="button" className="btn btn--ghost-dim btn--block" onClick={onAlreadyKnown}>
            Уже знаю
          </button>
        </div>
      )}

      {(status === Status.Review || status === Status.Mastered) && (
        <button type="button" className="btn btn--danger btn--block" onClick={() => void onDemote()}>
          Отметить как «Знаю» — снять с повторений
        </button>
      )}
    </div>
  );
}
