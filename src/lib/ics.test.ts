import { describe, expect, it } from 'vitest';
import { buildICS } from './ics';
import { emptyData, importJSON, exportJSON, normalize } from './storage';
import type { AppData } from '../types';

function sample(): AppData {
  const d = emptyData();
  d.tasks = [{
    id: 't1', title: 'Rozprawka; z WOS, część 2', subject: 'WOS', due: '2026-09-14',
    difficulty: 4, estimatedMinutes: 150, status: 'todo',
    estimatedBy: 'ai', createdAt: '2026-09-07T10:00:00.000Z',
  }];
  d.blocks = [{
    id: 'b1', taskId: 't1', date: '2026-09-10', start: '16:00', end: '17:30',
    minutes: 90, status: 'planned',
  }];
  return d;
}

describe('buildICS', () => {
  it('tworzy poprawną kopertę kalendarza', () => {
    const ics = buildICS(sample());
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics.split('\r\n').length).toBeGreaterThan(10);
  });

  it('zapisuje blok nauki z właściwymi godzinami', () => {
    const ics = buildICS(sample());
    expect(ics).toContain('DTSTART:20260910T160000');
    expect(ics).toContain('DTEND:20260910T173000');
    expect(ics).toContain('BEGIN:VALARM');
  });

  it('dodaje termin jako wydarzenie całodniowe', () => {
    const ics = buildICS(sample());
    expect(ics).toContain('DTSTART;VALUE=DATE:20260914');
    expect(ics).toContain('DTEND;VALUE=DATE:20260915');
  });

  it('escapuje przecinki i średniki w tytułach', () => {
    const ics = buildICS(sample());
    expect(ics).toContain('Rozprawka\\; z WOS\\, część 2');
  });

  it('pomija zrobione zadania i pominięte bloki', () => {
    const d = sample();
    d.tasks[0].status = 'done';
    d.blocks[0].status = 'skipped';
    const ics = buildICS(d);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('respektuje wyłączenie sekcji', () => {
    const ics = buildICS(sample(), { blocks: false, deadlines: true, alarmMinutes: 0 });
    expect(ics).not.toContain('DTSTART:20260910T160000');
    expect(ics).not.toContain('BEGIN:VALARM');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260914');
  });
});

describe('kopia zapasowa', () => {
  it('eksport i import zachowują dane', () => {
    const original = sample();
    const restored = importJSON(exportJSON(original));
    expect(restored.tasks).toEqual(original.tasks);
    expect(restored.blocks).toEqual(original.blocks);
    expect(restored.settings).toEqual(original.settings);
  });

  it('uzupełnia brakujące pola ze starszych kopii', () => {
    const restored = normalize({ tasks: [], settings: { geminiModel: 'inny-model' } });
    expect(restored.settings.geminiModel).toBe('inny-model');
    expect(restored.settings.goals.workoutsPerWeek).toBe(3);
    expect(restored.workouts).toEqual([]);
  });

  it('nie wywraca się na śmieciowym wejściu', () => {
    expect(normalize(null).tasks).toEqual([]);
    expect(normalize('nonsens').journal).toEqual([]);
  });
});
