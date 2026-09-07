import type { AppData, Settings } from '../types';

const KEY = 'productiveness-calendar:v1';
export const DATA_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  goals: {
    workoutsPerWeek: 3,
    studyMinutesPerDay: 120,
    taskPointsPerDay: 6,
  },
  weights: {
    tasks: 35,
    study: 30,
    workout: 20,
    journal: 15,
  },
  availability: {
    weekday: { start: '16:00', end: '22:00' },
    weekend: { start: '10:00', end: '20:00' },
  },
  streakThreshold: 60,
  minBlockMinutes: 30,
  maxBlockMinutes: 90,
  breakMinutes: 15,
  bufferDays: 1,
  dailyCapMinutes: 240,
  theme: 'dark',
};

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    tasks: [],
    blocks: [],
    fixedEvents: [],
    workouts: [],
    studySessions: [],
    journal: [],
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

/** Scala wczytane dane z domyślnymi, żeby starsze zapisy nie wywracały apki. */
export function normalize(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const d = raw as Partial<AppData>;
  return {
    version: DATA_VERSION,
    tasks: Array.isArray(d.tasks) ? d.tasks : [],
    blocks: Array.isArray(d.blocks) ? d.blocks : [],
    fixedEvents: Array.isArray(d.fixedEvents) ? d.fixedEvents : [],
    workouts: Array.isArray(d.workouts) ? d.workouts : [],
    studySessions: Array.isArray(d.studySessions) ? d.studySessions : [],
    journal: Array.isArray(d.journal) ? d.journal : [],
    settings: {
      ...base.settings,
      ...(d.settings ?? {}),
      goals: { ...base.settings.goals, ...(d.settings?.goals ?? {}) },
      weights: { ...base.settings.weights, ...(d.settings?.weights ?? {}) },
      availability: {
        ...base.settings.availability,
        ...(d.settings?.availability ?? {}),
      },
    },
  };
}

export function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyData();
    return normalize(JSON.parse(raw));
  } catch {
    // Safari w trybie prywatnym potrafi rzucić przy dostępie do localStorage.
    return emptyData();
  }
}

let saveTimer: number | undefined;

/** Zapis jest opóźniony, żeby szybkie zmiany w UI nie biły w dysk przy każdym znaku. */
export function save(data: AppData): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('Nie udało się zapisać danych', err);
    }
  }, 250) as unknown as number;
}

export function saveNow(data: AppData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Nie udało się zapisać danych', err);
  }
}

export function exportJSON(data: AppData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJSON(text: string): AppData {
  return normalize(JSON.parse(text));
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
