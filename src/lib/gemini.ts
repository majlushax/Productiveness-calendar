import type { AppData, Difficulty, ISODate, TaskEstimate } from '../types';
import { formatDate, todayISO } from './date';
import { heuristicEstimate } from './parse';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'GeminiError';
  }
}

interface JsonSchema {
  type: string;
  properties?: Record<string, unknown>;
  items?: unknown;
  required?: string[];
  [k: string]: unknown;
}

/**
 * Wywołanie modelu z wymuszoną odpowiedzią JSON.
 *
 * Google przeniosło API na endpoint /interactions, ale starsze klucze i modele
 * nadal działają na :generateContent. Próbujemy najpierw starszego (szerzej
 * wspieranego), a przy odpowiedzi "nie znaleziono modelu/metody" powtarzamy
 * na nowym — dzięki temu apka nie przestanie działać po zmianie modelu.
 */
async function callModel(
  apiKey: string,
  model: string,
  prompt: string,
  schema: JsonSchema,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!apiKey) throw new GeminiError('Brak klucza API. Wpisz go w Ustawieniach.');

  const legacy = await request(
    `${BASE}/models/${encodeURIComponent(model)}:generateContent`,
    apiKey,
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.3,
      },
    },
    signal,
  );

  if (legacy.ok) return parseJsonPayload(extractLegacyText(legacy.body));

  const notFound = legacy.status === 404 || /not found|not supported|unsupported/i.test(legacy.error ?? '');
  if (!notFound) throw new GeminiError(legacy.error ?? 'Błąd odpowiedzi Gemini', legacy.status);

  const modern = await request(
    `${BASE}/interactions`,
    apiKey,
    {
      model,
      input: prompt,
      response_format: { type: 'text', mime_type: 'application/json', schema },
    },
    signal,
  );
  if (!modern.ok) throw new GeminiError(modern.error ?? 'Błąd odpowiedzi Gemini', modern.status);
  return parseJsonPayload(extractModernText(modern.body));
}

interface RawResponse {
  ok: boolean;
  status: number;
  body: unknown;
  error?: string;
}

async function request(
  url: string,
  apiKey: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<RawResponse> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new GeminiError('Brak połączenia z internetem albo blokada sieci.');
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } })?.error?.message ??
      (typeof body === 'string' ? body : `HTTP ${res.status}`);
    return { ok: false, status: res.status, body, error: friendlyError(res.status, message) };
  }
  return { ok: true, status: res.status, body };
}

function friendlyError(status: number, message: string): string {
  if (status === 400 && /API key not valid/i.test(message)) return 'Klucz API jest nieprawidłowy.';
  if (status === 403) return 'Klucz API nie ma dostępu do tego modelu.';
  if (status === 429) return 'Przekroczony limit zapytań. Spróbuj za chwilę.';
  if (status >= 500) return 'Serwer Gemini nie odpowiada. Spróbuj później.';
  return message;
}

function extractLegacyText(body: unknown): string {
  const parts = (body as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  })?.candidates?.[0]?.content?.parts;
  const text = parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new GeminiError('Model zwrócił pustą odpowiedź.');
  return text;
}

function extractModernText(body: unknown): string {
  const b = body as {
    output_text?: string;
    steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };
  if (b?.output_text) return b.output_text;
  const text = (b?.steps ?? [])
    .filter((s) => s.type === 'model_output')
    .flatMap((s) => s.content ?? [])
    .map((c) => c.text ?? '')
    .join('');
  if (!text) throw new GeminiError('Model zwrócił pustą odpowiedź.');
  return text;
}

/** Model bywa gadatliwy i opakowuje JSON w ```json — wyciągamy sam obiekt. */
function parseJsonPayload(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* pusto */
      }
    }
    throw new GeminiError('Nie udało się odczytać odpowiedzi modelu.');
  }
}

