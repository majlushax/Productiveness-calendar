import type { Clock, Difficulty, ISODate, TaskEstimate } from '../types';
import { addDays, fromISO, toISO, todayISO, weekdayOf } from './date';

/** Prefiksy nazw miesięcy — łapią odmianę ("września", "wrzesień", "wrzesnia"). */
const MONTH_PREFIXES = [
  'stycz', 'lut', 'marc|marz', 'kwie', 'maj', 'czerw',
  'lip', 'sierp', 'wrze|wrzes', 'paźdz|pazdz', 'listop', 'grud',
];

const WEEKDAY_PREFIXES = [
  'poniedzia', 'wtor', 'środ|srod', 'czwart', 'piąt|piat', 'sobot', 'niedziel',
];

export interface DateMatch {
  date: ISODate;
  time?: Clock;
  /** Fragment tekstu, który opisywał termin — do wycięcia z tytułu. */
  matched: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Znajduje termin w polskim tekście. Zwraca null, jeśli nic nie pasuje. */
export function parsePolishDate(input: string, today: ISODate = todayISO()): DateMatch | null {
  const text = input.toLowerCase();
  const time = parseTime(text);

  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return { date: iso[0], time, matched: iso[0] };
  }

  // 14.09, 14.09.2026, 14/09
  const numeric = text.match(/\b(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      let year = numeric[3] ? Number(numeric[3]) : fromISO(today).getFullYear();
      if (year < 100) year += 2000;
      const candidate = buildDate(year, month, day);
      if (candidate) {
        const rolled = numeric[3] ? candidate : rollForward(candidate, today);
        return { date: rolled, time, matched: numeric[0] };
      }
    }
  }

