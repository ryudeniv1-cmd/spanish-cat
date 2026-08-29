// Карточка слова: перевод + 10 примеров, автосохранение, «Выучил» / «Уже знаю».
// Ниже — необязательные поля в свёрнутых аккордеонах: на «Выучил», пороги
// клинков и статистику они не влияют, обязательны по-прежнему только перевод
// и минимум примеров.
import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore, useStoreVersion } from '../AppContext';
import { POS_RU, WORDS } from '../data/words';
import { Status, dateFromDay } from '../storage/codec';
import { EXAMPLE_SLOTS, ExamplePair, WordExtras, extrasOf } from '../storage/worddata';
import { openBlocks, setOpenBlocks } from '../logic/cardOpen';
import { FIELD_BLOCKS, filledBlocks } from '../logic/wordfields';
import { haptic, onTelegramBack, showConfirm } from '../telegram';
import { LevelBadge, SaveIndicator, STATUS_RU } from '../components/badges';
import { ExampleRing } from '../components/ExampleRing';
import { Panel } from '../components/Panel';
import { FieldsProgress, WordFields } from '../components/WordFields';

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
  const [extras, setExtras] = useState<WordExtras>({});
  const [open, setOpen] = useState<string[]>(() => openBlocks(id));
  const dirty = useRef(false);
  const latest = useRef({ translation, pairs, extras });
  latest.current = { translation, pairs, extras };

  const goBack = useCallback(() => navigate(-1), [navigate]);
  useEffect(() => onTelegramBack(goBack), [goBack]);

  // загрузка карточки (лениво из корзины)
  useEffect(() => {
    let alive = true;
    void store.buckets.getWord(id).then((d) => {
      if (!alive) return;
      setPairs(padPairs(d.e ?? []));
      setExtras(extrasOf(d));
    });
    return () => {
      alive = false;
    };
  }, [store, id]);

  const save = useCallback(() => {
    const { translation: t, pairs: p, extras: x } = latest.current;
    if (!dirty.current || p === null) return;
    dirty.current = false;
    void store.saveCard(id, t, p, x);
  }, [store, id]);

  // автосохранение с debounce ~700 мс
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(save, 700);
    return () => clearTimeout(timer);
  }, [translation, pairs, extras, save]);

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

      {/* слово вырастает из размера строки списка — карточка «раскрывается» */}
      <motion.div
        className="card-word es-word"
        style={{ transformOrigin: 'left center' }}
        initial={{ opacity: 0, scale: 0.34, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
      >
        {word.word}
      </motion.div>
      <FieldsProgress filled={filledBlocks(extras)} total={FIELD_BLOCKS.length} />
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

      <Panel title="Перевод на русский" order={0}>
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
        order={1}
        title="Примеры"
        aside={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span className="mono">мин. {min}</span>
            <ExampleRing filled={filled} hasTr={translation.trim().length > 0} size={38} />
          </span>
        }
      >
        {pairs === null ? (
          <div className="empty-note">Загрузка…</div>
        ) : (
          pairs.map((p, i) => (
            <div key={i} className={`example-block ${p[0].trim() ? 'example-block--filled' : ''}`}>
              <span className="mono example-block__n" aria-label={`Пример ${i + 1}`}>
                {i + 1}
              </span>
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

      <WordFields
        pos={word.pos}
        value={extras}
        open={open}
        onPatch={(patch) => {
          dirty.current = true;
          setExtras((prev) => ({ ...prev, ...patch }));
        }}
        onToggle={(key) => {
          haptic('tap');
          setOpen((prev) => {
            const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
            setOpenBlocks(id, next);
            return next;
          });
        }}
      />

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
