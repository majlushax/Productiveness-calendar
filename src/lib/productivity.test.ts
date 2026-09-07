import { describe, expect, it } from 'vitest';
import { averageScore, bestStreak, currentStreak, scoreDay, scoreRange } from './productivity';
import { emptyData } from './storage';
import type { AppData } from '../types';

const TODAY = '2026-09-07';

function base(): AppData {
  return emptyData();
}

describe('scoreDay', () => {
  it('pusty dzień to zero', () => {
    expect(scoreDay(base(), TODAY).total).toBe(0);
  });

  it('osiągnięcie wszystkich celów daje 100', () => {
    const d = base();
    d.tasks = [
      { id: 't1', title: 'A', due: TODAY, difficulty: 3, estimatedMinutes: 60, status: 'done',
        completedAt: `${TODAY}T12:00:00.000Z`, estimatedBy: 'manual', createdAt: `${TODAY}T08:00:00.000Z` },
      { id: 't2', title: 'B', due: TODAY, difficulty: 3, estimatedMinutes: 60, status: 'done',
        completedAt: `${TODAY}T14:00:00.000Z`, estimatedBy: 'manual', createdAt: `${TODAY}T08:00:00.000Z` },
    ];
    d.studySessions = [{ id: 's1', date: TODAY, minutes: 120 }];
    d.workouts = [
      { id: 'w1', date: TODAY, kind: 'Siłownia', durationMinutes: 60, intensity: 3 },
      { id: 'w2', date: '2026-09-05', kind: 'Siłownia', durationMinutes: 60, intensity: 3 },
      { id: 'w3', date: '2026-09-03', kind: 'Siłownia', durationMinutes: 60, intensity: 3 },
    ];
    d.journal = [{ id: 'j1', date: TODAY, text: 'x', score: 10, createdAt: `${TODAY}T20:00:00.000Z` }];

    expect(scoreDay(d, TODAY).total).toBe(100);
  });

  it('brak wpisu rozkłada jego wagę na pozostałe kategorie', () => {
    const d = base();
    d.studySessions = [{ id: 's1', date: TODAY, minutes: 120 }]; // cel nauki spełniony w 100%

    const score = scoreDay(d, TODAY);
    // Waga nauki to 30 ze 100, ale bez wpisu wagi sumują się do 85,
    // więc nauka daje 30/85 ≈ 35 punktów, a nie 30.
    expect(score.total).toBe(35);
    expect(score.parts.journal).toBe(0);
  });

  it('trening liczy się w oknie 7 dni, nie tylko w dniu treningu', () => {
    const d = base();
    d.workouts = [
      { id: 'w1', date: '2026-09-02', kind: 'Siłownia', durationMinutes: 60, intensity: 3 },
      { id: 'w2', date: '2026-09-04', kind: 'Siłownia', durationMinutes: 60, intensity: 3 },
      { id: 'w3', date: '2026-09-06', kind: 'Siłownia', durationMinutes: 60, intensity: 3 },
    ];
    const score = scoreDay(d, TODAY); // dziś bez treningu
    expect(score.detail.workedOutToday).toBe(false);
    expect(score.detail.workoutsLast7).toBe(3);
    expect(score.parts.workout).toBeGreaterThan(0);
  });

  it('trening sprzed ponad tygodnia już się nie liczy', () => {
    const d = base();
    d.workouts = [{ id: 'w1', date: '2026-08-20', kind: 'Siłownia', durationMinutes: 60, intensity: 3 }];
    expect(scoreDay(d, TODAY).detail.workoutsLast7).toBe(0);
  });

  it('wykonanie ponad cel nie daje więcej niż maksimum kategorii', () => {
    const d = base();
    d.studySessions = [{ id: 's1', date: TODAY, minutes: 1000 }];
    const score = scoreDay(d, TODAY);
    expect(score.parts.study).toBeLessThanOrEqual(36); // 30/85 * 100 ≈ 35,3
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it('liczy tylko bloki oznaczone jako zrobione', () => {
    const d = base();
    d.blocks = [
      { id: 'b1', taskId: 't1', date: TODAY, start: '16:00', end: '17:00', minutes: 60, status: 'done' },
      { id: 'b2', taskId: 't1', date: TODAY, start: '18:00', end: '19:00', minutes: 60, status: 'planned' },
    ];
    expect(scoreDay(d, TODAY).detail.studyMinutes).toBe(60);
  });
});

describe('serie', () => {
  function withStudyOn(dates: string[]): AppData {
    const d = base();
    // 120 min nauki = 35 pkt; podnosimy próg spełnienia, dokładając zadania.
    d.studySessions = dates.map((date, i) => ({ id: `s${i}`, date, minutes: 120 }));
    d.tasks = dates.map((date, i) => ({
      id: `t${i}`, title: 'x', due: date, difficulty: 5 as const, estimatedMinutes: 60,
      status: 'done' as const, completedAt: `${date}T12:00:00.000Z`,
      estimatedBy: 'manual' as const, createdAt: `${date}T08:00:00.000Z`,
    }));
    d.workouts = dates.map((date, i) => ({
      id: `w${i}`, date, kind: 'Siłownia', durationMinutes: 60, intensity: 3 as const,
    }));
    return d;
  }

  it('liczy kolejne dni powyżej progu', () => {
    const d = withStudyOn(['2026-09-05', '2026-09-06', '2026-09-07']);
    expect(scoreDay(d, TODAY).total).toBeGreaterThanOrEqual(d.settings.streakThreshold);
    expect(currentStreak(d, TODAY)).toBe(3);
  });

  it('nie zeruje serii, gdy dzisiejszy dzień jeszcze trwa', () => {
    const d = withStudyOn(['2026-09-05', '2026-09-06']); // dziś pusto
    expect(currentStreak(d, TODAY)).toBe(2);
  });

  it('przerwa kasuje bieżącą serię, ale rekord zostaje', () => {
    const d = withStudyOn(['2026-09-01', '2026-09-02', '2026-09-03']); // przerwa 4–7
    expect(currentStreak(d, TODAY)).toBe(0);
    expect(bestStreak(d, TODAY)).toBe(3);
  });
});

describe('scoreRange', () => {
  it('zwraca wynik dla każdego dnia zakresu', () => {
    const scores = scoreRange(base(), '2026-09-01', '2026-09-07');
    expect(scores).toHaveLength(7);
    expect(averageScore(scores)).toBe(0);
  });
});
