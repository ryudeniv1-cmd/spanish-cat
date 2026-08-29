// Центральное состояние приложения поверх слоя хранения.
import { setSoundEnabled } from './audio';
import { LEVELS, Level, LEVEL_BOUNDS } from './data/words';
import type { StorageAdapter } from './storage/adapter';
import { buildExport, validateExport, writeImport } from './storage/backup';
import {
  SRS_MAX_CHARS,
  SrsRec,
  Status,
  StatusValue,
  TOTAL_WORDS,
  TR_MAX_CHARS,
  localDateString,
  packSrs,
  packStatuses,
  packTr,
  parseIx,
  parseSrs,
  parseStatuses,
  parseTr,
  todayDay,
} from './storage/codec';
import { DEFAULT_META, MetaData, packMeta, parseMeta } from './storage/meta';
import {
  ExamplePair,
  WordData,
  WordExtras,
  isEmptyWordData,
  normalizeWordData,
} from './storage/worddata';
import { BucketStore, ChunkStore } from './storage/persist';
import { SaveQueue, SaveStatus } from './storage/queue';
import { computeRefill } from './logic/refill';
import { dueIds, forgot, newlyLearned, remembered } from './logic/srs';

export interface LevelStats {
  level: Level;
  total: number;
  known: number;
  learned: number; // review + mastered
  mastered: number;
  learning: number;
  fresh: number; // new
}

export class AppStore {
  statuses: Uint8Array = new Uint8Array(TOTAL_WORDS);
  meta: MetaData = { ...DEFAULT_META };
  ready = false;
  /** Все корзины карточек подняты в память (см. loadAllCards). */
  cardsLoaded = false;
  saveStatus: SaveStatus = 'saved';
  lastLearnedId: number | null = null;
  lastLearnedAt = 0;

  private tr!: ChunkStore<string>;
  private srsStore!: ChunkStore<SrsRec>;
  buckets!: BucketStore;
  queue!: SaveQueue;

  private version = 0;
  private listeners = new Set<() => void>();

  constructor(private adapter: StorageAdapter) {}

  // --- подписка для useSyncExternalStore ---
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getVersion = (): number => this.version;
  private emit(): void {
    this.version++;
    this.listeners.forEach((cb) => cb());
  }

  // --- загрузка ---
  async init(): Promise<void> {
    this.queue = new SaveQueue(this.adapter);
    this.queue.onStatus((s) => {
      this.saveStatus = s;
      this.emit();
    });
    const keys = await this.adapter.getKeys();
    const base = ['st_0', 'st_1', 'meta', 'ix_0', 'ix_1', 'ix_2'];
    const wanted = [...new Set([...base, ...keys.filter((k) => !k.startsWith('d_'))])];
    const values = await this.adapter.getItems(wanted);

    this.statuses = parseStatuses(values['st_0'] ?? null, values['st_1'] ?? null);
    this.meta = parseMeta(values['meta'] ?? null);
    setSoundEnabled(this.meta.sound_on);

    const write = (k: string, v: string | null) => this.queue.set(k, v);
    this.tr = new ChunkStore<string>('tr', packTr, TR_MAX_CHARS, write);
    this.srsStore = new ChunkStore<SrsRec>('srs', packSrs, SRS_MAX_CHARS, write);
    const trParsed = new Map<number, [number, string][]>();
    const srsParsed = new Map<number, [number, SrsRec][]>();
    for (const [k, v] of Object.entries(values)) {
      if (!v) continue;
      if (k.startsWith('tr_')) trParsed.set(Number(k.slice(3)), parseTr(v));
      else if (k.startsWith('srs_')) srsParsed.set(Number(k.slice(4)), parseSrs(v));
    }
    this.tr.load(trParsed);
    this.srsStore.load(srsParsed);

    this.buckets = new BucketStore(this.adapter, write);
    this.buckets.loadIx(parseIx([values['ix_0'] ?? null, values['ix_1'] ?? null, values['ix_2'] ?? null]));

    this.dailyRefill();
    this.ready = true;
    this.emit();
  }

  private persistStatuses(): void {
    const [a, b] = packStatuses(this.statuses);
    this.queue.set('st_0', a);
    this.queue.set('st_1', b);
  }
  private persistMeta(): void {
    this.queue.set('meta', packMeta(this.meta));
  }

  /** Пополнение очереди — один раз в календарный день (ТЗ, раздел 5). */
  dailyRefill(): void {
    const today = localDateString();
    if (this.meta.last_refill_date === today) return;
    const ids = computeRefill(this.statuses, this.meta.new_per_day);
    for (const id of ids) this.statuses[id] = Status.Learning;
    this.meta.last_refill_date = today;
    if (ids.length > 0) this.persistStatuses();
    this.persistMeta();
    if (this.ready) this.emit();
  }

  // --- чтение ---
  status(id: number): StatusValue {
    return this.statuses[id] as StatusValue;
  }
  translation(id: number): string {
    return this.tr.get(id) ?? '';
  }
  translationEntries(): IterableIterator<[number, string]> {
    return this.tr.entries();
  }
  srsOf(id: number): SrsRec | undefined {
    return this.srsStore.get(id);
  }
  srsEntries(): IterableIterator<[number, SrsRec]> {
    return this.srsStore.entries();
  }

