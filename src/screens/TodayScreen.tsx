import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Breakdown, GoalBar, ScoreRing, scoreColor } from '../components/charts';
import { DayAgenda } from '../components/DayAgenda';
import { JournalSheet, StudySheet, WorkoutSheet } from '../components/QuickLogSheets';
import { AddTaskSheet } from '../components/AddTaskSheet';
import { EmptyState } from '../components/ui';
import { currentStreak, scoreDay, scoreLabel } from '../lib/productivity';
import {
  DAY_NAMES, formatDate, formatDuration, formatDueLabel, plural, todayISO, weekdayOf,
} from '../lib/date';

export function TodayScreen() {
  const { data, toggleTask } = useStore();
  const today = todayISO();

  const [sheet, setSheet] = useState<'task' | 'workout' | 'study' | 'journal' | null>(null);

  const score = useMemo(() => scoreDay(data, today), [data, today]);
  const streak = useMemo(() => currentStreak(data, today), [data, today]);
  const { goals } = data.settings;

  const dueSoon = data.tasks
    .filter((t) => t.status === 'todo')
    .sort((a, b) => (a.due < b.due ? -1 : 1))
    .slice(0, 4);

  const todaysEntries = data.journal.filter((j) => j.date === today);
  const plannedMinutes = data.blocks
    .filter((b) => b.date === today && b.status === 'planned')
    .reduce((sum, b) => sum + b.minutes, 0);

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Dziś</h1>
          <div className="screen-subtitle">
            {DAY_NAMES[weekdayOf(today) - 1]}, {formatDate(today)}
          </div>
        </div>
        {streak > 0 && (
          <span className="chip chip-accent" title="Dni z rzędu powyżej progu">
            🔥 {streak} {plural(streak, 'dzień', 'dni', 'dni')}
          </span>
        )}
      </header>

      <div className="stack-lg">
        {/* --------------------- wskaźnik produktywności --------------------- */}
        <section className="card stack">
          <div className="row" style={{ gap: 18 }}>
            <ScoreRing score={score.total} />
            <div className="grow stack-sm">
              <div>
                <div className="strong" style={{ fontSize: 18, color: scoreColor(score.total) }}>
                  {scoreLabel(score.total)}
                </div>
                <div className="tiny dim">Wskaźnik produktywności dnia</div>
              </div>
              <div className="stack-sm tiny muted">
                <div>✅ {score.detail.tasksDone} {plural(score.detail.tasksDone, 'zadanie', 'zadania', 'zadań')} ({score.detail.taskPoints} pkt)</div>
                <div>📚 {formatDuration(score.detail.studyMinutes)} nauki</div>
                <div>💪 {score.detail.workoutsLast7}/{goals.workoutsPerWeek} treningów w 7 dni</div>
                <div>
                  📝 {score.detail.journalScore === null
                    ? 'brak wpisu'
                    : `wpis oceniony na ${score.detail.journalScore.toFixed(0)}/10`}
                </div>
              </div>
            </div>
          </div>

          <Breakdown parts={score.parts} />
        </section>

        {/* ------------------------- postęp celów -------------------------- */}
        <section className="card stack">
          <div className="section-label" style={{ margin: 0 }}>Cele</div>

          <div className="stack-sm">
            <div className="row-between small">
              <span className="muted">Nauka dziś</span>
              <span className="mono strong">
                {formatDuration(score.detail.studyMinutes)} / {formatDuration(goals.studyMinutesPerDay)}
              </span>
            </div>
            <GoalBar value={score.detail.studyMinutes} goal={goals.studyMinutesPerDay} color="var(--series-2)" />
          </div>

          <div className="stack-sm">
            <div className="row-between small">
              <span className="muted">Treningi (ostatnie 7 dni)</span>
              <span className="mono strong">
                {score.detail.workoutsLast7} / {goals.workoutsPerWeek}
              </span>
            </div>
            <GoalBar value={score.detail.workoutsLast7} goal={goals.workoutsPerWeek} color="var(--series-3)" />
          </div>

          <div className="stack-sm">
            <div className="row-between small">
              <span className="muted">Punkty za zadania</span>
              <span className="mono strong">
                {score.detail.taskPoints} / {goals.taskPointsPerDay}
              </span>
            </div>
            <GoalBar value={score.detail.taskPoints} goal={goals.taskPointsPerDay} color="var(--series-1)" />
          </div>
        </section>

        {/* ------------------------ szybkie akcje -------------------------- */}
        <section className="stack-sm">
          <div className="section-label">Dopisz do dzisiaj</div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn grow" onClick={() => setSheet('workout')}>💪 Trening</button>
            <button type="button" className="btn grow" onClick={() => setSheet('study')}>📚 Nauka</button>
            <button type="button" className="btn grow" onClick={() => setSheet('journal')}>📝 Wpis</button>
          </div>
        </section>

        {/* --------------------------- plan dnia --------------------------- */}
        <section className="stack-sm">
          <div className="row-between">
            <div className="section-label" style={{ margin: 0 }}>Plan na dziś</div>
            {plannedMinutes > 0 && (
              <span className="tiny dim">{formatDuration(plannedMinutes)} do zrobienia</span>
            )}
          </div>
          <DayAgenda date={today} />
        </section>

        {/* --------------------------- terminy ----------------------------- */}
        <section className="stack-sm">
          <div className="row-between">
            <div className="section-label" style={{ margin: 0 }}>Najbliższe terminy</div>
            <button type="button" className="btn btn-plain" onClick={() => setSheet('task')}>
              + Zadanie
            </button>
          </div>

          {dueSoon.length === 0 ? (
            <div className="card card-flat">
              <EmptyState
                icon="✨"
                title="Brak zadań"
                hint="Dodaj pierwsze — opisz je zwykłym zdaniem, resztę wyliczę."
              />
            </div>
          ) : (
            <div className="list">
              {dueSoon.map((task) => {
                const overdue = task.due < today;
                return (
                  <div className="list-row list-row-static" key={task.id}>
                    <button
                      type="button"
                      className="check"
                      data-checked="false"
                      aria-label={`Oznacz "${task.title}" jako zrobione`}
                      onClick={() => toggleTask(task.id)}
                    >
                      ✓
                    </button>
                    <div className="grow">
                      <div className="strong" style={{ fontSize: 15 }}>{task.title}</div>
                      <div className="tiny dim">
                        {task.subject ? `${task.subject} · ` : ''}
                        <span style={{ color: overdue ? 'var(--critical)' : undefined }}>
                          {formatDueLabel(task.due)}
                        </span>
                        {' · '}{formatDuration(task.estimatedMinutes)}
                      </div>
                    </div>
                    <span className="chip">{task.difficulty}/5</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ------------------------ wpisy z dzisiaj ------------------------ */}
        {todaysEntries.length > 0 && (
          <section className="stack-sm">
            <div className="section-label">Twoje wpisy</div>
            <div className="stack-sm">
              {todaysEntries.map((entry) => (
                <div className="card card-tight stack-sm" key={entry.id}>
                  <div className="row-between">
                    <span className="chip">{entry.category ?? 'wpis'}</span>
                    <span className="mono strong">{entry.score}/10</span>
                  </div>
                  <p className="small">{entry.text}</p>
                  {entry.comment && <p className="tiny dim">{entry.comment}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <AddTaskSheet open={sheet === 'task'} onClose={() => setSheet(null)} />
      <WorkoutSheet open={sheet === 'workout'} onClose={() => setSheet(null)} />
      <StudySheet open={sheet === 'study'} onClose={() => setSheet(null)} />
      <JournalSheet open={sheet === 'journal'} onClose={() => setSheet(null)} />
    </div>
  );
}
