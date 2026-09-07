import type { AppData, DayScore, ISODate } from '../types';
import { addDays, dateRange, daysBetween, todayISO } from './date';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Wynik dnia 0–100 z czterech składników.
 *
 * Trening liczony jest w oknie 7 dni, a nie "czy dziś był" — dzień przerwy
 * między treningami nie powinien zjeżdżać wskaźnika do zera.
 *
 * Jeśli danego dnia nie ma wpisu do dziennika, waga wpisu rozkłada się
 * proporcjonalnie na pozostałe składniki, żeby brak notatki nie karał wyniku.
 */
export function scoreDay(data: AppData, date: ISODate): DayScore {
  const { goals, weights } = data.settings;

  const doneTasks = data.tasks.filter(
    (t) => t.status === 'done' && t.completedAt?.slice(0, 10) === date,
  );
  const taskPoints = doneTasks.reduce((sum, t) => sum + t.difficulty, 0);

  const blockMinutes = data.blocks
    .filter((b) => b.date === date && b.status === 'done')
    .reduce((sum, b) => sum + b.minutes, 0);
  const sessionMinutes = data.studySessions
    .filter((s) => s.date === date)
    .reduce((sum, s) => sum + s.minutes, 0);
  const studyMinutes = blockMinutes + sessionMinutes;

  const windowStart = addDays(date, -6);
  const workoutsLast7 = data.workouts.filter(
    (w) => w.date >= windowStart && w.date <= date,
  ).length;
  const workedOutToday = data.workouts.some((w) => w.date === date);

  const entries = data.journal.filter((j) => j.date === date && typeof j.score === 'number');
  const journalScore = entries.length
    ? entries.reduce((sum, j) => sum + (j.score ?? 0), 0) / entries.length
    : null;

  const ratios = {
    tasks: goals.taskPointsPerDay > 0 ? clamp01(taskPoints / goals.taskPointsPerDay) : 0,
    study: goals.studyMinutesPerDay > 0 ? clamp01(studyMinutes / goals.studyMinutesPerDay) : 0,
    workout: goals.workoutsPerWeek > 0 ? clamp01(workoutsLast7 / goals.workoutsPerWeek) : 0,
    journal: journalScore === null ? 0 : clamp01(journalScore / 10),
  };

  // Rozkład wag: bez wpisu waga dziennika idzie na pozostałe składniki.
  const active = { ...weights };
  if (journalScore === null) active.journal = 0;
  const sum = active.tasks + active.study + active.workout + active.journal;
  const scale = sum > 0 ? 100 / sum : 0;

  const parts = {
    tasks: ratios.tasks * active.tasks * scale,
    study: ratios.study * active.study * scale,
    workout: ratios.workout * active.workout * scale,
    journal: ratios.journal * active.journal * scale,
  };

  const total = Math.round(parts.tasks + parts.study + parts.workout + parts.journal);

  return {
    date,
    total: Math.max(0, Math.min(100, total)),
    parts: {
      tasks: Math.round(parts.tasks),
      study: Math.round(parts.study),
      workout: Math.round(parts.workout),
      journal: Math.round(parts.journal),
    },
    detail: {
      taskPoints,
      tasksDone: doneTasks.length,
      studyMinutes,
      workoutsLast7,
      workedOutToday,
      journalScore,
    },
  };
}

export function scoreRange(data: AppData, from: ISODate, to: ISODate): DayScore[] {
  return dateRange(from, to).map((d) => scoreDay(data, d));
}

/**
 * Seria dni z wynikiem >= próg. Dzisiejszy dzień trwa, więc gdy jeszcze nie
 * osiągnął progu, serię liczymy od wczoraj i nie zerujemy jej przedwcześnie.
 */
export function currentStreak(data: AppData, today: ISODate = todayISO()): number {
  const threshold = data.settings.streakThreshold;
  let streak = 0;
  let cursor = today;
  if (scoreDay(data, today).total < threshold) cursor = addDays(today, -1);
  for (let i = 0; i < 400; i++) {
    if (scoreDay(data, cursor).total < threshold) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function bestStreak(data: AppData, today: ISODate = todayISO()): number {
  const first = earliestDate(data);
  if (!first) return 0;
  const threshold = data.settings.streakThreshold;
  let best = 0;
  let run = 0;
  for (const day of dateRange(first, today)) {
    if (scoreDay(data, day).total >= threshold) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

/** Najstarszy dzień, dla którego są jakiekolwiek dane. */
export function earliestDate(data: AppData): ISODate | null {
  const candidates = [
    ...data.tasks.map((t) => t.createdAt.slice(0, 10)),
    ...data.workouts.map((w) => w.date),
    ...data.studySessions.map((s) => s.date),
    ...data.journal.map((j) => j.date),
    ...data.blocks.map((b) => b.date),
  ].filter(Boolean);
  if (!candidates.length) return null;
  return candidates.reduce((min, d) => (d < min ? d : min));
}

export function averageScore(scores: DayScore[]): number {
  if (!scores.length) return 0;
  return Math.round(scores.reduce((s, d) => s + d.total, 0) / scores.length);
}

/** Zmiana średniej względem poprzedniego okresu tej samej długości. */
export function trendVsPrevious(data: AppData, days: number, today: ISODate = todayISO()): number {
  const current = averageScore(scoreRange(data, addDays(today, -(days - 1)), today));
  const previous = averageScore(scoreRange(data, addDays(today, -(days * 2 - 1)), addDays(today, -days)));
  return current - previous;
}

export function scoreLabel(score: number): string {
  if (score >= 85) return 'Świetny dzień';
  if (score >= 70) return 'Dobry dzień';
  if (score >= 50) return 'Przyzwoicie';
  if (score >= 25) return 'Słabo';
  return 'Dzień do odrobienia';
}

/** Ile dni danych mamy — do ukrywania statystyk, gdy jest ich za mało. */
export function daysTracked(data: AppData, today: ISODate = todayISO()): number {
  const first = earliestDate(data);
  if (!first) return 0;
  return daysBetween(first, today) + 1;
}