  queueIds(): number[] {
    const out: number[] = [];
    for (let id = 0; id < TOTAL_WORDS; id++) {
      if (this.statuses[id] === Status.Learning) out.push(id);
    }
    return out;
  }

  dueList(): number[] {
    const map = new Map<number, SrsRec>();
    for (const [id, rec] of this.srsStore.entries()) map.set(id, rec);
    return dueIds(map, this.statuses, todayDay());
  }

  levelStats(): LevelStats[] {
    return LEVELS.map((level) => {
      const [from, to] = LEVEL_BOUNDS[level];
      const s: LevelStats = {
        level,
        total: to - from,
        known: 0,
        learned: 0,
        mastered: 0,
        learning: 0,
        fresh: 0,
      };
      for (let id = from; id < to; id++) {
        const st = this.statuses[id];
        if (st === Status.Known) s.known++;
        else if (st === Status.Learning) s.learning++;
        else if (st === Status.Review) s.learned++;
        else if (st === Status.Mastered) {
          s.learned++;
          s.mastered++;
        } else s.fresh++;
      }
      return s;
    });
  }

  /** Текущий сектор — уровень, из которого берутся новые слова. */
  currentLevel(): Level {
    for (let id = 0; id < TOTAL_WORDS; id++) {
      if (this.statuses[id] === Status.New) {
        for (const level of LEVELS) {
          const [from, to] = LEVEL_BOUNDS[level];
          if (id >= from && id < to) return level;
        }
      }
    }
    return 'C1';
  }

  /** Выучено слов по дням за последние 30 дней (по дате «Выучил»). */
  learnedByDay(days = 30): number[] {
    const today = todayDay();
    const out = new Array<number>(days).fill(0);
    for (const [id, rec] of this.srsStore.entries()) {
      const st = this.statuses[id];
      if (st !== Status.Review && st !== Status.Mastered) continue;
      const offset = today - rec.learned;
      if (offset >= 0 && offset < days) out[days - 1 - offset]++;
    }
    return out;
  }

  // --- мутации ---
  toggleKnown(id: number): void {
    const st = this.statuses[id];
    if (st === Status.New) this.statuses[id] = Status.Known;
    else if (st === Status.Known) this.statuses[id] = Status.New;
    else return;
    this.persistStatuses();
    this.emit();
  }

  /** «+ Учить» из архива — сверх дневной нормы. */
  addToQueue(id: number): void {
    if (this.statuses[id] !== Status.New) return;
    this.statuses[id] = Status.Learning;
    this.persistStatuses();
    this.emit();
  }

  /** Автосохранение карточки: перевод + примеры + дополнительные поля.
      Что пусто — в хранилище не попадает: за этим следит normalizeWordData. */
  async saveCard(
    id: number,
    translation: string,
    pairs: ExamplePair[],
    extras: WordExtras = {},
  ): Promise<void> {
    const t = translation.trim();
    if (t) this.tr.set(id, t.slice(0, 300));
    else if (this.tr.has(id)) this.tr.delete(id);

    const data = normalizeWordData({ ...extras, e: pairs });
    const oldCount = (this.buckets.getCachedExamples(id) ?? []).filter((p) => p[0].trim()).length;
    const newCount = (data.e ?? []).filter((p) => p[0].trim()).length;
    await this.buckets.setWord(id, data);
    if (newCount !== oldCount) {
      this.meta.sentences_total = Math.max(0, this.meta.sentences_total + newCount - oldCount);
      this.persistMeta();
    }
    this.emit();
  }

  /** Карточка из памяти: {} — не заполнена или корзина ещё не подгружена. */
  wordData(id: number): WordData {
    return this.buckets.getCachedWord(id) ?? {};
  }

  /**
   * Подтягивает все корзины разом — нужно там, где данные карточек читаются
   * скопом (фильтры и поиск Lexicon). Загрузка одна на сессию.
   */
  async loadAllCards(): Promise<void> {
    if (this.cardsLoaded) return;
    await this.buckets.loadAll();
    this.cardsLoaded = true;
    this.emit();
  }

  /** Карточки со всеми заполненными полями — для фильтров и поиска. */
  *cardEntries(): IterableIterator<[number, WordData]> {
    for (let id = 0; id < TOTAL_WORDS; id++) {
      const d = this.buckets.getCachedWord(id);
      if (d && !isEmptyWordData(d)) yield [id, d];
    }
  }

  /** «Выучил»: статус review, первое повторение завтра. */
  markLearned(id: number): void {
    this.statuses[id] = Status.Review;
    this.srsStore.set(id, newlyLearned(todayDay()));
    this.persistStatuses();
    this.lastLearnedId = id;
    this.lastLearnedAt = Date.now();
    this.emit();
  }

