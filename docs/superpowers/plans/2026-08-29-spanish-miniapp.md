# Spanish Mini App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serverless Telegram Mini App for learning 5 000 frequency-ranked European Spanish words with user-written translations/examples, spaced repetition, and a galaxy-map progress view, hosted on GitHub Pages with data in Telegram CloudStorage.

**Architecture:** Static Vite + React + TS SPA (HashRouter). All user data lives in Telegram CloudStorage behind a typed adapter (localStorage adapter in dev, memory adapter in tests); pure codec functions pack statuses/translations/SRS/examples into the key schema from the spec. GitHub Actions deploys Pages and sends the daily reminder via Bot API `sendMessage`.

**Tech Stack:** React 18, TypeScript (strict), Vite 5, react-router-dom 6, react-window 1.8, lz-string 1.5, vitest 2, tsx (build-words script). No backend, no paid services.

**Spec:** `docs/spec.md` (полное ТЗ; токен бота вырезан — секреты только в GitHub Secrets).

## Global Constraints

- Exactly 5 000 unique words in `src/data/words.json`; `id` 0–4999 = rank−1; levels by rank: A1 1–500, A2 501–1200, B1 1201–2500, B2 2501–4000, C1 4001–5000.
- Castellano (Spain) lexicon; verbs infinitive only (`-ar/-er/-ir/-ír` + optional `se`); no articles/prepositions/pronouns/conjunctions/determiners/question words/`sí`/`no`/numerals/proper names/abbreviations.
- CloudStorage limits: ≤1024 keys, value ≤4096 chars, key ≤128 chars `[A-Za-z0-9_-]`. Key schema: `st_0 st_1`, `meta`, `tr_*`, `srs_*`, `ix_*`, `d_*` (lz-string `compressToUTF16`, bucket ≤3600 chars compressed).
- SRS intervals `[1, 3, 7, 14, 30, 60, 120]` days; dates stored as day offsets from 2026‑01‑01 (local time).
- Statuses: `n k l r m`. `known` never appears in queue or reviews. Daily refill max once per calendar day up to `new_per_day` (default 15); `min_sentences` default 10.
- UI fully Russian; tabs: Мостик · Архив · Карта · Системы. Always-dark space-opera design per spec §8 (palette, Exo 2 / Inter / JetBrains Mono, chamfered HUD panels, canvas starfield ≤3px parallax, canvas galaxy map with pan/zoom).
- No gamification, no TTS, no hints, no backend, no `initData` validation, no secrets in the repo.
- Vite `base` = `/<repo>/` derived from `GITHUB_REPOSITORY` env in CI, `'./'` locally.

---

### Task 1: Project scaffold

**Files:** `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/vite-env.d.ts`.
Verify: `npm install` ok; `npm run dev` serves; `npm run build` passes `tsc -b && vite build`.

### Task 2: Word database

**Files:** `data/raw/batch_01.json … batch_10.json` (arrays of `[word, pos]`, 500 each, descending frequency; `pos ∈ noun|verb|adj|adv|interj`), top-up `batch_11+.json` as needed; `scripts/build-words.ts` → `src/data/words.json`.
Script: merge in batch order → normalize → stop-list (function words, numerals, LatAm variants) → dedupe case-insensitive/diacritic-sensitive → verb infinitive regex `/(ar|er|ir|ír)(se)?$/` → must end with exactly 5 000 → assign `rank = index+1`, `level` by rank → write JSON with `id, word, pos, level, rank`. Exit 1 with a detailed report on any violation; `--fix` rewrites cleaned batches so iteration converges.
Verify: `npm run build:words` exits 0; word count 5000; spot-check castellano items (coche, ordenador, móvil, zumo, conducir).

### Task 3: Storage layer

**Files:** `src/storage/adapter.ts` (интерфейс + telegram/local/memory), `src/storage/codec.ts`, `src/storage/queue.ts`, `src/storage/persist.ts`; tests `src/storage/__tests__/*.test.ts`.

