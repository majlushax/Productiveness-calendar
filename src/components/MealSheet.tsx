import { useEffect, useState } from 'react';
import { Sheet, Field, useToast } from './ui';
import { useStore } from '../store';
import { GeminiError, heuristicMeal, scoreMeal, type MealVerdict } from '../lib/gemini';
import { todayISO } from '../lib/date';
import type { ISODate, MealKind } from '../types';

const KINDS: MealKind[] = ['śniadanie', 'obiad', 'kolacja', 'przekąska'];

/** Domyślny typ posiłku według pory dnia — jedno kliknięcie mniej. */
function kindForNow(): MealKind {
  const h = new Date().getHours();
  if (h < 11) return 'śniadanie';
  if (h < 16) return 'obiad';
  if (h < 21) return 'kolacja';
  return 'przekąska';
}

export function MealSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date?: ISODate }) {
  const { data, addMeal } = useStore();
  const toast = useToast();

  const [kind, setKind] = useState<MealKind>('obiad');
  const [description, setDescription] = useState('');
  const [day, setDay] = useState<ISODate>(date ?? todayISO());
  const [verdict, setVerdict] = useState<MealVerdict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasKey = Boolean(data.settings.geminiApiKey);
  const hasDiet = Boolean(data.settings.dietDescription.trim());

  useEffect(() => {
    if (!open) return;
    setKind(kindForNow());
    setDescription('');
    setDay(date ?? todayISO());
    setVerdict(null);
    setError(null);
    setLoading(false);
  }, [open, date]);

  const evaluate = async () => {
    if (description.trim().length < 3) return;
    setLoading(true);
    setError(null);
    try {
      setVerdict(await scoreMeal(data, { kind, description }));
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : 'Nie udało się ocenić posiłku.');
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    const final = verdict ?? heuristicMeal(description);
    addMeal({
      date: day,
      kind,
      description: description.trim(),
      score: final.score,
      comment: final.comment,
      scoredBy: final.source,
    });
    toast(`Posiłek zapisany — ${final.score}/10`);
    onClose();
  };

  return (
    <Sheet open={open} title="Zapisz posiłek" onClose={onClose}>
      <div className="stack">
        <Field label="Rodzaj">
          <div className="row wrap" style={{ gap: 6 }}>
            {KINDS.map((k) => (
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

        <Field label="Co zjadłeś" hint="Wystarczy lista składników, bez gramatury.">
          <textarea
            className="textarea"
            rows={3}
            autoFocus
            value={description}
            placeholder="np. stek wołowy, ziemniaki, sałatka z pomidorów"
            onChange={(e) => {
              setDescription(e.target.value);
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
              <span className="section-label" style={{ margin: 0 }}>Zgodność z dietą</span>
              <span className={`chip ${verdict.source === 'ai' ? 'chip-accent' : ''}`}>
                {verdict.source === 'ai' ? '✨ Gemini' : 'lokalna'}
              </span>
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

        {!hasDiet && (
          <div className="banner">
            Opisz swoją dietę w <span className="strong">Ustawieniach → Dieta</span>, a AI
            będzie oceniać posiłki według Twoich zasad, a nie ogólnych wyobrażeń
            o zdrowym jedzeniu. Bez tego używam prostej oceny lokalnej.
          </div>
        )}

        <div className="stack-sm">
          {hasKey && hasDiet && !verdict && (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={evaluate}
              disabled={loading || description.trim().length < 3}
            >
              {loading ? <><span className="spinner" /> Oceniam…</> : '✨ Oceń przez AI'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={submit}
            disabled={description.trim().length < 3 || loading}
          >
            Zapisz posiłek
          </button>
        </div>
      </div>
    </Sheet>
  );
}
