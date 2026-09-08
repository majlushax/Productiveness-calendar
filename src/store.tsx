import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import type {
  AppData, FixedEvent, ISODate, JournalEntry, Meal, Settings, StudyBlock, StudySession,
  Task, TaskEstimate, Workout,
} from './types';
import { load, save, uid } from './lib/storage';
import { planSchedule, type PlanWarning } from './lib/scheduler';
import { addDays, todayISO } from './lib/date';

interface Store {
  data: AppData;
  warnings: PlanWarning[];
  addTask: (estimate: TaskEstimate, rawInput?: string) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  replan: () => PlanWarning[];
  setBlockStatus: (id: string, status: StudyBlock['status']) => void;
  moveBlock: (id: string, date: ISODate, start: string) => void;
  deleteBlock: (id: string) => void;
  addWorkout: (workout: Omit<Workout, 'id'>) => void;
  deleteWorkout: (id: string) => void;
  addStudySession: (session: Omit<StudySession, 'id'>) => void;
  deleteStudySession: (id: string) => void;
  addMeal: (meal: Omit<Meal, 'id' | 'createdAt'>) => Meal;
  updateMeal: (id: string, patch: Partial<Meal>) => void;
  deleteMeal: (id: string) => void;
  addJournalEntry: (entry: Omit<JournalEntry, 'id' | 'createdAt'>) => JournalEntry;
  updateJournalEntry: (id: string, patch: Partial<JournalEntry>) => void;
  deleteJournalEntry: (id: string) => void;
  addFixedEvent: (event: Omit<FixedEvent, 'id'>) => void;
  updateFixedEvent: (id: string, patch: Partial<FixedEvent>) => void;
  deleteFixedEvent: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  replaceAll: (data: AppData) => void;
  resetAll: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => load());
  const [warnings, setWarnings] = useState<PlanWarning[]>([]);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    save(data);
  }, [data]);

  const patch = useCallback((fn: (d: AppData) => AppData) => {
    setData((prev) => fn(prev));
  }, []);

  /** Przeplanowanie liczy się na najświeższych danych i zwraca ostrzeżenia. */
  const replanWith = useCallback((next: AppData): AppData => {
    const result = planSchedule(next);
    setWarnings(result.warnings);
    return { ...next, blocks: result.blocks };
  }, []);

  const replan = useCallback(() => {
    const result = planSchedule(dataRef.current);
    setWarnings(result.warnings);
    setData((prev) => ({ ...prev, blocks: result.blocks }));
    return result.warnings;
  }, []);

  const addTask = useCallback<Store['addTask']>((estimate, rawInput) => {
    const task: Task = {
      id: uid(),
      title: estimate.title,
      subject: estimate.subject,
      due: estimate.due ?? addDays(todayISO(), 3),
      dueTime: estimate.dueTime,
      difficulty: estimate.difficulty,
      estimatedMinutes: estimate.estimatedMinutes,
      status: 'todo',
      reasoning: estimate.reasoning,
      estimatedBy: estimate.source,
      createdAt: new Date().toISOString(),
      rawInput,
    };
    patch((d) => replanWith({ ...d, tasks: [...d.tasks, task] }));
    return task;
  }, [patch, replanWith]);

  const updateTask = useCallback<Store['updateTask']>((id, taskPatch) => {
    patch((d) => {
      const tasks = d.tasks.map((t) => (t.id === id ? { ...t, ...taskPatch } : t));
      // Zmiana terminu, czasu lub trudności unieważnia dotychczasowy plan zadania.
      const needsReplan = ['due', 'estimatedMinutes', 'difficulty', 'status'].some(
        (k) => k in taskPatch,
      );
      const next = { ...d, tasks };
      return needsReplan ? replanWith(dropPlannedFor(next, id)) : next;
    });
  }, [patch, replanWith]);

  const toggleTask = useCallback<Store['toggleTask']>((id) => {
    patch((d) => {
      const tasks = d.tasks.map((t) =>
        t.id === id
          ? t.status === 'done'
            ? { ...t, status: 'todo' as const, completedAt: undefined }
            : { ...t, status: 'done' as const, completedAt: new Date().toISOString() }
          : t,
      );
      const task = tasks.find((t) => t.id === id);
      let next: AppData = { ...d, tasks };
      if (task?.status === 'done') {
        // Zrobione zadanie znika z grafiku, ale historia bloków zostaje.
        next = {
          ...next,
          blocks: next.blocks.filter((b) => !(b.taskId === id && b.status === 'planned' && b.date >= todayISO())),
        };
      }
      return replanWith(next);
    });
  }, [patch, replanWith]);

  const deleteTask = useCallback<Store['deleteTask']>((id) => {
    patch((d) => ({
      ...d,
      tasks: d.tasks.filter((t) => t.id !== id),
      blocks: d.blocks.filter((b) => b.taskId !== id),
    }));
  }, [patch]);

  const setBlockStatus = useCallback<Store['setBlockStatus']>((id, status) => {
    patch((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === id ? { ...b, status } : b)),
    }));
  }, [patch]);

  const moveBlock = useCallback<Store['moveBlock']>((id, date, start) => {
    patch((d) => ({
      ...d,
      blocks: d.blocks.map((b) => {
        if (b.id !== id) return b;
        const [h, m] = start.split(':').map(Number);
        const endMinutes = h * 60 + m + b.minutes;
        const end = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
        return { ...b, date, start, end, locked: true };
      }),
    }));
  }, [patch]);

  const deleteBlock = useCallback<Store['deleteBlock']>((id) => {
    patch((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
  }, [patch]);

  const addWorkout = useCallback<Store['addWorkout']>((workout) => {
    patch((d) => ({ ...d, workouts: [...d.workouts, { ...workout, id: uid() }] }));
  }, [patch]);

  const deleteWorkout = useCallback<Store['deleteWorkout']>((id) => {
    patch((d) => ({ ...d, workouts: d.workouts.filter((w) => w.id !== id) }));
  }, [patch]);

  const addStudySession = useCallback<Store['addStudySession']>((session) => {
    patch((d) => ({ ...d, studySessions: [...d.studySessions, { ...session, id: uid() }] }));
  }, [patch]);

  const deleteStudySession = useCallback<Store['deleteStudySession']>((id) => {
    patch((d) => ({ ...d, studySessions: d.studySessions.filter((s) => s.id !== id) }));
  }, [patch]);

  const addMeal = useCallback<Store['addMeal']>((meal) => {
    const created: Meal = { ...meal, id: uid(), createdAt: new Date().toISOString() };
    patch((d) => ({ ...d, meals: [...d.meals, created] }));
    return created;
  }, [patch]);

  const updateMeal = useCallback<Store['updateMeal']>((id, mealPatch) => {
    patch((d) => ({
      ...d,
      meals: d.meals.map((m) => (m.id === id ? { ...m, ...mealPatch } : m)),
    }));
  }, [patch]);

  const deleteMeal = useCallback<Store['deleteMeal']>((id) => {
    patch((d) => ({ ...d, meals: d.meals.filter((m) => m.id !== id) }));
  }, [patch]);

  const addJournalEntry = useCallback<Store['addJournalEntry']>((entry) => {
    const created: JournalEntry = { ...entry, id: uid(), createdAt: new Date().toISOString() };
    patch((d) => ({ ...d, journal: [...d.journal, created] }));
    return created;
  }, [patch]);

  const updateJournalEntry = useCallback<Store['updateJournalEntry']>((id, entryPatch) => {
    patch((d) => ({
      ...d,
      journal: d.journal.map((j) => (j.id === id ? { ...j, ...entryPatch } : j)),
    }));
  }, [patch]);

  const deleteJournalEntry = useCallback<Store['deleteJournalEntry']>((id) => {
    patch((d) => ({ ...d, journal: d.journal.filter((j) => j.id !== id) }));
  }, [patch]);

  const addFixedEvent = useCallback<Store['addFixedEvent']>((event) => {
    patch((d) => replanWith({ ...d, fixedEvents: [...d.fixedEvents, { ...event, id: uid() }] }));
  }, [patch, replanWith]);

  const updateFixedEvent = useCallback<Store['updateFixedEvent']>((id, eventPatch) => {
    patch((d) => replanWith({
      ...d,
      fixedEvents: d.fixedEvents.map((e) => (e.id === id ? { ...e, ...eventPatch } : e)),
    }));
  }, [patch, replanWith]);

  const deleteFixedEvent = useCallback<Store['deleteFixedEvent']>((id) => {
    patch((d) => replanWith({ ...d, fixedEvents: d.fixedEvents.filter((e) => e.id !== id) }));
  }, [patch, replanWith]);

  const updateSettings = useCallback<Store['updateSettings']>((settingsPatch) => {
    patch((d) => {
      const next = { ...d, settings: { ...d.settings, ...settingsPatch } };
      // Zmiana okien dostępności albo limitów wymaga przeliczenia grafiku.
      const planKeys = ['availability', 'minBlockMinutes', 'maxBlockMinutes', 'breakMinutes', 'bufferDays', 'dailyCapMinutes'];
      return planKeys.some((k) => k in settingsPatch) ? replanWith(next) : next;
    });
  }, [patch, replanWith]);

  const replaceAll = useCallback<Store['replaceAll']>((next) => {
    setData(next);
    setWarnings([]);
  }, []);

  const resetAll = useCallback(() => {
    setData((prev) => ({
      ...prev,
      tasks: [], blocks: [], workouts: [], studySessions: [], meals: [], journal: [],
    }));
    setWarnings([]);
  }, []);

  const value = useMemo<Store>(() => ({
    data, warnings, addTask, updateTask, toggleTask, deleteTask, replan,
    setBlockStatus, moveBlock, deleteBlock, addWorkout, deleteWorkout,
    addStudySession, deleteStudySession, addMeal, updateMeal, deleteMeal,
    addJournalEntry, updateJournalEntry,
    deleteJournalEntry, addFixedEvent, updateFixedEvent, deleteFixedEvent,
    updateSettings, replaceAll, resetAll,
  }), [
    data, warnings, addTask, updateTask, toggleTask, deleteTask, replan,
    setBlockStatus, moveBlock, deleteBlock, addWorkout, deleteWorkout,
    addStudySession, deleteStudySession, addMeal, updateMeal, deleteMeal,
    addJournalEntry, updateJournalEntry,
    deleteJournalEntry, addFixedEvent, updateFixedEvent, deleteFixedEvent,
    updateSettings, replaceAll, resetAll,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** Usuwa przyszłe, niezaczęte bloki zadania — przed przeplanowaniem. */
function dropPlannedFor(data: AppData, taskId: string): AppData {
  const today = todayISO();
  return {
    ...data,
    blocks: data.blocks.filter(
      (b) => !(b.taskId === taskId && b.status === 'planned' && b.date >= today && !b.locked),
    ),
  };
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore poza StoreProvider');
  return ctx;
}
