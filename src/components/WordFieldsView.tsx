// Заполненные поля карточки в сжатом виде — то, ради чего их и заполняют:
// на повторении после «Показать ответ». Пустые блоки не показываются вовсе.
import type { ReactNode } from 'react';
import type { Pos } from '../data/words';
import {
  GENDER_LABEL,
  REGISTER_LABEL,
  VERB_FORM_LABEL,
  VERB_LABEL,
} from '../logic/wordfields';
import type { WordData } from '../storage/worddata';

export function WordFieldsView({ data, pos }: { data: WordData; pos: Pos }) {
  const rows: ReactNode[] = [];
  const add = (key: string, label: string, value: ReactNode) =>
    rows.push(
      <div className="fv-row" key={key}>
        <span className="mono fv-label">{label}</span>
        <div className="fv-value">{value}</div>
      </div>,
    );

  // грамматика — одной строкой, что заполнено
  const gram: string[] = [];
  if (pos === 'noun') {
    if (data.g) gram.push(GENDER_LABEL[data.g]);
    if (data.pl) gram.push(`мн. ${data.pl}`);
  }
  if (pos === 'verb' && data.vt) {
    gram.push(
      data.vt
        .split('')
        .map((f) => VERB_LABEL[f])
        .filter(Boolean)
        .join(', '),
    );
  }
  if (pos === 'adj' && data.fa) gram.push(`ж. р. ${data.fa}`);
  if (data.pr) gram.push(data.pr);
  if (gram.length > 0) add('gram', 'грамматика', gram.join(' · '));

  if (data.vf?.some((f) => f.trim())) {
    add(
      'vf',
      'формы',
      <span className="fv-forms">
        {data.vf.map((f, i) =>
          f.trim() ? (
            <span key={i}>
              <i className="mono">{VERB_FORM_LABEL[i]}</i> {f}
            </span>
          ) : null,
        )}
      </span>,
    );
  }

  if (data.mn?.length) {
    add(
      'mn',
      'значения',
      <ol className="fv-num">
        {data.mn.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ol>,
    );
  }

  if (data.co?.length) add('co', 'сочетания', <span className="es">{data.co.join(' · ')}</span>);

  if (data.rt?.length) {
    add(
      'rt',
      'однокоренные',
      data.rt.map((p, i) => (
        <div key={i}>
          <span className="es">{p[0]}</span>
          {p[1] && <span className="fv-dim"> — {p[1]}</span>}
        </div>
      )),
    );
  }

  if (data.sy) add('sy', 'синонимы', data.sy);
  if (data.an) add('an', 'антонимы', data.an);

  if (data.cf?.length) {
    add(
      'cf',
      'не путать',
      data.cf.map((p, i) => (
        <div key={i}>
          <span className="es">{p[0]}</span>
          {p[1] && <span className="fv-dim"> — {p[1]}</span>}
        </div>
      )),
    );
  }

  if (data.ff) {
    add(
      'ff',
      'ложный друг',
      <>
        <span className="fv-warn">да</span>
        {data.fn && <span> · {data.fn}</span>}
      </>,
    );
  }

  if (data.rg || data.sp) {
    add(
      'rg',
      'регистр',
      [data.rg && REGISTER_LABEL[data.rg], data.sp && 'только Испания'].filter(Boolean).join(' · '),
    );
  }

  if (data.th?.length) {
    add(
      'th',
      'темы',
      <span className="fv-tags">
        {data.th.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </span>,
    );
  }

  if (data.nt) add('nt', 'заметка', <span className="fv-note">{data.nt}</span>);

  if (rows.length === 0) return null;
  return <div className="fields-view">{rows}</div>;
}
