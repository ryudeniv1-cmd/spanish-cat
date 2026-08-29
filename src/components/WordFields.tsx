// Дополнительные поля карточки: аккордеоны, свёрнутые по умолчанию.
// Всё необязательное — ни на «Выучил», ни на пороги клинков, ни на статистику
// эти поля не влияют. Пустое сюда вводить можно, в хранилище оно не уедет:
// нормализация живёт в src/storage/worddata.ts.
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { Pos } from '../data/words';
import {
  FIELD_BLOCKS,
  GENDER_LABEL,
  REGISTER_LABEL,
  THEMES,
  VERB_FORM_LABEL,
  VERB_FORM_PLACEHOLDER,
  VERB_LABEL,
} from '../logic/wordfields';
import {
  GENDERS,
  LIMITS,
  REGISTERS,
  VERB_EXCLUSIVE,
  VERB_FLAGS,
  VerbFlag,
  WordExtras,
} from '../storage/worddata';

interface Props {
  pos: Pos;
  value: WordExtras;
  /** Наверх уходит только изменённое поле: карточку собирает WordCard,
      иначе два поля, отредактированные в одном кадре, затирали бы друг друга. */
  onPatch(patch: WordExtras): void;
  open: string[];
  onToggle(key: string): void;
}

export function WordFields({ pos, value, onPatch: set, open, onToggle }: Props) {
  const body: Record<string, ReactNode> = {
    gram: <Grammar pos={pos} value={value} set={set} />,
    co: (
      <StringList
        items={value.co ?? []}
        limit={LIMITS.co}
        placeholders={['hacer caso', 'tener ganas']}
        onChange={(co) => set({ co })}
      />
    ),
    rt: (
      <PairList
        items={value.rt ?? []}
        limit={LIMITS.rt}
        placeholders={['el trabajo', 'работа']}
        onChange={(rt) => set({ rt })}
      />
    ),
    mn: (
      <StringList
        items={value.mn ?? []}
        limit={LIMITS.mn}
        numbered
        placeholders={['нести', 'носить одежду', 'везти']}
        onChange={(mn) => set({ mn })}
      />
    ),
    syn: (
      <>
        <Field label="Синонимы">
          <input
            className="input"
            value={value.sy ?? ''}
            placeholder="через запятую"
            onChange={(e) => set({ sy: e.target.value })}
          />
        </Field>
        <Field label="Антонимы">
          <input
            className="input"
            value={value.an ?? ''}
            placeholder="через запятую"
            onChange={(e) => set({ an: e.target.value })}
          />
        </Field>
      </>
    ),
    cf: (
      <PairList
        items={value.cf ?? []}
        limit={LIMITS.cf}
        placeholders={['traer', 'движение к говорящему']}
        onChange={(cf) => set({ cf })}
      />
    ),
    ff: (
      <>
        <label className="check-row">
          <input
            type="checkbox"
            className="check"
            checked={!!value.ff}
            onChange={(e) => set({ ff: e.target.checked ? 1 : undefined })}
          />
          <span>Ложный друг переводчика</span>
        </label>
        {!!value.ff && (
          <input
            className="input"
            style={{ marginTop: 8 }}
            value={value.fn ?? ''}
            placeholder="embarazada — беременная, а не смущённая"
            onChange={(e) => set({ fn: e.target.value })}
          />
        )}
      </>
    ),
    rg: (
      <>
        <div className="chips chips--wrap">
          {REGISTERS.map((r) => (
            <Chip
              key={r}
              label={REGISTER_LABEL[r]}
              active={value.rg === r}
              onClick={() => set({ rg: value.rg === r ? undefined : r })}
            />
          ))}
        </div>
        <div className="chips chips--wrap" style={{ marginTop: 8 }}>
          <Chip
            label="только Испания"
            active={!!value.sp}
            onClick={() => set({ sp: value.sp ? undefined : 1 })}
          />
        </div>
      </>
    ),
    th: <Themes value={value.th ?? []} onChange={(th) => set({ th })} />,
    nt: (
      <textarea
        className="textarea"
        style={{ minHeight: 86, overflow: 'auto' }}
        rows={3}
        maxLength={600}
        placeholder="мнемоника, где встретил, любая мысль"
        value={value.nt ?? ''}
        onChange={(e) => set({ nt: e.target.value })}
      />
    ),
  };

  return (
    <div className="acc-list">
      {FIELD_BLOCKS.map((block) => {
        const filled = block.filled(value);
        const isOpen = open.includes(block.key);
        return (
          <section key={block.key} className={`acc ${isOpen ? 'acc--open' : ''}`}>
            <button
              type="button"
              className={`acc__head ${filled ? 'acc__head--filled' : ''}`}
              aria-expanded={isOpen}
              onClick={() => onToggle(block.key)}
            >
              <span className="acc__dot" aria-hidden="true" />
              <span className="acc__title">{block.title}</span>
              {filled && <span className="acc__sum">{block.summary(value, pos)}</span>}
              <svg className="acc__chev" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M3 4.5 6 7.5 9 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {isOpen && <div className="acc__body">{body[block.key]}</div>}
          </section>
        );
      })}
    </div>
  );
}