/** Kontekst z historii — dzięki niemu oceny są dopasowane do konkretnej osoby. */
function historyContext(data: AppData): string {
  const done = data.tasks
    .filter((t) => t.status === 'done')
    .slice(-8)
    .map((t) => {
      const spent = data.blocks
        .filter((b) => b.taskId === t.id && b.status === 'done')
        .reduce((sum, b) => sum + b.minutes, 0);
      const actual = spent > 0 ? `, realnie ${spent} min` : '';
      return `- "${t.title}" (${t.subject ?? 'brak przedmiotu'}), trudność ${t.difficulty}/5, szacowano ${t.estimatedMinutes} min${actual}`;
    });
  if (!done.length) return 'Brak historii — to jedno z pierwszych zadań użytkownika.';
  return `Wcześniejsze zadania tego ucznia:\n${done.join('\n')}`;
}

const TASK_SCHEMA: JsonSchema = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    subject: { type: 'STRING' },
    due: { type: 'STRING' },
    dueTime: { type: 'STRING' },
    difficulty: { type: 'INTEGER' },
    estimatedMinutes: { type: 'INTEGER' },
    reasoning: { type: 'STRING' },
  },
  required: ['title', 'difficulty', 'estimatedMinutes', 'reasoning'],
};

/**
 * Zamienia zdanie typu "rozprawka z wosu due 14 września" na ocenione zadanie.
 * Przy braku klucza albo błędzie sieci wraca do oceny lokalnej — apka nigdy
 * nie zostawia użytkownika bez wyniku.
 */
export async function estimateTask(
  data: AppData,
  input: string,
  signal?: AbortSignal,
): Promise<TaskEstimate> {
  const fallback = heuristicEstimate(input);
  const { geminiApiKey, geminiModel } = data.settings;
  if (!geminiApiKey) return fallback;

  const today = todayISO();
  const prompt = `Jesteś asystentem planowania nauki dla polskiego ucznia.
Dzisiaj jest ${formatDate(today)} (${today}).

Zadanie użytkownika opisane własnymi słowami:
"""${input}"""

${historyContext(data)}

Oceń to zadanie i zwróć JSON:
- title: krótki, konkretny tytuł zadania po polsku (bez daty w tytule),
- subject: przedmiot szkolny (np. "WOS", "Matematyka"), pomiń pole jeśli nie wynika z treści,
- due: termin w formacie YYYY-MM-DD. Datę bez roku interpretuj jako najbliższą przyszłą. Pomiń pole, jeśli termin nie został podany,
- dueTime: godzina HH:MM tylko jeśli użytkownik ją podał,
- difficulty: liczba 1-5, gdzie 1 to zadanie na 15 minut bez wysiłku, 3 to typowa praca domowa, 5 to duży projekt albo egzamin,
- estimatedMinutes: realny łączny czas pracy w minutach, uwzględniając tempo tego ucznia z historii powyżej,
- reasoning: jedno-dwa zdania po polsku, dlaczego taka trudność i taki czas.

Bądź realistyczny, nie zaniżaj czasu. Odpowiedz wyłącznie JSON-em.`;

  try {
    const raw = (await callModel(geminiApiKey, geminiModel, prompt, TASK_SCHEMA, signal)) as Record<string, unknown>;
    const difficulty = clampDifficulty(Number(raw.difficulty));
    const minutes = Math.max(10, Math.min(900, Math.round(Number(raw.estimatedMinutes) || fallback.estimatedMinutes)));
    const due = typeof raw.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.due) ? (raw.due as ISODate) : fallback.due;
    return {
      title: String(raw.title || fallback.title).trim(),
      subject: typeof raw.subject === 'string' && raw.subject.trim() ? raw.subject.trim() : fallback.subject,
      due,
      dueTime: typeof raw.dueTime === 'string' && /^\d{2}:\d{2}$/.test(raw.dueTime) ? raw.dueTime : fallback.dueTime,
      difficulty,
      estimatedMinutes: minutes,
      reasoning: String(raw.reasoning || '').trim() || fallback.reasoning,
      source: 'ai',
    };
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new GeminiError(
      err instanceof GeminiError ? err.message : 'Nie udało się ocenić zadania przez AI.',
    );
  }
}

