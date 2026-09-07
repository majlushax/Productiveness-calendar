import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Breakdown, PART_META, ScoreBars, scoreColor } from '../components/charts';
import { EmptyState, Segmented, useToast } from '../components/ui';
import {
  averageScore, bestStreak, currentStreak, daysTracked, scoreRange, trendVsPrevious,
} from '../lib/productivity';
import { GeminiError, reviewWeek, type WeeklyReview } from '../lib/gemini';
import { addDays, formatDuration, plural, todayISO } from '../lib/date';

type Range = '7' | '30';

export function StatsScreen() {
  const { data } = useStore();
  const toast = useToast();
  const today = todayISO();

  const [range, setRange] = useState<Range>('7');
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [loading, setLoading] = useState(false);

  const days = Number(range);
  const scores = useMemo(
    () => scoreRange(data, addDays(today, -(days - 1)), today),
    [data, days, today],
  );

  const average = averageScore(scores);
  const trend = useMemo(() => trendVsPrevious(data, days, today), [data, days, today]);
  const streak = useMemo(() => currentStreak(data, today), [data, today]);
  const best = useMemo(() => bestStreak(data, today), [data, today]);
  const tracked = useMemo(() => daysTracked(data, today), [data, today]);

  const from = addDays(today, -(days - 1));
  const studyMinutes = scores.reduce((s, d) => s + d.detail.studyMinutes, 0);
  const workouts = data.workouts.filter((w) => w.date >= from && w.date <= today).length;
  const tasksDone = data.tasks.filter(
    (t) => t.status === 'done' && (t.completedAt ?? '').slice(0, 10) >= from,
  ).length;
  const tasksOverdue = data.tasks.filter((t) => t.status === 'todo' && t.due < today).length;

  /** Średnie udziały składników — pokazują, co realnie ciągnie wynik w górę. */
  const averageParts = useMemo(() => {
    const sum = { tasks: 0, study: 0, workout: 0, journal: 0 };
    for (const s of scores) {
      sum.tasks += s.parts.tasks;
      sum.study += s.parts.study;
      sum.workout += s.parts.workout;
      sum.journal += s.parts.journal;
    }
    const n = Math.max(1, scores.length);
    return {
      tasks: Math.round(sum.tasks / n),
      study: Math.round(sum.study / n),
      workout: Math.round(sum.workout / n),
      journal: Math.round(sum.journal / n),
    };
  }, [scores]);

  const askAI = async () => {
    setLoading(true);
    try {
      const result = await reviewWeek(data, {
        days: scores.map((s) => ({ date: s.date, score: s.total })),
        studyMinutes,
        workouts,
        tasksDone,
        tasksOverdue,
        journalNotes: data.journal
          .filter((j) => j.date >= from)
          .slice(-7)
          .map((j) => j.text.slice(0, 200)),
      });
      setReview(result);
    } catch (err) {
      toast(err instanceof GeminiError ? err.message : 'Nie udało się pobrać podsumowania');
    } finally {
      setLoading(false);
    }
  };

  if (tracked === 0) {
    return (
      <div className="screen">
        <header className="screen-header">
          <h1 className="screen-title">Statystyki</h1>
        </header>
        <div className="card card-flat">
          <EmptyState
            icon="📊"
            title="Brak danych"
            hint="Zapisz trening, czas nauki albo wpis — statystyki pojawią się od razu."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Statystyki</h1>
          <div className="screen-subtitle">
            {tracked} {plural(tracked, 'dzień', 'dni', 'dni')} historii
          </div>
        </div>
      </header>

      <div className="stack-lg">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: '7', label: '7 dni' },
            { value: '30', label: '30 dni' },
          ]}
        />

        <section className="card stack">
          <div className="row-between">
            <div>
              <div className="section-label" style={{ margin: 0 }}>Średni wynik</div>
              <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                <span
                  className="mono"
                  style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1, color: scoreColor(average) }}
                >
                  {average}
                </span>
                <span className="dim small">na 100</span>
              </div>
            </div>
            <span
              className="chip"
              style={{ color: trend > 0 ? 'var(--good)' : trend < 0 ? 'var(--critical)' : undefined }}
            >
              {trend > 0 ? '▲' : trend < 0 ? '▼' : '='} {Math.abs(trend)} vs poprzednie {days} dni
            </span>
          </div>

          <ScoreBars
            scores={scores}
            threshold={data.settings.streakThreshold}
            labelEvery={days > 7 ? 5 : 1}
          />
        </section>

        <section className="card stack-sm">
          <div className="section-label" style={{ margin: 0 }}>Seria</div>
          <div className="row-between">
            <div>
              <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                <span className="mono" style={{ fontSize: 28, fontWeight: 700 }}>🔥 {streak}</span>
                <span className="dim small">{plural(streak, 'dzień', 'dni', 'dni')} z rzędu</span>
              </div>
              <div className="tiny dim">Rekord: {best} {plural(best, 'dzień', 'dni', 'dni')}</div>
            </div>
            <span className="chip">próg {data.settings.streakThreshold}/100</span>
          </div>
        </section>

        <section className="card stack">
          <div className="section-label" style={{ margin: 0 }}>Z czego składa się wynik</div>
          <Breakdown parts={averageParts} />
          <p className="tiny dim">
            Średni wkład każdej kategorii w wynik dnia. Kategoria z niskim słupkiem
            to najprostszy sposób, żeby podnieść wskaźnik.
          </p>
        </section>

        <section className="card stack-sm">
          <div className="section-label" style={{ margin: 0 }}>Podsumowanie okresu</div>
          <div className="stack-sm">
            <StatRow label="Czas nauki" value={formatDuration(studyMinutes)} color={PART_META[1].color} />
            <StatRow label="Treningi" value={`${workouts}`} color={PART_META[2].color} />
            <StatRow label="Ukończone zadania" value={`${tasksDone}`} color={PART_META[0].color} />
            <StatRow label="Wpisy" value={`${data.journal.filter((j) => j.date >= from).length}`} color={PART_META[3].color} />
            {tasksOverdue > 0 && (
              <StatRow label="Zadania po terminie" value={`${tasksOverdue}`} color="var(--critical)" />
            )}
          </div>
        </section>

        <section className="card stack-sm">
          <div className="section-label" style={{ margin: 0 }}>Podsumowanie AI</div>

          {review ? (
            <div className="stack-sm">
              <p className="small">{review.summary}</p>
              {review.wins.length > 0 && (
                <div className="stack-sm">
                  <span className="tiny strong" style={{ color: 'var(--good)' }}>Co wyszło</span>
                  {review.wins.map((w) => <div className="small muted" key={w}>• {w}</div>)}
                </div>
              )}
              {review.focus.length > 0 && (
                <div className="stack-sm">
                  <span className="tiny strong" style={{ color: 'var(--series-2)' }}>Na czym się skupić</span>
                  {review.focus.map((f) => <div className="small muted" key={f}>• {f}</div>)}
                </div>
              )}
              <button type="button" className="btn btn-plain" onClick={() => setReview(null)}>
                Wyczyść
              </button>
            </div>
          ) : (
            <>
              <p className="tiny dim">
                AI przeanalizuje Twoje liczby z okresu i powie, co poprawić.
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={askAI}
                disabled={loading || !data.settings.geminiApiKey}
              >
                {loading ? <><span className="spinner" /> Analizuję…</> : '✨ Poproś o podsumowanie'}
              </button>
              {!data.settings.geminiApiKey && (
                <p className="tiny dim center">Wymaga klucza Gemini — dodaj go w Ustawieniach.</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="row-between small">
      <span className="row" style={{ gap: 8 }}>
        <span className="dot" style={{ background: color }} />
        <span className="muted">{label}</span>
      </span>
      <span className="mono strong">{value}</span>
    </div>
  );
}