/** Полоса наверху карточки: сегмент на блок, заполненные — акцентом. */
export function FieldsProgress({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="fields-progress" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < filled ? 'on' : ''} />
      ))}
    </div>
  );
}

// --- блок грамматики: содержимое зависит от части речи ---

function Grammar({
  pos,
  value,
  set,
}: {
  pos: Pos;
  value: WordExtras;
  set(patch: WordExtras): void;
}) {
  const toggleFlag = (flag: VerbFlag) => {
    const cur = value.vt ?? '';
    let next: string;
    if (cur.includes(flag)) next = cur.replace(flag, '');
    else if (VERB_EXCLUSIVE.includes(flag)) {
      // правильный и неправильный — взаимоисключающие
      next = VERB_EXCLUSIVE.reduce((s, f) => s.replace(f, ''), cur) + flag;
    } else next = cur + flag;
    set({ vt: next || undefined });
  };

  return (
    <>
      {pos === 'noun' && (
        <>
          <Field label="Род">
            <div className="segmented">
              {GENDERS.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`segmented__btn ${value.g === g ? 'active' : ''}`}
                  onClick={() => set({ g: value.g === g ? undefined : g })}
                >
                  {GENDER_LABEL[g]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Множественное — если нестандартное">
            <input
              className="input"
              value={value.pl ?? ''}
              placeholder="los lápices"
              onChange={(e) => set({ pl: e.target.value })}
            />
          </Field>
        </>
      )}

      {pos === 'verb' && (
        <>
          <Field label="Тип">
            <div className="chips chips--wrap">
              {VERB_FLAGS.map((f) => (
                <Chip
                  key={f}
                  label={VERB_LABEL[f]}
                  active={(value.vt ?? '').includes(f)}
                  onClick={() => toggleFlag(f)}
                />
              ))}
            </div>
          </Field>
          {(value.vt ?? '').includes('i') && (
            <Field label="Ключевые формы">
              <div className="grid-2">
                {VERB_FORM_LABEL.map((label, i) => (
                  <label key={label} className="mini-field">
                    <span className="mono">{label}</span>
                    <input
                      className="input"
                      value={value.vf?.[i] ?? ''}
                      placeholder={VERB_FORM_PLACEHOLDER[i]}
                      onChange={(e) => {
                        const vf = Array.from({ length: LIMITS.vf }, (_, k) => value.vf?.[k] ?? '');
                        vf[i] = e.target.value;
                        set({ vf });
                      }}
                    />
                  </label>
                ))}
              </div>
            </Field>
          )}
        </>
      )}

      {pos === 'adj' && (
        <Field label="Женский род — если нестандартный">
          <input
            className="input"
            value={value.fa ?? ''}
            placeholder="trabajadora"
            onChange={(e) => set({ fa: e.target.value })}
          />
        </Field>
      )}

      <Field label="Управление предлогом">
        <input
          className="input"
          value={value.pr ?? ''}
          placeholder="soñar con, pensar en, acordarse de"
          onChange={(e) => set({ pr: e.target.value })}
        />
      </Field>
    </>
  );
}

// --- мелкие строительные блоки ---

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="acc-field">
      <span className="mono field-label">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className={`chip ${active ? 'active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Список коротких строк с «+ добавить» и удалением строки. */
function StringList({
  items,
  limit,
  placeholders,
  numbered,
  onChange,
}: {
  items: string[];
  limit: number;
  placeholders: string[];
  numbered?: boolean;
  onChange(items: string[]): void;
}) {
  const rows = items.length > 0 ? items : [''];
  return (
    <>
      {rows.map((item, i) => (
        <div key={i} className="list-row">
          {numbered && <span className="mono list-row__n">{i + 1}</span>}
          <input
            className="input"
            value={item}
            placeholder={placeholders[Math.min(i, placeholders.length - 1)]}
            onChange={(e) => {
              const next = [...rows];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <RemoveBtn onClick={() => onChange(rows.filter((_, k) => k !== i))} />
        </div>
      ))}
      {rows.length < limit && (
        <AddBtn onClick={() => onChange([...rows, ''])} />
      )}
    </>
  );
}

/** Список строк из двух полей. */
function PairList({
  items,
  limit,
  placeholders,
  onChange,
}: {
  items: [string, string][];
  limit: number;
  placeholders: [string, string] | string[];
  onChange(items: [string, string][]): void;
}) {
  const rows: [string, string][] = items.length > 0 ? items : [['', '']];
  const edit = (i: number, half: 0 | 1, v: string) => {
    const next = rows.map((p) => [...p] as [string, string]);
    next[i][half] = v;
    onChange(next);
  };
  return (
    <>
      {rows.map((pair, i) => (
        <div key={i} className="list-row">
          <input
            className="input"
            value={pair[0]}
            placeholder={placeholders[0]}
            onChange={(e) => edit(i, 0, e.target.value)}
          />
          <input
            className="input"
            value={pair[1]}
            placeholder={placeholders[1]}
            onChange={(e) => edit(i, 1, e.target.value)}
          />
          <RemoveBtn onClick={() => onChange(rows.filter((_, k) => k !== i))} />
        </div>
      ))}
      {rows.length < limit && <AddBtn onClick={() => onChange([...rows, ['', '']])} />}
    </>
  );
}

function Themes({ value, onChange }: { value: string[]; onChange(v: string[]): void }) {
  const [custom, setCustom] = useState('');
  const own = value.filter((t) => !THEMES.includes(t));
  const toggle = (t: string) =>
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  const addCustom = () => {
    const t = custom.trim();
    if (t && !value.includes(t) && value.length < LIMITS.th) onChange([...value, t]);
    setCustom('');
  };
  return (
    <>
      <div className="chips chips--wrap">
        {[...THEMES, ...own].map((t) => (
          <Chip key={t} label={t} active={value.includes(t)} onClick={() => toggle(t)} />
        ))}
      </div>
      <div className="list-row" style={{ marginTop: 10 }}>
        <input
          className="input"
          value={custom}
          maxLength={24}
          placeholder="своя тема"
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <button type="button" className="btn btn--ghost btn--sm" onClick={addCustom}>
          + тема
        </button>
      </div>
    </>
  );
}

function AddBtn({ onClick }: { onClick(): void }) {
  return (
    <button type="button" className="btn btn--ghost btn--sm add-btn" onClick={onClick}>
      + добавить
    </button>
  );
}

function RemoveBtn({ onClick }: { onClick(): void }) {
  return (
    <button type="button" className="row-x" aria-label="Убрать строку" onClick={onClick}>
      ×
    </button>
  );
}
