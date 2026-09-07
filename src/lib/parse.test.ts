import { describe, expect, it } from 'vitest';
import { heuristicEstimate, parsePolishDate } from './parse';

const TODAY = '2026-09-07'; // poniedziałek

describe('parsePolishDate', () => {
  it('czyta datę słowną z odmianą', () => {
    expect(parsePolishDate('rozprawka na 14 września', TODAY)?.date).toBe('2026-09-14');
  });

  it('czyta zapis liczbowy', () => {
    expect(parsePolishDate('oddać do 14.09', TODAY)?.date).toBe('2026-09-14');
    expect(parsePolishDate('termin 2026-10-01', TODAY)?.date).toBe('2026-10-01');
  });

  it('datę bez roku, która już minęła, przenosi na przyszły rok', () => {
    expect(parsePolishDate('sprawdzian 1 marca', TODAY)?.date).toBe('2027-03-01');
  });

  it('rozumie określenia względne', () => {
    expect(parsePolishDate('zadanie na jutro', TODAY)?.date).toBe('2026-09-08');
    expect(parsePolishDate('esej za 3 dni', TODAY)?.date).toBe('2026-09-10');
    expect(parsePolishDate('projekt za tydzień', TODAY)?.date).toBe('2026-09-14');
  });

  it('rozumie nazwy dni tygodnia', () => {
    // 2026-09-07 to poniedziałek, więc najbliższy piątek to 11 września.
    expect(parsePolishDate('kartkówka w piątek', TODAY)?.date).toBe('2026-09-11');
    expect(parsePolishDate('sprawdzian w przyszły piątek', TODAY)?.date).toBe('2026-09-18');
  });

  it('ten sam dzień tygodnia oznacza za tydzień, nie dziś', () => {
    expect(parsePolishDate('spotkanie w poniedziałek', TODAY)?.date).toBe('2026-09-14');
  });

  it('wyłapuje godzinę, gdy jest podana', () => {
    expect(parsePolishDate('oddać 14.09 o 15:30', TODAY)?.time).toBe('15:30');
  });

  it('zwraca null, gdy terminu nie ma', () => {
    expect(parsePolishDate('przeczytać książkę', TODAY)).toBeNull();
  });

  it('nie myli "powtorka" z wtorkiem', () => {
    expect(parsePolishDate('powtorka materialu', TODAY)).toBeNull();
  });
});

describe('heuristicEstimate', () => {
  it('ocenia rozprawkę z WOS-u z terminem', () => {
    const e = heuristicEstimate('rozprawka z wosu due 14 września', TODAY);
    expect(e.due).toBe('2026-09-14');
    expect(e.subject).toBe('WOS');
    expect(e.difficulty).toBe(4);
    expect(e.estimatedMinutes).toBeGreaterThanOrEqual(120);
    expect(e.title.toLowerCase()).toContain('rozprawka');
    expect(e.title).not.toContain('14 września');
  });

  it('sprawdzian jest trudniejszy niż kartkówka', () => {
    const test = heuristicEstimate('sprawdzian z historii', TODAY);
    const quiz = heuristicEstimate('kartkówka z historii', TODAY);
    expect(test.difficulty).toBeGreaterThan(quiz.difficulty);
    expect(test.estimatedMinutes).toBeGreaterThan(quiz.estimatedMinutes);
  });

  it('respektuje jawnie podany czas', () => {
    expect(heuristicEstimate('ćwiczenia z matmy 2h', TODAY).estimatedMinutes).toBe(120);
    expect(heuristicEstimate('notatki 45 min', TODAY).estimatedMinutes).toBe(45);
  });

  it('słowa o trudności podbijają ocenę', () => {
    const normal = heuristicEstimate('zadania z chemii', TODAY);
    const hard = heuristicEstimate('trudne zadania z chemii', TODAY);
    expect(hard.difficulty).toBeGreaterThan(normal.difficulty);
  });

  it('zawsze zwraca sensowny tytuł i czas', () => {
    const e = heuristicEstimate('cokolwiek', TODAY);
    expect(e.title.length).toBeGreaterThan(0);
    expect(e.estimatedMinutes).toBeGreaterThanOrEqual(15);
    expect(e.difficulty).toBeGreaterThanOrEqual(1);
    expect(e.difficulty).toBeLessThanOrEqual(5);
  });
});