const JOURNAL_SCHEMA: JsonSchema = {
  type: 'OBJECT',
  properties: {
    score: { type: 'NUMBER' },
    comment: { type: 'STRING' },
    category: { type: 'STRING' },
  },
  required: ['score', 'comment', 'category'],
};

export interface JournalVerdict {
  score: number;
  comment: string;
  category: string;
  source: 'ai' | 'heuristic';
}

/** Ocena wpisu "co dziś zrobiłem" w skali 0–10. */
export async function scoreJournalEntry(
  data: AppData,
  text: string,
  signal?: AbortSignal,
): Promise<JournalVerdict> {
  const { geminiApiKey, geminiModel, goals } = data.settings;
  if (!geminiApiKey) return heuristicJournal(text);

  const prompt = `Oceniasz produktywność dnia polskiego ucznia na podstawie jego własnej notatki.

Cele użytkownika: ${goals.studyMinutesPerDay} min nauki dziennie, ${goals.workoutsPerWeek} treningi tygodniowo.

Notatka:
"""${text}"""

Zwróć JSON:
- score: liczba 0-10. 0 to dzień całkowicie zmarnowany, 5 to przeciętny dzień z jedną sensowną rzeczą, 8-10 to dzień z realnym postępem w nauce, sporcie albo własnych projektach. Odpoczynek po ciężkim okresie nie jest marnowaniem czasu, ale sam scrollowanie telefonu tak.
- comment: jedno-dwa zdania po polsku, bezpośrednio do użytkownika (na "ty"). Bądź konkretny i uczciwy — bez pustych pochwał i bez moralizowania. Jeśli dzień był słaby, powiedz to wprost i zaproponuj jedną konkretną rzecz na jutro.
- category: jedno słowo podsumowujące dzień, np. "nauka", "sport", "projekt", "odpoczynek", "rozproszenie".

Odpowiedz wyłącznie JSON-em.`;

  try {
    const raw = (await callModel(geminiApiKey, geminiModel, prompt, JOURNAL_SCHEMA, signal)) as Record<string, unknown>;
    return {
      score: Math.max(0, Math.min(10, Number(raw.score) || 0)),
      comment: String(raw.comment ?? '').trim(),
      category: String(raw.category ?? 'inne').trim().toLowerCase(),
      source: 'ai',
    };
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new GeminiError(
      err instanceof GeminiError ? err.message : 'Nie udało się ocenić wpisu przez AI.',
    );
  }
}

/** Prosta ocena bez AI: dłuższy i bardziej konkretny opis = wyższy wynik. */
export function heuristicJournal(text: string): JournalVerdict {
  const t = text.toLowerCase();
  let score = 4;
  const productive = /nauk|uczy|zadani|trening|siłown|silown|bieg|projekt|napisa|przeczyta|powtórk|powtork|zrobi|skończy|skonczy|ćwiczy|cwiczy/g;
  const wasted = /nic nie|scroll|tiktok|youtube|leżał|lezal|prokrastyn|zmarnowa|nuda/g;
  score += Math.min(4, (t.match(productive) ?? []).length);
  score -= Math.min(4, (t.match(wasted) ?? []).length * 2);
  if (text.trim().length > 120) score += 1;
  score = Math.max(0, Math.min(10, score));

  const category = /trening|siłown|silown|bieg/.test(t)
    ? 'sport'
    : /nauk|uczy|zadani|powtórk|powtork/.test(t)
      ? 'nauka'
      : /projekt|kod|napisa/.test(t)
        ? 'projekt'
        : /nic nie|scroll|leżał|lezal/.test(t)
          ? 'rozproszenie'
          : 'inne';

  return {
    score,
    comment: 'Ocena lokalna, bez AI. Dodaj klucz Gemini w Ustawieniach, żeby dostawać konkretny komentarz.',
    category,
    source: 'heuristic',
  };
}

function clampDifficulty(n: number): Difficulty {
  const v = Math.round(n);
  if (!Number.isFinite(v) || v < 1) return 1;
  if (v > 5) return 5;
  return v as Difficulty;
}

