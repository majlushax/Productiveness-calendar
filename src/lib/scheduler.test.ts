import { describe, expect, it } from 'vitest';
import { planSchedule, freeCapacityUntil } from './scheduler';
import { emptyData } from './storage';
import { clockToMinutes } from './date';
import type { AppData, Difficulty, Task } from '../types';

const TODAY = '2026-09-07'; // poniedziałek

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: over.id ?? 'task-1',
    title: 'Rozprawka z WOS',
    subject: 'WOS',
    due: '2026-09-14',
    difficulty: 4 as Difficulty,
    estimatedMinutes: 150,
    status: 'todo',
    estimatedBy: 'ai',
    createdAt: `${TODAY}T10:00:00.000Z`,
    ...over,
  };
}

function withTasks(tasks: Task[], mutate?: (d: AppData) => void): AppData {
  const data = emptyData();
  data.tasks = tasks;
  mutate?.(data);
  return data;
}

/** Planowanie zawsze z ustaloną godziną, żeby wynik nie zależał od zegara. */
const plan = (data: AppData, today = TODAY) => planSchedule(data, today, 0);

describe('planSchedule', () => {
  it('rozkłada zadanie na sesje o łącznym szacowanym czasie', () => {
    const result = plan(withTasks([makeTask()]));
    const total = result.blocks.reduce((sum, b) => sum + b.minutes, 0);
    expect(total).toBe(150);
    expect(result.blocks.length).toBeGreaterThan(1); // 150 min > maks. 90 min na sesję
    expect(result.warnings).toHaveLength(0);
  });

  it('nie przekracza maksymalnej długości sesji', () => {
    const data = withTasks([makeTask({ estimatedMinutes: 300 })]);
    for (const b of plan(data).blocks) {
      expect(b.minutes).toBeLessThanOrEqual(data.settings.maxBlockMinutes);
      expect(b.minutes).toBeGreaterThanOrEqual(data.settings.minBlockMinutes);
    }
  });

  it('kończy pracę z zapasem przed terminem', () => {
    const result = plan(withTasks([makeTask()]));
    // bufferDays = 1, więc nic nie powinno wypaść 14 września.
    for (const b of result.blocks) expect(b.date < '2026-09-14').toBe(true);
  });

  it('rozrzuca sesje po różnych dniach zamiast wciskać w jeden wieczór', () => {
    const result = plan(withTasks([makeTask({ estimatedMinutes: 240 })]));
    const days = new Set(result.blocks.map((b) => b.date));
    expect(days.size).toBeGreaterThan(1);
  });

  it('omija stałe zajęcia z planu tygodnia', () => {
    const data = withTasks([makeTask()], (d) => {
      // Blokada całego okna 16:00–22:00 w poniedziałki i wtorki.
      d.fixedEvents = [
        { id: 'f1', title: 'Lekcje', weekday: 1, start: '15:00', end: '23:00', kind: 'school' },
        { id: 'f2', title: 'Lekcje', weekday: 2, start: '15:00', end: '23:00', kind: 'school' },
      ];
    });
    const result = plan(data);
    // 7 i 8 września to poniedziałek i wtorek — muszą zostać puste.
    expect(result.blocks.some((b) => b.date === '2026-09-07' || b.date === '2026-09-08')).toBe(false);
    expect(result.blocks.length).toBeGreaterThan(0);
  });

  it('nie nakłada bloków na siebie', () => {
    const tasks = [
      makeTask({ id: 'a', estimatedMinutes: 180 }),
      makeTask({ id: 'b', title: 'Matma', estimatedMinutes: 180, due: '2026-09-11' }),
      makeTask({ id: 'c', title: 'Historia', estimatedMinutes: 120, due: '2026-09-10' }),
    ];
    const byDay = new Map<string, Array<[number, number]>>();
    for (const b of plan(withTasks(tasks)).blocks) {
      const list = byDay.get(b.date) ?? [];
      list.push([clockToMinutes(b.start), clockToMinutes(b.end)]);
      byDay.set(b.date, list);
    }
    for (const [, spans] of byDay) {
      spans.sort((x, y) => x[0] - y[0]);
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1]);
      }
    }
  });

  it('trzyma się dziennego limitu nauki', () => {
    const data = withTasks(
      Array.from({ length: 6 }, (_, i) =>
        makeTask({ id: `t${i}`, estimatedMinutes: 180, due: '2026-09-09' }),
      ),
    );
    const perDay = new Map<string, number>();
    for (const b of plan(data).blocks) {
      perDay.set(b.date, (perDay.get(b.date) ?? 0) + b.minutes);
    }
    for (const [, minutes] of perDay) {
      expect(minutes).toBeLessThanOrEqual(data.settings.dailyCapMinutes);
    }
  });

  it('ostrzega, gdy zadanie nie mieści się przed terminem', () => {
    const data = withTasks([makeTask({ estimatedMinutes: 600, due: '2026-09-08' })]);
    const result = plan(data);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(['partial', 'not-enough-time']).toContain(result.warnings[0].kind);
  });

  it('sygnalizuje zadanie po terminie i mimo to je planuje', () => {
    const data = withTasks([makeTask({ due: '2026-09-01', estimatedMinutes: 60 })]);
    const result = plan(data);
    expect(result.warnings.some((w) => w.kind === 'overdue')).toBe(true);
    expect(result.blocks.length).toBeGreaterThan(0);
  });

  it('nie rusza bloków przypiętych ręcznie', () => {
    const data = withTasks([makeTask()], (d) => {
      d.blocks = [{
        id: 'locked-1', taskId: 'task-1', date: '2026-09-12',
        start: '19:00', end: '20:00', minutes: 60, status: 'planned', locked: true,
      }];
    });
    const result = plan(data);
    const locked = result.blocks.find((b) => b.id === 'locked-1');
    expect(locked).toBeDefined();
    expect(locked?.start).toBe('19:00');
    // Pozostaje do zaplanowania 150 − 60 = 90 min.
    const created = result.blocks.filter((b) => b.id !== 'locked-1');
    expect(created.reduce((s, b) => s + b.minutes, 0)).toBe(90);
  });

  it('zachowuje historię z przeszłych dni', () => {
    const data = withTasks([makeTask()], (d) => {
      d.blocks = [{
        id: 'past-1', taskId: 'task-1', date: '2026-09-01',
        start: '17:00', end: '18:00', minutes: 60, status: 'done',
      }];
    });
    expect(plan(data).blocks.some((b) => b.id === 'past-1')).toBe(true);
  });

  it('pomija zadania już zrobione', () => {
    const data = withTasks([makeTask({ status: 'done', completedAt: `${TODAY}T12:00:00.000Z` })]);
    expect(plan(data).blocks).toHaveLength(0);
  });

  it('planuje najpierw zadania z najbliższym terminem', () => {
    const tasks = [
      makeTask({ id: 'later', title: 'Później', due: '2026-09-20', estimatedMinutes: 90 }),
      makeTask({ id: 'sooner', title: 'Wcześniej', due: '2026-09-09', estimatedMinutes: 90 }),
    ];
    const blocks = plan(withTasks(tasks)).blocks;
    const firstSooner = blocks.filter((b) => b.taskId === 'sooner')[0];
    expect(firstSooner.date <= '2026-09-08').toBe(true);
  });

  it('używa szerszego okna w weekend', () => {
    // Zadanie na poniedziałek 14.09 z terminem po weekendzie.
    const data = withTasks([makeTask({ due: '2026-09-14', estimatedMinutes: 90 })], (d) => {
      d.settings.availability.weekday = { start: '20:00', end: '21:00' };
      d.settings.availability.weekend = { start: '09:00', end: '20:00' };
    });
    const result = plan(data);
    expect(result.blocks.every((b) => b.minutes > 0)).toBe(true);
    expect(result.blocks.reduce((s, b) => s + b.minutes, 0)).toBe(90);
  });
});

describe('freeCapacityUntil', () => {
  it('liczy wolne minuty do terminu', () => {
    const data = emptyData();
    // 8–10 września: trzy dni robocze po 6 h okna (16:00–22:00).
    const free = freeCapacityUntil(data, '2026-09-10', '2026-09-08');
    expect(free).toBe(3 * 240); // limit dzienny 240 min ucina okno 360 min
  });

  it('zwraca zero dla terminu z przeszłości', () => {
    expect(freeCapacityUntil(emptyData(), '2026-09-01', '2026-09-08')).toBe(0);
  });
});
