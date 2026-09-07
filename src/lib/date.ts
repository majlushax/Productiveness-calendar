import type { Clock, ISODate, Weekday } from '../types';

export const DAY_NAMES_SHORT = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'ndz'];
export const DAY_NAMES = [
  'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela',
];
export const MONTHS = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];
export const MONTHS_NOMINATIVE = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Data jako YYYY-MM-DD w czasie lokalnym (Date#toISOString przesuwa o strefę). */
export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parsuje YYYY-MM-DD na lokalną północ. */
export function fromISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): ISODate {
  return toISO(new Date());
}

export function nowClock(): Clock {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** 1 = poniedziałek ... 7 = niedziela. */
export function weekdayOf(iso: ISODate): Weekday {
  const js = fromISO(iso).getDay(); // 0 = niedziela
  return (js === 0 ? 7 : js) as Weekday;
}

export function isWeekend(iso: ISODate): boolean {
  const w = weekdayOf(iso);
  return w === 6 || w === 7;
}

export function startOfWeek(iso: ISODate): ISODate {
  return addDays(iso, -(weekdayOf(iso) - 1));
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const ms = fromISO(to).getTime() - fromISO(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Lista kolejnych dat od `from` do `to` włącznie. */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const n = daysBetween(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

/** Siatka miesiąca: pełne tygodnie (pon–ndz) obejmujące dany miesiąc. */
export function monthGrid(year: number, month: number): ISODate[][] {
  const first = toISO(new Date(year, month, 1));
  const last = toISO(new Date(year, month + 1, 0));
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);
  const days = dateRange(start, end);
  const weeks: ISODate[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function clockToMinutes(c: Clock): number {
  const [h, m] = c.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToClock(min: number): Clock {
  const m = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
}

/** "1 h 30 min", "45 min", "2 h" */
export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** "14 września", z rokiem jeśli inny niż bieżący. */
export function formatDate(iso: ISODate): string {
  const d = fromISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return sameYear ? base : `${base} ${d.getFullYear()}`;
}

/** "Dziś", "Jutro", "Wczoraj" albo "pon, 14 września". */
export function formatDayLabel(iso: ISODate): string {
  const diff = daysBetween(todayISO(), iso);
  if (diff === 0) return 'Dziś';
  if (diff === 1) return 'Jutro';
  if (diff === -1) return 'Wczoraj';
  if (diff === 2) return 'Pojutrze';
  return `${DAY_NAMES_SHORT[weekdayOf(iso) - 1]}, ${formatDate(iso)}`;
}

/** Opis terminu: "za 3 dni", "dziś", "2 dni po terminie". */
export function formatDueLabel(iso: ISODate): string {
  const diff = daysBetween(todayISO(), iso);
  if (diff === 0) return 'dziś';
  if (diff === 1) return 'jutro';
  if (diff === -1) return 'wczoraj';
  if (diff < 0) {
    const n = -diff;
    return `${n} ${plural(n, 'dzień', 'dni', 'dni')} po terminie`;
  }
  return `za ${diff} ${plural(diff, 'dzień', 'dni', 'dni')}`;
}

/** Polska odmiana: 1 zadanie, 2 zadania, 5 zadań. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  const last = abs % 10;
  const lastTwo = abs % 100;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
  return many;
}

export function monthTitle(year: number, month: number): string {
  return `${MONTHS_NOMINATIVE[month]} ${year}`;
}
