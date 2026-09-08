import { useState } from 'react';
import type { DayScore } from '../types';
import { DAY_NAMES_SHORT, formatDayLabel, weekdayOf } from '../lib/date';
import { scoreLabel } from '../lib/productivity';

/** Kolor stanu dla wyniku dnia. Zawsze towarzyszy mu podpis słowny. */
export function scoreColor(score: number): string {
  if (score >= 70) return 'var(--good)';
  if (score >= 45) return 'var(--warning)';
  if (score >= 20) return 'var(--serious)';
  return 'var(--critical)';
}

export const PART_META = [
  { key: 'tasks', label: 'Zadania', color: 'var(--series-1)' },
  { key: 'study', label: 'Nauka', color: 'var(--series-2)' },
  { key: 'workout', label: 'Siłownia', color: 'var(--series-3)' },
  { key: 'journal', label: 'Wpisy', color: 'var(--series-4)' },
  { key: 'meals', label: 'Jedzenie', color: 'var(--series-5)' },
] as const;

/* --------------------------- pierścień --------------------------- */

export function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--surface-3)" strokeWidth={stroke}
        />
        {dash > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke={scoreColor(score)}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        )}
      </svg>
      <div
        style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 0,
        }}
      >
        <span
          className="mono"
          style={{ fontSize: size * 0.29, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}
        >
          {Math.round(score)}
        </span>
        <span className="tiny dim" style={{ marginTop: 2 }}>na 100</span>
      </div>
      <span className="sr-only">{`Wynik dnia ${Math.round(score)} na 100 — ${scoreLabel(score)}`}</span>
    </div>
  );
}

/* ------------------------- słupki dzienne ------------------------ */

interface ScoreBarsProps {
  scores: DayScore[];
  threshold: number;
  /** Podpisy dni pod słupkami — przy dłuższych zakresach tylko co kilka. */
  labelEvery?: number;
}

/**
 * Wynik dzień po dniu. Jedna seria, więc bez legendy — tytuł nad wykresem
 * nazywa dane. Dotknięcie słupka pokazuje dokładną wartość pod wykresem.
 */
export function ScoreBars({ scores, threshold, labelEvery = 1 }: ScoreBarsProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected !== null ? scores[selected] : null;

  return (
    <div className="stack-sm">
      <div className="bars" style={{ position: 'relative' }}>
        <div
          className="threshold-line"
          style={{ bottom: `${threshold}%` }}
          aria-hidden="true"
        />
        {scores.map((s, i) => (
          <button
            key={s.date}
            type="button"
            className="bar-col"
            aria-label={`${formatDayLabel(s.date)}: ${s.total} na 100`}
            aria-pressed={selected === i}
            onClick={() => setSelected(selected === i ? null : i)}
          >
            <div
              className="bar"
              style={{
                height: `${Math.max(2, s.total)}%`,
                background: s.total === 0 ? 'var(--surface-3)' : scoreColor(s.total),
                opacity: selected === null || selected === i ? 1 : 0.4,
              }}
            />
          </button>
        ))}
      </div>

      <div className="bar-labels">
        {scores.map((s, i) => (
          <span key={s.date} className="bar-label">
            {i % labelEvery === 0 ? DAY_NAMES_SHORT[weekdayOf(s.date) - 1] : ''}
          </span>
        ))}
      </div>

      <p className="tiny dim center" style={{ minHeight: 18 }}>
        {active
          ? `${formatDayLabel(active.date)}: ${active.total}/100 — ${scoreLabel(active.total)}`
          : `Linia to Twój próg serii (${threshold}). Dotknij słupka, żeby zobaczyć szczegóły.`}
      </p>
    </div>
  );
}

/* -------------------------- rozbicie wyniku ---------------------- */

/**
 * Z czego zrobił się dzisiejszy wynik. Segmenty mają odstęp 2px, a każdy
 * ma etykietę z liczbą — kolor nigdy nie jest jedynym nośnikiem informacji.
 */
export function Breakdown({ parts }: { parts: DayScore['parts'] }) {
  const total = PART_META.reduce((sum, p) => sum + parts[p.key], 0);

  return (
    <div className="stack-sm">
      <div className="bar-track" role="img" aria-label={`Rozbicie wyniku: ${PART_META.map((p) => `${p.label} ${parts[p.key]}`).join(', ')}`}>
        {PART_META.map((p) => {
          const value = parts[p.key];
          if (value <= 0) return null;
          return (
            <div
              key={p.key}
              className="bar-fill"
              style={{ width: `${(value / Math.max(total, 1)) * 100}%`, background: p.color }}
            />
          );
        })}
      </div>
      <div className="legend">
        {PART_META.map((p) => (
          <span key={p.key} className="legend-item">
            <span className="dot" style={{ background: p.color }} />
            {p.label}
            <span className="mono strong" style={{ color: 'var(--text)' }}>{parts[p.key]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------- pasek celu --------------------------- */

export function GoalBar({ value, goal, color }: { value: number; goal: number; color: string }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div className="bar-track" style={{ display: 'block' }}>
      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