  /** «Уже знаю» в карточке (learning -> known). */
  markAlreadyKnown(id: number): void {
    this.statuses[id] = Status.Known;
    if (this.srsStore.has(id)) this.srsStore.delete(id);
    this.persistStatuses();
    this.emit();
  }

  /** Снять слово со всех повторений (review/mastered -> known, с подтверждением в UI). */
  demoteToKnown(id: number): void {
    this.statuses[id] = Status.Known;
    this.srsStore.delete(id);
    this.persistStatuses();
    this.emit();
  }

  /** «Вспомнил» (без предыдущего «Не вспомнил» в этой сессии). */
  reviewRemembered(id: number): void {
    const rec = this.srsStore.get(id);
    if (!rec) return;
    const r = remembered(rec, todayDay());
    this.srsStore.set(id, r.rec);
    if (r.mastered) {
      this.statuses[id] = Status.Mastered;
      this.persistStatuses();
    }
    this.emit();
  }

  /** «Не вспомнил»: шаг 0, повтор завтра. */
  reviewForgot(id: number): void {
    const rec = this.srsStore.get(id);
    if (!rec) return;
    this.srsStore.set(id, forgot(rec, todayDay()));
    this.emit();
  }

  /** Выучено сегодня — прогресс дневной нормы. */
  learnedToday(): number {
    return this.learnedByDay(1)[0];
  }

  /** Дней подряд с выполненной нормой. Сегодня, пока норма не набрана,
      серию не обрывает — отсчёт просто начинается со вчера. */
  streakDays(): number {
    const norm = Math.max(1, this.meta.new_per_day);
    const byDay = this.learnedByDay(90); // последний элемент — сегодня
    let n = 0;
    for (let i = byDay.length - 1; i >= 0; i--) {
      if (byDay[i] >= norm) n++;
      else if (i === byDay.length - 1) continue;
      else break;
    }
    return n;
  }

  /** Всего выучено (статусы «Повторяю» + «Освоено») — открывает клинки. */
  learnedCount(): number {
    let n = 0;
    for (let id = 0; id < TOTAL_WORDS; id++) {
      const st = this.statuses[id];
      if (st === Status.Review || st === Status.Mastered) n++;
    }
    return n;
  }

  /** Уровни, пройденные целиком: каждое слово «Знаю», «Повторяю» или «Освоено». */
  completedLevels(): Level[] {
    return this.levelStats()
      .filter((s) => s.learning === 0 && s.fresh === 0)
      .map((s) => s.level);
  }

  equipBlade(id: string): void {
    this.meta.equipped_blade = id;
    this.persistMeta();
    this.emit();
  }

  /** Персонаж на экране Today; '' — убрать. */
  equipCharacter(id: string): void {
    this.meta.equipped_character = id;
    this.persistMeta();
    this.emit();
  }

  setSoundOn(on: boolean): void {
    this.meta.sound_on = on;
    setSoundEnabled(on);
    this.persistMeta();
    this.emit();
  }

  markBladesSeen(count: number): void {
    this.meta.blades_seen = count;
    this.persistMeta();
    this.emit();
  }

  setSettings(patch: Partial<Pick<MetaData, 'new_per_day' | 'min_sentences'>>): void {
    if (patch.new_per_day !== undefined)
      this.meta.new_per_day = Math.min(50, Math.max(1, Math.round(patch.new_per_day) || 1));
    if (patch.min_sentences !== undefined)
      this.meta.min_sentences = Math.min(10, Math.max(0, Math.round(patch.min_sentences) || 0));
    this.persistMeta();
    this.emit();
  }

  /** Групповые действия в архиве — только для статусов new/known. */
  markLevel(level: Level, toKnown: boolean): void {
    const [from, to] = LEVEL_BOUNDS[level];
    for (let id = from; id < to; id++) {
      if (toKnown && this.statuses[id] === Status.New) this.statuses[id] = Status.Known;
      else if (!toKnown && this.statuses[id] === Status.Known) this.statuses[id] = Status.New;
    }
    this.persistStatuses();
    this.emit();
  }

  // --- экспорт / импорт / занятость хранилища ---
  async exportJson(): Promise<string> {
    await this.queue.flushNow();
    await this.buckets.loadAll();
    this.cardsLoaded = true;
    const data = buildExport(
      this.meta,
      this.statuses,
      this.tr.entries(),
      this.srsStore.entries(),
      this.cardEntries(),
    );
    return JSON.stringify(data);
  }

  async importJson(json: string): Promise<void> {
    const data = validateExport(JSON.parse(json));
    await this.queue.flushNow();
    await writeImport(this.adapter, data);
    this.ready = false;
    this.cardsLoaded = false;
    this.emit();
    await this.init();
  }

  async storageUsage(): Promise<{ usedChars: number; totalChars: number; keys: number }> {
    await this.queue.flushNow();
    const keys = await this.adapter.getKeys();
    const values = await this.adapter.getItems(keys);
    let used = 0;
    for (const v of Object.values(values)) used += v?.length ?? 0;
    return { usedChars: used, totalChars: 1024 * 4096, keys: keys.length };
  }
}
