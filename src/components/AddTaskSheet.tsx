import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet, Field, useToast } from './ui';
import { useStore } from '../store';
import { heuristicEstimate } from '../lib/parse';
import { estimateTask, GeminiError } from '../lib/gemini';
import { freeCapacityUntil } from '../lib/scheduler';
import { addDays, formatDate, formatDuration, formatDueLabel, todayISO } from '../lib/date';
import type { Difficulty, TaskEstimate } from '../types';

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: 'banalne',
  2: 'łatwe',
  3: 'średnie',
  4: 'trudne',
  5: 'bardzo trudne',
};

const EXAMPLES = [
  'rozprawka z wosu na 14 września',
  'sprawdzian z matmy w piątek',
  'przeczytać 3 rozdziały lektury do 20.09',
];

export function AddTaskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, addTask } = useStore();
  const toast = useToast();

  const [text, setText] = useState('');
  const [draft, setDraft] = useState<TaskEstimate | null>(null);
  const [touched, setTouched] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasKey = Boolean(data.settings.geminiApiKey);

  useEffect(() => {
    if (!open) return;
    setText('');
    setDraft(null);
    setTouched(false);
    setShowDetails(false);
    setError(null);
    setLoading(false);
  }, [open]);

  // Podgląd lokalny liczy się natychmiast przy każdej literze — bez sieci.
  useEffect(() => {
    if (touched) return;
    setDraft(text.trim().length >= 3 ? heuristicEstimate(text) : null);
  }, [text, touched]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const runAI = async () => {
    if (!text.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const estimate = await estimateTask(data, text, controller.signal);
      setDraft(estimate);
      setTouched(true);
      setShowDetails(true);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof GeminiError ? err.message : 'Nie udało się połączyć z AI.');
    } finally {
      setLoading(false);
    }
  };

  const patchDraft = (patch: Partial<TaskEstimate>) => {
    setTouched(true);
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const due = draft?.due ?? addDays(todayISO(), 3);

  // Ostrzeżenie, zanim zadanie w ogóle trafi do planu.
  const capacity = useMemo(() => {
    if (!draft || !open) return null;
    const free = freeCapacityUntil(data, due);
    return { free, fits: free >= draft.estimatedMinutes };
  }, [data, draft, due, open]);

  const submit = () => {
    if (!draft) return;
    const task = addTask({ ...draft, due }, text.trim());
    toast(`Dodano: ${task.title}`);
    onClose();
  };

  return (
    <Sheet open={open} title="Nowe zadanie" onClose={onClose}>
      <div className="stack">
        <Field
          label="Opisz zadanie własnymi słowami"
          hint="Termin, przedmiot i typ pracy wyłapię z tekstu."
        >
          <textarea
            className="textarea"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTouched(false);
            }}
            placeholder="np. rozprawka z wosu na 14 września"
            autoFocus
            rows={3}
          />
        </Field>

        {!text && (
          <div className="row wrap" style={{ gap: 6 }}>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="chip"
                onClick={() => setText(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {draft && (
          <div className="card card-tight stack-sm">
            <div className="row-between">
              <span className="section-label" style={{ margin: 0 }}>
                {draft.source === 'ai' ? 'Ocena AI' : 'Ocena wstępna'}
              </span>
              <span className={`chip ${draft.source === 'ai' ? 'chip-accent' : ''}`}>
                {draft.source === 'ai' ? '✨ Gemini' : 'lokalna'}
              </span>
            </div>

            <div className="strong" style={{ fontSize: 17 }}>{draft.title}</div>

            <div className="row wrap" style={{ gap: 6 }}>
              {draft.subject && <span className="chip">{draft.subject}</span>}
              <span className="chip">
                {'●'.repeat(draft.difficulty)}{'○'.repeat(5 - draft.difficulty)} {DIFFICULTY_LABELS[draft.difficulty]}
              </span>
              <span className="chip">⏱ {formatDuration(draft.estimatedMinutes)}</span>
              <span className="chip">📅 {formatDate(due)} ({formatDueLabel(due)})</span>
            </div>

            <p className="tiny dim">{draft.reasoning}</p>

            {capacity && !capacity.fits && (
              <div className="banner banner-warning">
                Do terminu masz w grafiku tylko {formatDuration(capacity.free)} wolnego,
                a zadanie potrzebuje {formatDuration(draft.estimatedMinutes)}. Zaplanuję, ile się da —
                rozważ zwolnienie okna w planie tygodnia.
              </div>
            )}

            <button
              type="button"
              className="btn btn-plain"
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? 'Ukryj szczegóły' : 'Popraw szczegóły'}
            </button>

            {showDetails && (
              <div className="stack-sm">
                <Field label="Tytuł">
                  <input
                    className="input"
                    value={draft.title}
                    onChange={(e) => patchDraft({ title: e.target.value })}
                  />
                </Field>
                <Field label="Przedmiot">
                  <input
                    className="input"
                    value={draft.subject ?? ''}
                    placeholder="np. WOS"
                    onChange={(e) => patchDraft({ subject: e.target.value || undefined })}
                  />
                </Field>
                <Field label="Termin">
                  <input
                    className="input"
                    type="date"
                    value={due}
                    onChange={(e) => patchDraft({ due: e.target.value })}
                  />
                </Field>
                <Field label={`Trudność: ${draft.difficulty}/5 — ${DIFFICULTY_LABELS[draft.difficulty]}`}>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={draft.difficulty}
                    onChange={(e) => patchDraft({ difficulty: Number(e.target.value) as Difficulty })}
                  />
                </Field>
                <Field label="Szacowany czas" hint="Łączny czas pracy, planer podzieli go na sesje.">
                  <div className="row">
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min={10}
                      max={900}
                      step={15}
                      value={draft.estimatedMinutes}
                      onChange={(e) => patchDraft({ estimatedMinutes: Number(e.target.value) })}
                    />
                    <span className="muted small">min</span>
                  </div>
                </Field>
              </div>
            )}
          </div>
        )}

        {error && <div className="banner banner-critical">{error}</div>}

        <div className="stack-sm">
          {hasKey && (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={runAI}
              disabled={loading || text.trim().length < 3}
            >
              {loading ? <><span className="spinner" /> Analizuję…</> : '✨ Oceń przez AI'}
            </button>
          )}
          {!hasKey && text.trim().length >= 3 && (
            <p className="tiny dim center">
              Bez klucza Gemini używam oceny lokalnej. Klucz dodasz w Ustawieniach.
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={submit}
            disabled={!draft || loading}
          >
            Dodaj do planu
          </button>
        </div>
      </div>
    </Sheet>
  );
}