export interface ModelInfo {
  name: string;
  displayName: string;
}

/** Lista modeli dostępnych dla danego klucza — do wyboru w Ustawieniach. */
export async function listModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch(`${BASE}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!res.ok) {
    const body = await res.text();
    let message = `HTTP ${res.status}`;
    try {
      message = JSON.parse(body)?.error?.message ?? message;
    } catch {
      /* pusto */
    }
    throw new GeminiError(friendlyError(res.status, message), res.status);
  }
  const body = (await res.json()) as {
    models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>;
  };
  return (body.models ?? [])
    .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => ({
      name: (m.name ?? '').replace(/^models\//, ''),
      displayName: m.displayName ?? (m.name ?? '').replace(/^models\//, ''),
    }))
    .filter((m) => m.name && !/embedding|aqa|imagen|veo/i.test(m.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Szybki test klucza — używany przez przycisk w Ustawieniach. */
export async function testConnection(apiKey: string, model: string): Promise<string> {
  const raw = (await callModel(
    apiKey,
    model,
    'Odpowiedz JSON-em {"ok":"działa"} i niczym więcej.',
    { type: 'OBJECT', properties: { ok: { type: 'STRING' } }, required: ['ok'] },
  )) as { ok?: string };
  return raw?.ok ?? 'ok';
}

const REVIEW_SCHEMA: JsonSchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    wins: { type: 'ARRAY', items: { type: 'STRING' } },
    focus: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['summary', 'wins', 'focus'],
};

export interface WeeklyReview {
  summary: string;
  wins: string[];
  focus: string[];
}

/** Podsumowanie tygodnia na podstawie realnych liczb, nie samych deklaracji. */
export async function reviewWeek(
  data: AppData,
  stats: {
    days: Array<{ date: ISODate; score: number }>;
    studyMinutes: number;
    workouts: number;
    tasksDone: number;
    tasksOverdue: number;
    journalNotes: string[];
  },
  signal?: AbortSignal,
): Promise<WeeklyReview> {
  const { geminiApiKey, geminiModel, goals } = data.settings;
  if (!geminiApiKey) throw new GeminiError('Brak klucza API. Wpisz go w Ustawieniach.');

  const prompt = `Analizujesz tydzień polskiego ucznia i piszesz krótkie, konkretne podsumowanie.

Cele: ${goals.studyMinutesPerDay} min nauki dziennie, ${goals.workoutsPerWeek} treningi tygodniowo.

Dane z ostatnich 7 dni:
- wyniki dzienne (0-100): ${stats.days.map((d) => `${d.date}: ${d.score}`).join(', ')}
- łączny czas nauki: ${stats.studyMinutes} min
- treningi: ${stats.workouts}
- ukończone zadania: ${stats.tasksDone}
- zadania po terminie: ${stats.tasksOverdue}
- własne notatki użytkownika: ${stats.journalNotes.length ? stats.journalNotes.map((n) => `"${n}"`).join('; ') : 'brak'}

Zwróć JSON:
- summary: 2-3 zdania po polsku, na "ty". Odnieś się do konkretnych liczb powyżej. Bez pustych pochwał, bez ogólników typu "trzymaj tak dalej".
- wins: 1-3 krótkie punkty, co realnie wyszło w tym tygodniu (jeśli nic — pusta tablica).
- focus: 1-3 krótkie, wykonalne rzeczy na następny tydzień. Konkrety, nie hasła.

Odpowiedz wyłącznie JSON-em.`;

  const raw = (await callModel(geminiApiKey, geminiModel, prompt, REVIEW_SCHEMA, signal)) as Record<string, unknown>;
  return {
    summary: String(raw.summary ?? '').trim(),
    wins: Array.isArray(raw.wins) ? raw.wins.map(String).slice(0, 3) : [],
    focus: Array.isArray(raw.focus) ? raw.focus.map(String).slice(0, 3) : [],
  };
}
