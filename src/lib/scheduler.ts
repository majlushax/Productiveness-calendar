import type { AppData, ISODate, StudyBlock } from '../types';
import {
  addDays, clockToMinutes, dateRange, daysBetween, isWeekend,
  minutesToClock, todayISO, weekdayOf,
} from './date';
import { uid } from './storage';

interface Interval {
  start: number; // minuty od północy
  end: number;
}

export interface PlanWarning {
  taskId: string;
  taskTitle: string;
  kind: 'overdue' | 'not-enough-time' | 'partial';
  message: string;
  missingMinutes?: number;
}

export interface PlanResult {
  blocks: StudyBlock[];
  warnings: PlanWarning[];
  scheduledMinutes: number;
  tasksPlanned: number;
}

const roundUpTo = (n: number, step: number) => Math.ceil(n / step) * step;

function subtract(free: Interval[], busy: Interval): Interval[] {
  const out: Interval[] = [];
  for (const f of free) {
    if (busy.end <= f.start || busy.start >= f.end) {
      out.push(f);
      continue;
    }
    if (busy.start > f.start) out.push({ start: f.start, end: busy.start });
    if (busy.end < f.end) out.push({ start: busy.end, end: f.end });
  }
  return out.filter((i) => i.end - i.start > 0);
}

/** Wolne okna danego dnia po odjęciu lekcji i już zajętych bloków. */
function freeWindows(
  data: AppData,
  date: ISODate,
  occupied: Interval[],
  today: ISODate,
  nowMinutes: number,
): Interval[] {
  const { availability } = data.settings;
  const window = isWeekend(date) ? availability.weekend : availability.weekday;
  let start = clockToMinutes(window.start);
  const end = clockToMinutes(window.end);
  if (end <= start) return [];

  // Dzisiaj planujemy dopiero od najbliższego kwadransa.
  if (date === today) start = Math.max(start, roundUpTo(nowMinutes + 5, 15));
  if (start >= end) return [];

  let free: Interval[] = [{ start, end }];
  const wd = weekdayOf(date);
  for (const ev of data.fixedEvents) {
    if (ev.weekday !== wd) continue;
    free = subtract(free, { start: clockToMinutes(ev.start), end: clockToMinutes(ev.end) });
  }
  for (const busy of occupied) free = subtract(free, busy);
  return free;
}

/** Dzieli czas zadania na sesje mieszczące się w limicie długości bloku. */
function splitIntoChunks(minutes: number, min: number, max: number): number[] {
  if (minutes <= max) return [Math.max(min, minutes)];
  const count = Math.ceil(minutes / max);
  const even = Math.round(minutes / count / 5) * 5;
  const chunks = Array.from({ length: count }, () => even);
  // Korekta zaokrągleń trafia do ostatniej sesji.
  const diff = minutes - even * count;
  chunks[count - 1] = Math.max(min, chunks[count - 1] + diff);
  return chunks;
}

/**
 * Rozkłada niezrobione zadania na wolne okna w grafiku.
 *
 * Zasady:
 *  - bloki z przeszłości i te przypięte ręcznie (`locked`) zostają nietknięte,
 *  - zadanie ma być gotowe `bufferDays` przed terminem — dzień zapasu na poprawki,
 *  - sesje są rozrzucane po dostępnych dniach, a nie wciskane w jeden wieczór,
 *  - dzienny limit nauki nie jest przekraczany, nawet kosztem opóźnienia zadania.
 */
