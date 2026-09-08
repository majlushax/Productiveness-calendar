/** Data w formacie YYYY-MM-DD (lokalna, bez strefy czasowej). */
export type ISODate = string;
/** Godzina w formacie HH:MM (24h). */
export type Clock = string;

export type Difficulty = 1 | 2 | 3 | 4 | 5;
export type TaskStatus = 'todo' | 'done';
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = poniedziałek ... 7 = niedziela

export interface Task {
  id: string;
  title: string;
  /** Przedmiot / kategoria, np. "WOS", "matematyka", "siłownia". */
  subject?: string;
  notes?: string;
  /** Termin oddania. */
  due: ISODate;
  dueTime?: Clock;
  /** 1 = banalne, 5 = bardzo trudne. Ocenia AI albo heurystyka. */
  difficulty: Difficulty;
  /** Ile minut łącznie zajmie zrobienie zadania. */
  estimatedMinutes: number;
  status: TaskStatus;
  completedAt?: string;
  /** Uzasadnienie oceny trudności — pokazywane w szczegółach zadania. */
  reasoning?: string;
  /** Czy pola oceniło AI, czy lokalna heurystyka. */
  estimatedBy: 'ai' | 'heuristic' | 'manual';
  createdAt: string;
  /** Oryginalny tekst wpisany przez użytkownika. */
  rawInput?: string;
}

/** Blok pracy nad zadaniem wstawiony w grafik przez planer. */
export interface StudyBlock {
  id: string;
  taskId: string;
  date: ISODate;
  start: Clock;
  end: Clock;
  minutes: number;
  status: 'planned' | 'done' | 'skipped';
  /** Blok przesunięty ręcznie — przeplanowanie go nie rusza. */
  locked?: boolean;
}

/** Stałe zajęcia z planu tygodnia: lekcje, siłownia, dojazdy. */
export interface FixedEvent {
  id: string;
  title: string;
  weekday: Weekday;
  start: Clock;
  end: Clock;
  kind: 'school' | 'gym' | 'work' | 'other';
}

export interface Workout {
  id: string;
  date: ISODate;
  kind: string;
  durationMinutes: number;
  intensity: 1 | 2 | 3 | 4 | 5;
  notes?: string;
}

/** Ręcznie zalogowany czas nauki poza blokami z planera. */
export interface StudySession {
  id: string;
  date: ISODate;
  minutes: number;
  subject?: string;
  note?: string;
}

export type MealKind = 'śniadanie' | 'obiad' | 'kolacja' | 'przekąska';

/** Posiłek oceniany pod kątem zgodności z dietą użytkownika. */
export interface Meal {
  id: string;
  date: ISODate;
  kind: MealKind;
  description: string;
  /** Zgodność z dietą 0–10. */
  score?: number;
  comment?: string;
  scoredBy?: 'ai' | 'heuristic';
  createdAt: string;
}

/** Wpis "co dziś zrobiłem" oceniany przez AI. */
export interface JournalEntry {
  id: string;
  date: ISODate;
  text: string;
  /** Ocena produktywności 0–10. */
  score?: number;
  comment?: string;
  category?: string;
  scoredBy?: 'ai' | 'heuristic';
  createdAt: string;
}

export interface Goals {
  workoutsPerWeek: number;
  studyMinutesPerDay: number;
  /** Ile "punktów zadaniowych" dziennie (punkt = trudność zadania). */
  taskPointsPerDay: number;
  /** Ile posiłków dziennie chcesz zapisywać — mianownik oceny jedzenia. */
  mealsPerDay: number;
}

export interface Weights {
  tasks: number;
  study: number;
  workout: number;
  meals: number;
  journal: number;
}

export interface AvailabilityWindow {
  start: Clock;
  end: Clock;
}

export interface Settings {
  geminiApiKey: string;
  geminiModel: string;
  /** Ogólne wytyczne użytkownika doklejane do każdego zapytania do AI. */
  aiInstructions: string;
  /** Opis diety — podstawa oceny posiłków. */
  dietDescription: string;
  goals: Goals;
  weights: Weights;
  availability: {
    weekday: AvailabilityWindow;
    weekend: AvailabilityWindow;
  };
  /** Minimalny wynik dnia, żeby dzień liczył się do serii. */
  streakThreshold: number;
  minBlockMinutes: number;
  maxBlockMinutes: number;
  /** Przerwa między blokami nauki (minuty). */
  breakMinutes: number;
  /** Ile dni przed terminem planer stara się skończyć zadanie. */
  bufferDays: number;
  /** Górny limit zaplanowanej nauki na jeden dzień. */
  dailyCapMinutes: number;
  theme: 'dark' | 'light' | 'auto';
}

export interface AppData {
  version: number;
  tasks: Task[];
  blocks: StudyBlock[];
  fixedEvents: FixedEvent[];
  workouts: Workout[];
  studySessions: StudySession[];
  meals: Meal[];
  journal: JournalEntry[];
  settings: Settings;
}

/** Wynik oceny zadania — zwracany przez AI albo heurystykę. */
export interface TaskEstimate {
  title: string;
  subject?: string;
  due?: ISODate;
  dueTime?: Clock;
  difficulty: Difficulty;
  estimatedMinutes: number;
  reasoning: string;
  source: 'ai' | 'heuristic';
}

export interface DayScore {
  date: ISODate;
  total: number;
  parts: {
    tasks: number;
    study: number;
    workout: number;
    meals: number;
    journal: number;
  };
  /** Surowe liczby do podpisów pod wskaźnikiem. */
  detail: {
    taskPoints: number;
    tasksDone: number;
    studyMinutes: number;
    workoutsLast7: number;
    workedOutToday: boolean;
    mealPoints: number;
    mealsLogged: number;
    journalScore: number | null;
  };
}