  // 14 września / 14 wrzesnia 2026
  for (let m = 0; m < MONTH_PREFIXES.length; m++) {
    const re = new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_PREFIXES[m]})[a-ząćęłńóśźż]*(?:\\s+(\\d{4}))?`, 'i');
    const hit = text.match(re);
    if (hit) {
      const day = Number(hit[1]);
      const year = hit[3] ? Number(hit[3]) : fromISO(today).getFullYear();
      const candidate = buildDate(year, m + 1, day);
      if (candidate) {
        const rolled = hit[3] ? candidate : rollForward(candidate, today);
        return { date: rolled, time, matched: hit[0] };
      }
    }
  }

  // dziś / jutro / pojutrze / za X dni / za X tygodni
  const relative: Array<[RegExp, (m: RegExpMatchArray) => number]> = [
    [/\b(dzisiaj|dzis|dziś)\b/, () => 0],
    [/\bjutro\b/, () => 1],
    [/\bpojutrze\b/, () => 2],
    [/\bza\s+(\d{1,2})\s+dni?\b/, (m) => Number(m[1])],
    [/\bza\s+tydzień|\bza\s+tydzien\b/, () => 7],
    [/\bza\s+(\d{1,2})\s+tygodni(?:e|a)?\b/, (m) => Number(m[1]) * 7],
    [/\bza\s+miesiąc|\bza\s+miesiac\b/, () => 30],
  ];
  for (const [re, offset] of relative) {
    const hit = text.match(re);
    if (hit) return { date: addDays(today, offset(hit)), time, matched: hit[0] };
  }

  // w poniedziałek / do piątku / w przyszły wtorek
  for (let w = 0; w < WEEKDAY_PREFIXES.length; w++) {
    const re = new RegExp(
      `\\b(?:w|we|do|na)?\\s*(przyszł[ay]|przyszl[ay]|nast[ęe]pn[ay])?\\s*(${WEEKDAY_PREFIXES[w]})[a-ząćęłńóśźż]*`,
      'i',
    );
    const hit = text.match(re);
    if (hit) {
      const target = (w + 1) as ReturnType<typeof weekdayOf>;
      let date = nextWeekday(today, target);
      if (hit[1]) date = addDays(date, 7);
      return { date, time, matched: clean(hit[0]) };
    }
  }

  return null;
}

function parseTime(text: string): Clock | undefined {
  const hit = text.match(/\b(?:o|na|do)\s+(\d{1,2})[:.](\d{2})\b/) ?? text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!hit) return undefined;
  const h = Number(hit[1]);
  const m = Number(hit[2]);
  if (h > 23 || m > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function buildDate(year: number, month: number, day: number): ISODate | null {
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null; // np. 31 lutego
  return toISO(d);
}

/** Data bez roku, która już minęła, oznacza przyszły rok. */
function rollForward(date: ISODate, today: ISODate): ISODate {
  if (date >= today) return date;
  const d = fromISO(date);
  d.setFullYear(d.getFullYear() + 1);
  return toISO(d);
}

function nextWeekday(from: ISODate, target: number): ISODate {
  const current = weekdayOf(from);
  const delta = (target - current + 7) % 7;
  return addDays(from, delta === 0 ? 7 : delta);
}

interface Kind {
  match: RegExp;
  label: string;
  difficulty: Difficulty;
  minutes: number;
}

/** Typowe zadania szkolne — bazowa trudność i czas. */
const KINDS: Kind[] = [
  { match: /matur|egzamin\s+ósmoklasisty|egzamin ósmoklasisty/, label: 'przygotowanie do egzaminu', difficulty: 5, minutes: 300 },
  { match: /projekt|prezentacj|referat/, label: 'projekt lub prezentacja', difficulty: 4, minutes: 240 },
  { match: /rozprawk|wypracowani|esej|opowiadani|charakterystyk/, label: 'dłuższa forma pisemna', difficulty: 4, minutes: 150 },
  { match: /sprawdzian|klasówk|klasowk|egzamin|test\b/, label: 'sprawdzian', difficulty: 4, minutes: 180 },
  { match: /kartkówk|kartkowk/, label: 'kartkówka', difficulty: 2, minutes: 60 },
  { match: /powtórk|powtork|nauczyć się|nauczyc sie|nauka do/, label: 'powtórka materiału', difficulty: 3, minutes: 120 },
  { match: /lektur|przeczyta|rozdział|rozdzial/, label: 'czytanie', difficulty: 2, minutes: 120 },
  { match: /notatk|streszczeni|konspekt/, label: 'notatki', difficulty: 2, minutes: 60 },
  { match: /wypisz|ćwiczeni|cwiczeni|zadani|praca domowa|zadanka/, label: 'ćwiczenia', difficulty: 2, minutes: 45 },
  { match: /plakat|makiet|model\b/, label: 'praca manualna', difficulty: 3, minutes: 120 },
];

const SUBJECTS: Array<[RegExp, string]> = [
  [/\bwos(?:u|em|ie)?\b|wiedz[ay] o społecz/, 'WOS'],
  [/\bmat(?:ma|my|emat)[a-ząćęłńóśźż]*/, 'Matematyka'],
  [/\bpolsk(?:i|iego|im)\b|\bj\.? ?polsk/, 'Polski'],
  [/\bangielsk[a-ząćęłńóśźż]*|\bang\b/, 'Angielski'],
  [/\bniemieck[a-ząćęłńóśźż]*/, 'Niemiecki'],
  [/\bhiszpańsk[a-ząćęłńóśźż]*|hiszpansk/, 'Hiszpański'],
  [/\bhistori[a-ząćęłńóśźż]*|\bhist\b/, 'Historia'],
  [/\bbiolog[a-ząćęłńóśźż]*|\bbio\b/, 'Biologia'],
  [/\bchemi[a-ząćęłńóśźż]*/, 'Chemia'],
  [/\bfizyk[a-ząćęłńóśźż]*|\bfiza\b/, 'Fizyka'],
  [/\bgeograf[a-ząćęłńóśźż]*|\bgeo\b/, 'Geografia'],
  [/\binformatyk[a-ząćęłńóśźż]*|\binfa\b|programowani/, 'Informatyka'],
  [/\breligi[a-ząćęłńóśźż]*/, 'Religia'],
  [/\bprzedsiębiorcz[a-ząćęłńóśźż]*|przedsiebiorcz/, 'Przedsiębiorczość'],
  [/\bw-?f\b|wychowani[ae] fizyczn/, 'WF'],
  [/\bplastyk[a-ząćęłńóśźż]*|\bmuzyk[a-ząćęłńóśźż]*/, 'Artystyczne'],
];

/** Jawny czas w tekście: "2h", "90 min", "półtorej godziny". */
function parseExplicitMinutes(text: string): number | null {
  const hours = text.match(/\b(\d{1,2})(?:[.,](\d))?\s*(?:h|godz)[a-ząćęłńóśźż]*/);
  if (hours) {
    const whole = Number(hours[1]);
    const frac = hours[2] ? Number(hours[2]) / 10 : 0;
    return Math.round((whole + frac) * 60);
  }
  const mins = text.match(/\b(\d{2,3})\s*(?:min|minut)[a-ząćęłńóśźż]*/);
  if (mins) return Number(mins[1]);
  return null;
}

/**
 * Lokalna ocena zadania — bez żadnego API.
 * Używana, gdy nie ma klucza Gemini, i jako natychmiastowy podgląd podczas pisania.
 */
export function heuristicEstimate(input: string, today: ISODate = todayISO()): TaskEstimate {
  const text = input.toLowerCase();
  const dateMatch = parsePolishDate(input, today);

  const kind = KINDS.find((k) => k.match.test(text));
  const subject = SUBJECTS.find(([re]) => re.test(text))?.[1];

  let difficulty: Difficulty = kind?.difficulty ?? 3;
  let minutes = parseExplicitMinutes(text) ?? kind?.minutes ?? 60;

  // Przedmioty ścisłe i długie treści zwykle zajmują więcej czasu.
  if (subject && ['Matematyka', 'Fizyka', 'Chemia'].includes(subject) && !parseExplicitMinutes(text)) {
    minutes = Math.round(minutes * 1.2);
  }
  if (/trudn|ciężk|ciezk|duż[oy]|duzo|obszern/.test(text)) {
    difficulty = Math.min(5, difficulty + 1) as Difficulty;
    minutes = Math.round(minutes * 1.3);
  }
  if (/łatw|latw|krótk|krotk|szybk|drobn/.test(text)) {
    difficulty = Math.max(1, difficulty - 1) as Difficulty;
    minutes = Math.round(minutes * 0.6);
  }

  // Mało czasu do terminu = wyższy priorytet, ale nie zmyślamy dłuższej pracy.
  minutes = Math.max(15, Math.min(600, Math.round(minutes / 5) * 5));

  const title = buildTitle(input, dateMatch?.matched);
  const reasonParts = [
    kind ? `rozpoznano: ${kind.label}` : 'brak rozpoznanego typu, przyjęto średnią trudność',
    subject ? `przedmiot: ${subject}` : null,
    `szacowany czas: ${minutes} min`,
  ].filter(Boolean);

  return {
    title,
    subject,
    due: dateMatch?.date,
    dueTime: dateMatch?.time,
    difficulty,
    estimatedMinutes: minutes,
    reasoning: `Ocena lokalna (bez AI) — ${reasonParts.join(', ')}.`,
    source: 'heuristic',
  };
}

/** Usuwa z tytułu fragment o terminie i słowa-wypełniacze. */
function buildTitle(input: string, matched?: string): string {
  let title = input;
  if (matched) {
    const idx = title.toLowerCase().indexOf(matched.toLowerCase());
    if (idx >= 0) title = title.slice(0, idx) + title.slice(idx + matched.length);
  }
  title = title
    .replace(/\b(due|deadline|termin|na|do|oddać|oddac|jest na)\b\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;–-]+$/, '')
    .trim();
  if (!title) title = input.trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
}
