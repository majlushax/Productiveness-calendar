import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { DayAgenda } from '../components/DayAgenda';
import { useToast } from '../components/ui';
import { AddTaskSheet } from '../components/AddTaskSheet';
import { buildICS, DEFAULT_ICS_OPTIONS, shareOrDownload } from '../lib/ics';
import {
  DAY_NAMES_SHORT, formatDate, formatDayLabel, fromISO, monthGrid, monthTitle, todayISO,
} from '../lib/date';
import { scoreDay } from '../lib/productivity';
import { scoreColor } from '../components/charts';

export function CalendarScreen() {
  const { data } = useStore();
  const toast = useToast();
  const today = todayISO();

  const [selected, setSelected] = useState(today);
  const [cursor, setCursor] = useState(() => {
    const d = fromISO(today);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [addOpen, setAddOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);

  /** Znaczniki pod numerem dnia: nauka, termin, trening. */
  const marks = useMemo(() => {
    const map = new Map<string, string[]>();
    const push = (date: string, color: string) => {
      const list = map.get(date) ?? [];
      if (!list.includes(color)) list.push(color);
      map.set(date, list);
    };
    for (const b of data.blocks) {
      if (b.status !== 'skipped') push(b.date, 'var(--series-2)');
    }
    for (const t of data.tasks) {
      if (t.status === 'todo') push(t.due, 'var(--critical)');
    }
    for (const w of data.workouts) push(w.date, 'var(--series-3)');
    return map;
  }, [data]);

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const selectedScore = useMemo(() => scoreDay(data, selected), [data, selected]);
  const isPastOrToday = selected <= today;

  const exportIcs = async () => {
    setExporting(true);
    try {
      const content = buildICS(data, DEFAULT_ICS_OPTIONS);
      const where = await shareOrDownload('plan-nauki.ics', content, 'text/calendar');
      toast(where === 'shared' ? 'Wybierz Kalendarz w oknie udostępniania' : 'Pobrano plik .ics');
    } catch {
      toast('Nie udało się wyeksportować kalendarza');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Kalendarz</h1>
          <div className="screen-subtitle">{monthTitle(cursor.year, cursor.month)}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="icon-btn" aria-label="Poprzedni miesiąc" onClick={() => shift(-1)}>‹</button>
          <button type="button" className="icon-btn" aria-label="Następny miesiąc" onClick={() => shift(1)}>›</button>
        </div>
      </header>

      <div className="stack-lg">
        <section className="card">
          <div className="cal-grid">
            {DAY_NAMES_SHORT.map((d) => (
              <div className="cal-head" key={d}>{d}</div>
            ))}
          </div>

          <div className="cal-grid">
            {weeks.flat().map((date) => {
              const outside = fromISO(date).getMonth() !== cursor.month;
              const dayMarks = marks.get(date) ?? [];
              return (
                <button
                  key={date}
                  type="button"
                  className="cal-day"
                  data-outside={outside}
                  data-today={date === today}
                  data-selected={date === selected}
                  aria-label={formatDate(date)}
                  onClick={() => setSelected(date)}
                >
                  <span className="cal-day-num">{fromISO(date).getDate()}</span>
                  <span className="cal-marks">
                    {dayMarks.slice(0, 3).map((color) => (
                      <span key={color} className="cal-mark" style={{ background: color }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="legend" style={{ marginTop: 12 }}>
            <span className="legend-item"><span className="dot" style={{ background: 'var(--series-2)' }} /> nauka</span>
            <span className="legend-item"><span className="dot" style={{ background: 'var(--critical)' }} /> termin</span>
            <span className="legend-item"><span className="dot" style={{ background: 'var(--series-3)' }} /> trening</span>
          </div>
        </section>

        <section className="stack-sm">
          <div className="row-between">
            <div className="section-label" style={{ margin: 0 }}>{formatDayLabel(selected)}</div>
            {isPastOrToday && (
              <span className="chip" style={{ color: scoreColor(selectedScore.total) }}>
                wynik {selectedScore.total}/100
              </span>
            )}
          </div>
          <DayAgenda date={selected} />
        </section>

        <section className="stack-sm">
          <button type="button" className="btn btn-primary btn-block" onClick={() => setAddOpen(true)}>
            + Nowe zadanie
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={exportIcs} disabled={exporting}>
            {exporting ? <><span className="spinner" /> Przygotowuję…</> : '📤 Wyślij plan do Kalendarza Apple'}
          </button>
          <p className="tiny dim center">
            Eksport tworzy plik .ics z blokami nauki i terminami. Na iPhonie wybierz
            „Kalendarz" w oknie udostępniania.
          </p>
        </section>
      </div>

      <AddTaskSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
