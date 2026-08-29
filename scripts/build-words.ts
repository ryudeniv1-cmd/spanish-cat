/**
 * Сборка базы слов: data/raw/batch_*.json -> src/data/words.json
 *
 * Правила (ТЗ, раздел 2):
 *  - ровно 5000 записей, id = rank - 1;
 *  - только знаменательные части речи (noun | verb | adj | adv | interj);
 *  - стоп-лист служебных слов и числительных;
 *  - глаголы только в инфинитиве (-ar/-er/-ir/-ír, опционально + se);
 *  - уникальность без учёта регистра, но с учётом диакритики (año ≠ ano);
 *  - уровни по рангу: A1 1–500, A2 501–1200, B1 1201–2500, B2 2501–4000, C1 4001–5000.
 *
 * Запуск:  npm run build:words            — строгая проверка (ошибка при любом нарушении)
 *          npm run build:words -- --fix   — вычистить порции (удалить дубликаты/служебные)
 *                                           и переписать файлы порций; words.json пишется
 *                                           только при ровно 5000 чистых записей.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

type Pos = 'noun' | 'verb' | 'adj' | 'adv' | 'interj';
interface RawEntry {
  word: string;
  pos: string;
  file: string;
  line: number;
}

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'words.json');
const FIX = process.argv.includes('--fix');

const POS_SET = new Set(['noun', 'verb', 'adj', 'adv', 'interj']);

// Стоп-лист: артикли, предлоги, местоимения, союзы, детерминативы,
// вопросительные слова, частицы sí/no, числительные, латиноамериканизмы.
// Осознанно НЕ входят: "bajo" (прилагательное, пример из ТЗ) и "sobre"
// (существительное «конверт») — это словарные записи.
const STOP_WORDS = new Set(
  `
  el la los las un una unos unas lo al del
  a ante cabe con contra de desde durante en entre hacia hasta mediante para por según sin so tras salvo
  yo tú él ella ello usted ustedes nosotros nosotras vosotros vosotras ellos ellas
  me te se le les mí ti conmigo contigo consigo
  esto eso aquello alguien nadie algo nada quien quienes cual cuales cuyo cuya cuyos cuyas cualquiera
  este esta estos estas ese esa esos esas aquel aquella aquellos aquellas
  mi mis tu tus su sus nuestro nuestra nuestros nuestras vuestro vuestra vuestros vuestras
  algún alguno alguna algunos algunas ningún ninguno ninguna
  cada todo toda todos todas otro otra otros otras mismo misma mismos mismas
  tal tales tanto tanta tantos tantas cuanto cuanta cuantos cuantas
  ambos ambas varios varias demás cualquier sendos sendas
  y e o u ni pero sino mas que porque pues aunque si como cuando donde mientras conque
  qué quién quiénes cuál cuáles cómo cuándo dónde cuánto cuánta cuántos cuántas adónde
  sí no
  cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince
  dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro
  veinticinco veintiséis veintisiete veintiocho veintinueve
  treinta cuarenta cincuenta sesenta setenta ochenta noventa
  cien ciento doscientos trescientos cuatrocientos quinientos seiscientos setecientos
  ochocientos novecientos mil millón millones billón millar docena
  primero primer primera segundo segunda tercero tercer tercera cuarto cuarta quinto quinta
  sexto sexta séptimo séptima octavo octava noveno novena décimo décima undécimo duodécimo
  vigésimo centésimo milésimo doble triple cuádruple medio media
  carro auto computadora computador celular jugo manejar boleto platicar alberca recámara
  enojarse enojar mesero valija frijol carro
  `
    .split(/\s+/)
    .filter(Boolean),
);

const LETTERS_RE = /^[a-záéíóúüñ]+$/;

function isInfinitive(word: string): boolean {
  const base = word.endsWith('se') ? word.slice(0, -2) : word;
  return /(?:ar|er|ir|ír)$/.test(base);
}

function levelForRank(rank: number): string {
  if (rank <= 500) return 'A1';
  if (rank <= 1200) return 'A2';
  if (rank <= 2500) return 'B1';
  if (rank <= 4000) return 'B2';
  return 'C1';
}

// --- чтение порций ---
const batchFiles = fs
  .readdirSync(RAW_DIR)
  .filter((f) => /^batch_\d+\.json$/.test(f))
  .sort();

if (batchFiles.length === 0) {
  console.error('Не найдены файлы data/raw/batch_*.json');
  process.exit(1);
}

const raw: RawEntry[] = [];
for (const file of batchFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), 'utf8')) as [string, string][];
  data.forEach(([word, pos], i) => {
    raw.push({ word: word.normalize('NFC').trim(), pos, file, line: i + 1 });
  });
}

// --- проверка и очистка ---
const problems: string[] = [];
const seen = new Map<string, RawEntry>(); // ключ: lower-case NFC (диакритика значима)
const clean: RawEntry[] = [];
const removedPerFile = new Map<string, Set<number>>();

function drop(e: RawEntry, reason: string) {
  problems.push(`${e.file}#${e.line} «${e.word}» — ${reason}`);
  if (!removedPerFile.has(e.file)) removedPerFile.set(e.file, new Set());
  removedPerFile.get(e.file)!.add(e.line);
}

for (const e of raw) {
  const key = e.word.toLowerCase();
  if (!POS_SET.has(e.pos)) {
    drop(e, `недопустимая часть речи "${e.pos}"`);
  } else if (!LETTERS_RE.test(key)) {
    drop(e, 'недопустимые символы (заглавные буквы, пробелы, цифры?)');
  } else if (STOP_WORDS.has(key)) {
    drop(e, 'служебное слово / числительное из стоп-листа');
  } else if (e.pos === 'verb' && !isInfinitive(key)) {
    drop(e, 'глагол не в инфинитиве');
  } else if (seen.has(key)) {
    const first = seen.get(key)!;
    drop(e, `дубликат (впервые: ${first.file}#${first.line})`);
  } else {
    seen.set(key, e);
    clean.push(e);
  }
}

if (problems.length > 0) {
  console.error(`Найдено нарушений: ${problems.length}`);
  for (const p of problems) console.error('  - ' + p);
}

let final = clean;
if (clean.length > 5000) {
  console.error(`Чистых записей ${clean.length} > 5000 — лишние ${clean.length - 5000} в хвосте:`);
  for (const e of clean.slice(5000)) console.error(`  - ${e.file}#${e.line} «${e.word}»`);
  if (FIX) {
    for (const e of clean.slice(5000)) drop(e, 'за пределами 5000 (обрезано)');
    final = clean.slice(0, 5000);
  }
}

if (FIX && removedPerFile.size > 0) {
  for (const file of batchFiles) {
    const removed = removedPerFile.get(file);
    if (!removed) continue;
    const kept = raw.filter((e) => e.file === file && !removed.has(e.line));
    const body = kept.map((e) => `["${e.word}","${e.pos}"]`).join(',\n');
    fs.writeFileSync(path.join(RAW_DIR, file), `[\n${body}\n]\n`, 'utf8');
    console.error(`Переписан ${file}: удалено ${removed.size}, осталось ${kept.length}`);
  }
}

if (final.length !== 5000) {
  console.error(
    `\nИтог: ${final.length} чистых записей из 5000 (${final.length < 5000 ? 'не хватает ' + (5000 - final.length) : 'лишние'}). words.json НЕ записан.`,
  );
  process.exit(1);
}
if (problems.length > 0 && !FIX) {
  console.error('\nСтрогий режим: нарушения выше нужно устранить (или запустить с --fix).');
  process.exit(1);
}

// --- запись результата ---
const words = final.map((e, i) => ({
  id: i,
  word: e.word,
  pos: e.pos as Pos,
  level: levelForRank(i + 1),
  rank: i + 1,
}));

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(words), 'utf8');

const perLevel = new Map<string, number>();
for (const w of words) perLevel.set(w.level, (perLevel.get(w.level) ?? 0) + 1);
console.log(`OK: записано ${words.length} слов в src/data/words.json`);
console.log(
  [...perLevel.entries()].map(([l, n]) => `${l}: ${n}`).join(' · '),
);