export function planSchedule(
  data: AppData,
  today: ISODate = todayISO(),
  nowMinutesOverride?: number,
): PlanResult {
  const s = data.settings;
  const nowMinutes = nowMinutesOverride ?? currentMinutes(today);
  const warnings: PlanWarning[] = [];

  const openTaskIds = new Set(data.tasks.filter((t) => t.status === 'todo').map((t) => t.id));

  // Historia i ręcznie ustawione bloki są nienaruszalne.
  const kept = data.blocks.filter((b) => {
    if (b.date < today) return true;
    if (b.status !== 'planned') return true;
    if (b.locked) return openTaskIds.has(b.taskId);
    return false;
  });

  const occupiedByDay = new Map<ISODate, Interval[]>();
  const plannedMinutesByDay = new Map<ISODate, number>();
  for (const b of kept) {
    if (b.date < today) continue;
    const list = occupiedByDay.get(b.date) ?? [];
    list.push({ start: clockToMinutes(b.start), end: clockToMinutes(b.end) });
    occupiedByDay.set(b.date, list);
    plannedMinutesByDay.set(b.date, (plannedMinutesByDay.get(b.date) ?? 0) + b.minutes);
  }

  const lockedMinutesByTask = new Map<string, number>();
  for (const b of kept) {
    if (b.status === 'skipped') continue;
    lockedMinutesByTask.set(b.taskId, (lockedMinutesByTask.get(b.taskId) ?? 0) + b.minutes);
  }

  // Najpierw najbliższy termin, przy remisie trudniejsze zadanie.
  const queue = data.tasks
    .filter((t) => t.status === 'todo')
    .sort((a, b) => (a.due === b.due ? b.difficulty - a.difficulty : a.due < b.due ? -1 : 1));

  const created: StudyBlock[] = [];
  let scheduledMinutes = 0;
  let tasksPlanned = 0;

  for (const task of queue) {
    const alreadyPlanned = lockedMinutesByTask.get(task.id) ?? 0;
    const remaining = task.estimatedMinutes - alreadyPlanned;
    if (remaining < s.minBlockMinutes / 2) continue;

    const overdue = task.due < today;
    if (overdue) {
      warnings.push({
        taskId: task.id,
        taskTitle: task.title,
        kind: 'overdue',
        message: `Termin minął ${task.due}. Planuję na najbliższe dni.`,
      });
    }

    // Docelowo skończone dzień przed terminem; po terminie — jak najszybciej.
    const lastDay = overdue ? addDays(today, 2) : task.due;
    const preferredLast = overdue
      ? lastDay
      : maxDate(today, addDays(task.due, -s.bufferDays));
    const days = dateRange(today, preferredLast);
    const fallbackDays = dateRange(addDays(preferredLast, 1), lastDay);

    const chunks = splitIntoChunks(remaining, s.minBlockMinutes, s.maxBlockMinutes);
    const placedDays: ISODate[] = [];
    let placedMinutes = 0;

    const placeChunk = (dayOrder: ISODate[], minutes: number): StudyBlock | null => {
      for (const date of dayOrder) {
        const usedToday = plannedMinutesByDay.get(date) ?? 0;
        if (usedToday + minutes > s.dailyCapMinutes) continue;
        // Nie więcej niż dwie sesje tego samego zadania jednego dnia.
        if (placedDays.filter((d) => d === date).length >= 2) continue;

        const occupied = occupiedByDay.get(date) ?? [];
        const windows = freeWindows(data, date, occupied, today, nowMinutes);
        const slot = windows.find((w) => w.end - w.start >= minutes);
        if (!slot) continue;

        const block: StudyBlock = {
          id: uid(),
          taskId: task.id,
          date,
          start: minutesToClock(slot.start),
          end: minutesToClock(slot.start + minutes),
          minutes,
          status: 'planned',
        };
        // Rezerwujemy też przerwę, żeby sesje nie sklejały się w jeden ciąg.
        occupied.push({ start: slot.start, end: slot.start + minutes + s.breakMinutes });
        occupiedByDay.set(date, occupied);
        plannedMinutesByDay.set(date, usedToday + minutes);
        return block;
      }
      return null;
    };

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      // Sesje rozkładamy równomiernie po dostępnym oknie czasowym.
      const ideal = days.length ? Math.floor((i * days.length) / chunks.length) : 0;
      const order = [
        ...days.slice(ideal),
        ...days.slice(0, ideal).reverse(),
        ...fallbackDays,
      ];

      const block = placeChunk(order, chunk);
      if (block) {
        created.push(block);
        placedDays.push(block.date);
        placedMinutes += block.minutes;
        scheduledMinutes += block.minutes;
      }
    }

    if (placedMinutes > 0) tasksPlanned++;
    if (placedMinutes < remaining) {
      const missing = remaining - placedMinutes;
      warnings.push({
        taskId: task.id,
        taskTitle: task.title,
        kind: placedMinutes === 0 ? 'not-enough-time' : 'partial',
        missingMinutes: missing,
        message:
          placedMinutes === 0
            ? 'Brak wolnego miejsca w grafiku przed terminem.'
            : `Zaplanowano ${placedMinutes} z ${remaining} min — brakuje ${missing} min.`,
      });
    }
  }

  const blocks = [...kept, ...created].sort(
    (a, b) => (a.date === b.date ? clockToMinutes(a.start) - clockToMinutes(b.start) : a.date < b.date ? -1 : 1),
  );

  return { blocks, warnings, scheduledMinutes, tasksPlanned };
}

function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/**
 * Aktualna godzina liczy się tylko wtedy, gdy planujemy naprawdę na dzisiaj.
 * Dla dowolnej innej daty początkowej cały dzień jest dostępny — dzięki temu
 * wynik planowania nie zależy od tego, o której uruchomiono funkcję.
 */
function currentMinutes(today: ISODate): number {
  if (today !== todayISO()) return 0;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/** Ile wolnych minut zostało w grafiku do danego terminu — do ostrzeżeń w UI. */
export function freeCapacityUntil(data: AppData, due: ISODate, today: ISODate = todayISO()): number {
  if (daysBetween(today, due) < 0) return 0;
  const nowMinutes = currentMinutes(today);
  const occupiedByDay = new Map<ISODate, Interval[]>();
  for (const b of data.blocks) {
    if (b.date < today || b.status !== 'planned') continue;
    const list = occupiedByDay.get(b.date) ?? [];
    list.push({ start: clockToMinutes(b.start), end: clockToMinutes(b.end) });
    occupiedByDay.set(b.date, list);
  }
  let total = 0;
  for (const date of dateRange(today, due)) {
    const windows = freeWindows(data, date, occupiedByDay.get(date) ?? [], today, nowMinutes);
    const dayFree = windows.reduce((sum, w) => sum + (w.end - w.start), 0);
    total += Math.min(dayFree, data.settings.dailyCapMinutes);
  }
  return total;
}