**Interfaces (produced):**
- `StorageAdapter { getItem(k): Promise<string|null>; getItems(ks): Promise<Record<string,string|null>>; setItem(k,v): Promise<void>; removeItem(k): Promise<void>; removeItems(ks): Promise<void>; getKeys(): Promise<string[]> }`
- codec: `packStatuses(Uint8Array): [string,string]`, `parseStatuses([string,string]): Uint8Array`; `packTrChunk(entries: Map<number,string>…)/parseTrChunk`; `packSrsChunk/parseSrsChunk` (`id:step:next:learned;`); `packIx(Array<number|null>): string[]` (2× base36, `--` = none) / `parseIx`; `compressBucket(Record<number, [string,string][]>): string` (lz-string UTF16) / `decompressBucket`; `dayFromDate(Date): number` (epoch 2026‑01‑01, local), `todayDay(): number`.
- `SaveQueue { set(key, value): void; flushNow(): Promise<void>; onStatus(cb: (s:'saved'|'saving')=>void) }` — debounce ~700 ms, sequential writes.
- `Persist` — chunk managers for tr/srs (in-memory id→key maps, rewrite chunk, overflow → move to last/new chunk) and bucket manager for `d_*` (≤3600 compressed; overflow → move word to last/new bucket, update ix).

Tests: codec round-trips; chunk overflow splits; bucket overflow moves word + updates ix; export→import round-trip on memory adapter.
Verify: `npm test` green.

### Task 4: Domain logic

**Files:** `src/logic/srs.ts`, `src/logic/refill.ts`, tests.
- `applyLearned(today) → {step:0, next:today+1, learned:today}`; `applyRemembered(rec,today)` → step+1, step 7 ⇒ mastered; `applyForgot(rec,today)` → step 0, next today+1; `dueIds(srsMap, statuses, today)` sorted by `next` asc.
- `refillQueue(statuses, meta, today)` — once per calendar day, fill `learning` up to N from `new` by rank.
Verify: `npm test` green.

### Task 5: App store + Telegram wrapper

**Files:** `src/telegram.ts` (detect, ready/expand/fullscreen/disableVerticalSwipes, safe-area CSS vars + events, haptics, showConfirm fallback, copy), `src/store.ts` (`AppStore` on `useSyncExternalStore`: load all non-`d_*` keys, daily refill, mutations: `toggleKnown`, `addToQueue`, `saveCard` (draft translation+examples+sentence counter delta), `markLearned`, `markAlreadyKnown`, `demoteToKnown`, `reviewRemembered/Forgot`, `setSettings`, `exportData`/`importData` (decoded JSON: statuses, meta, translations, srs, examples; import repacks all buckets), `storageUsage`).
Verify: `npm test`; manual dev run.

### Task 6: UI — screens & design

**Files:** `src/styles.css`, `src/App.tsx`, `src/components/{Starfield,Panel,TabBar,LevelBadge,StatusBadge,SaveIndicator,Confirm}.tsx`, `src/components/{GalaxyCanvas,MiniMap}.tsx`, `src/screens/{Bridge,WordCard,Review,Archive,GalaxyScreen,Settings,Gate,Loading}.tsx`.
Routes `#/`, `#/archive`, `#/map`, `#/settings`, `#/card/:id`, `#/review`. All spec §4 behaviors + §8 design (palette tokens, chamfered panels, glow buttons, flip/warp/pulse micro-animations, `prefers-reduced-motion`). Archive: react-window VariableSizeList + sticky level overlay + search + chips + group actions. Galaxy: canvas, ring sectors ∝ word counts, seeded star positions, pinch/drag/wheel, tap tooltip. Stats: level bars, totals, 30-day bar chart from `learned` dates.
Verify: `npm run build`; Playwright smoke on dev server (localStorage adapter): all tabs render, card autosave, review flow.

### Task 7: Workflows + README

**Files:** `.github/workflows/deploy.yml` (Pages: checkout → node 20 → `npm ci` → `npm run build` → upload/deploy), `.github/workflows/reminder.yml` (cron UTC + comment, curl `sendMessage` c inline `web_app` кнопкой «Открыть», URL из `github.repository`; commit `.last-reminder`; secrets `BOT_TOKEN`, `CHAT_ID`), `README.md` (пошагово для новичка, по спецификации §8 «Хостинг и деплой»).
Verify: `actionlint`-style manual review; YAML parses.

### Task 8: Acceptance

Run full checklist from spec §11; `npm test`, `npm run build`, Playwright pass over all screens; `git init` + initial commit.
