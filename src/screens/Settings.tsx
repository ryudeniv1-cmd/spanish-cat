// Settings: настройки, Telegram ID, занятость хранилища, экспорт / импорт.
import { useEffect, useState } from 'react';
import { useAppStore, useStoreVersion } from '../AppContext';
import { copyText, showConfirm, telegramUserId } from '../telegram';
import { Panel } from '../components/Panel';

const CAPACITY = 1024 * 4096;

export function Settings() {
  const store = useAppStore();
  useStoreVersion();

  const [usage, setUsage] = useState<{ usedChars: number; keys: number } | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void store.storageUsage().then((u) => {
      if (alive) setUsage(u);
    });
    return () => {
      alive = false;
    };
  }, [store]);

  const userId = telegramUserId();
  const usedPct = usage ? Math.min(100, (usage.usedChars / CAPACITY) * 100) : 0;
  const fmtMb = (chars: number) => (chars / 1024 / 1024).toFixed(2).replace('.', ',');

  const doExport = async () => {
    setBusy(true);
    setErr(null);
    try {
      const json = await store.exportJson();
      setExportText(json);
      const date = new Date().toISOString().slice(0, 10);
      try {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spanish-export-${date}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        setNote('Файл сформирован. Если скачивание не началось — скопируй JSON из поля ниже.');
      } catch {
        setNote('Скачивание недоступно — скопируй JSON из поля ниже.');
      }
    } catch (e) {
      setErr(`Не удалось сформировать экспорт: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setErr(null);
    setNote(null);
    if (!importText.trim()) {
      setErr('Вставь JSON экспорта в поле выше.');
      return;
    }
    const ok = await showConfirm('Импорт перезапишет все текущие данные. Продолжить?');
    if (!ok) return;
    setBusy(true);
    try {
      await store.importJson(importText);
      setImportText('');
      setNote('Данные восстановлены из экспорта.');
      void store.storageUsage().then(setUsage);
    } catch (e) {
      setErr(`Импорт не выполнен: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="screen-title">Settings</h1>

      <Panel title="Обучение" order={0}>
        <div className="setting-row">
          <label htmlFor="npd">Новых слов в день</label>
          <input
            id="npd"
            className="input num-input"
            type="number"
            min={1}
            max={50}
            value={store.meta.new_per_day}
            onChange={(e) => store.setSettings({ new_per_day: Number(e.target.value) })}
          />
        </div>
        <div className="setting-row">
          <label htmlFor="ms">Минимум примеров для «Выучил»</label>
          <input
            id="ms"
            className="input num-input"
            type="number"
            min={0}
            max={10}
            value={store.meta.min_sentences}
            onChange={(e) => store.setSettings({ min_sentences: Number(e.target.value) })}
          />
        </div>
      </Panel>

      <Panel title="Твой Telegram ID" order={1}>
        <div className="setting-row">
          <span className="mono" style={{ fontSize: 15 }}>
            {userId ?? '—'}
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={userId === null}
            onClick={() =>
              void copyText(String(userId)).then((ok) =>
                setNote(ok ? 'ID скопирован.' : 'Не удалось скопировать.'),
              )
            }
          >
            Скопировать
          </button>
        </div>
        <p className="mono" style={{ textTransform: 'none', letterSpacing: 0.3 }}>
          Время напоминания задаётся в файле reminder.yml — см. README.
        </p>
      </Panel>

      <Panel title="Хранилище" order={2}>
        {usage === null ? (
          <div className="empty-note">Измеряю…</div>
        ) : (
          <>
            <div className="usage-bar">
              <div style={{ width: `${usedPct}%` }} />
            </div>
            <span className="mono">
              использовано {fmtMb(usage.usedChars)} МБ из 4 МБ · ключей {usage.keys} / 1024
            </span>
            {usedPct > 85 && (
              <p className="warn">
                Хранилище почти заполнено. Сделай экспорт данных — это твоя резервная копия.
              </p>
            )}
          </>
        )}
      </Panel>

      <Panel title="Экспорт данных" order={3}>
        <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={() => void doExport()}>
          Сформировать экспорт
        </button>
        {exportText !== null && (
          <div style={{ marginTop: 10 }}>
            <textarea
              className="textarea"
              style={{ minHeight: 90, overflow: 'auto' }}
              readOnly
              value={exportText}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ marginTop: 6 }}
              onClick={() =>
                void copyText(exportText).then((ok) =>
                  setNote(ok ? 'JSON скопирован.' : 'Не удалось скопировать — выдели текст вручную.'),
                )
              }
            >
              Скопировать JSON
            </button>
          </div>
        )}
      </Panel>

      <Panel title="Импорт данных" order={4}>
        <textarea
          className="textarea"
          style={{ minHeight: 90, overflow: 'auto' }}
          placeholder="Вставь сюда JSON экспорта…"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        <button
          type="button"
          className="btn btn--danger btn--block"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() => void doImport()}
        >
          Восстановить из экспорта
        </button>
      </Panel>

      {note && <p className="mono" style={{ textTransform: 'none' }}>{note}</p>}
      {err && <p className="error-text">{err}</p>}
    </div>
  );
}
