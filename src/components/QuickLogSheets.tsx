import { useEffect, useState } from 'react';
import { Sheet, Field, useToast } from './ui';
import { useStore } from '../store';
import { GeminiError, heuristicJournal, scoreJournalEntry, type JournalVerdict } from '../lib/gemini';
import { todayISO } from '../lib/date';
import type { ISODate } from '../types';

const WORKOUT_KINDS = ['Siłownia', 'Bieganie', 'Rower', 'Basen', 'Sporty drużynowe', 'Inne'];
const WORKOUT_DURATIONS = [30, 45, 60, 75, 90, 120];
const STUDY_DURATIONS = [15, 30, 45, 60, 90, 120];

/* --------------------------- trening ---------------------------- */

export function WorkoutSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date?: ISODate }) {
  const { addWorkout } = useStore();
  const toast = useToast();
  const [kind, setKind] = useState(WORKOUT_KINDS[0]);
  const [duration, setDuration] = useState(60);
  const [intensity, setIntensity] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [day, setDay] = useState<ISODate>(date ?? todayISO());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setKind(WORKOUT_KINDS[0]);
    setDuration(60);
    setIntensity(3);
    setDay(date ?? todayISO());
    setNotes('');
  }, [open, date]);

  const submit = () => {
    addWorkout({ date: day, kind, durationMinutes: duration, intensity, notes: notes || undefined });
    toast('Trening zapisany 💪');
    onClose();
  };

  return (
    <Sheet open={open} title="Zapisz trening" onClose={onClose}>
      <div className="stack">
        <Field label="Rodzaj">
          <div className="row wrap" style={{ gap: 6 }}>
            {WORKOUT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={`chip ${kind === k ? 'chip-accent' : ''}`}
                onClick={() => setKind(k)}
              >
                {k}
              </button>
            ))}
          </div>
        </Field>

        <Field label={`Czas trwania: ${duration} min`}>
          <div className="row wrap" style={{ gap: 6 }}>
            {WORKOUT_DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`chip ${duration === d ? 'chip-accent' : ''}`}
                onClick={() => setDuration(d)}
              >
                {d} min
              </button>
            ))}
          </div>
        </Field>

        <Field label={`Intensywność: ${intensity}/5`}>
          <input
            type="range"
            min={1}
            max={5}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
          />
        </Field>

        <Field label="Data">
          <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>

        <Field label="Notatka (opcjonalnie)">
          <input
            className="input"
            value={notes}
            placeholder="np. klatka + barki, PR na wyciskaniu"
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <button type="button" className="btn btn-primary btn-block" onClick={submit}>
          Zapisz trening
        </button>
      </div>
    </Sheet>
  );
}

/* ------------------------- czas nauki --------------------------- */

export function StudySheet({ open, onClose, date }: { open: boolean; onClose: () => void; date?: ISODate }) {
  const { addStudySession } = useStore();
  const toast = useToast();
  const [minutes, setMinutes] = useState(45);
  const [subject, setSubject] = useState('');
  const [day, setDay] = useState<ISODate>(date ?? todayISO());

  useEffect(() => {
    if (!open) return;
    setMinutes(45);
    setSubject('');
    setDay(date ?? todayISO());
  }, [open, date]);

  const submit = () => {
    addStudySession({ date: day, minutes, subject: subject || undefined });
    toast(`Zapisano ${minutes} min nauki`);
    onClose();
  };

  return (
    <Sheet open={open} title="Zapisz czas nauki" onClose={onClose}>
      <div className="stack">
        <Field label={`Czas: ${minutes} min`} hint="Nauka poza blokami z planu — np. spontaniczne powtórki.">
          <div className="row wrap" style={{ gap: 6 }}>
            {STUDY_DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`chip ${minutes === d ? 'chip-accent' : ''}`}
                onClick={() => setMinutes(d)}
              >
                {d} min
              </button>
            ))}
          </div>
        </Field>

        <Field label="Przedmiot (opcjonalnie)">
          <input
            className="input"
            value={subject}
            placeholder="np. Matematyka"
            onChange={(e) => setSubject(e.target.value)}
          />
        </Field>

        <Field label="Data">
          <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>

        <button type="button" className="btn btn-primary btn-block" onClick={submit}>
          Zapisz naukę
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------------------- wpis ------------------------------ */

export function JournalSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date?: ISODate }) {
  const { data, addJournalEntry } = useStore();
  const toast = useToast();
  const [text, setText] = useState('');
  const [day, setDay] = useState<ISODate>(date ?? todayISO());
  const [verdict, setVerdict] = useState<JournalVerdict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasKey = Boolean(data.settings.geminiApiKey);

  useEffect(() => {
    if (!open) return;
    setText('');
    setDay(date ?? todayISO());
    setVerdict(null);
    setError(null);
    setLoading(false);
  }, [open, date]);

  const evaluate = async () => {
    if (text.trim().length < 5) return;
    setLoading(true);
    setError(null);
    try {
      setVerdict(await scoreJournalEntry(data, text));
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : 'Nie udało się ocenić wpisu.');
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    const final = verdict ?? heuristicJournal(text);
    addJournalEntry({
      date: day,
      text: text.trim(),
      score: final.score,
      comment: final.comment,
      category: final.category,
      scoredBy: final.source,
    });
    toast(`Wpis zapisany — ocena ${final.score}/10`);
    onClose();
  };

  return (
    <Sheet open={open} title="Co dziś zrobiłeś?" onClose={onClose}>
      <div className="stack">
        <Field
          label="Opisz swój dzień"
          hint="Wszystko, co nie mieści się w zadaniach, nauce i treningach."
        >
          <textarea
            className="textarea"
            rows={5}
            value={text}
            autoFocus
            placeholder="np. ogarnąłem porządek w notatkach, pomogłem bratu z matmą, wieczorem dwie godziny w telefonie"
            onChange={(e) => {
              setText(e.target.value);
              setVerdict(null);
            }}
          />
        </Field>

        <Field label="Data">
          <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>

        {verdict && (
          <div className="card card-tight stack-sm">
            <div className="row-between">
              <span className="section-label" style={{ margin: 0 }}>Ocena dnia</span>
              <span className="chip chip-accent">{verdict.category}</span>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <span className="mono" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>
                {verdict.score}
              </span>
              <span className="dim small">na 10</span>
            </div>
            <p className="small muted">{verdict.comment}</p>
          </div>
        )}

        {error && <div className="banner banner-critical">{error}</div>}

        <div className="stack-sm">
          {hasKey && !verdict && (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={evaluate}
              disabled={loading || text.trim().length < 5}
            >
              {loading ? <><span className="spinner" /> Oceniam…</> : '✨ Oceń przez AI'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={submit}
            disabled={text.trim().length < 5 || loading}
          >
            Zapisz wpis
          </button>
        </div>
      </div>
    </Sheet>
  );
}
