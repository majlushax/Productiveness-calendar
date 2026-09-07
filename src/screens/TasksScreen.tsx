import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { AddTaskSheet } from '../components/AddTaskSheet';
import { ConfirmButton, EmptyState, Field, Segmented, Sheet, useToast } from '../components/ui';
import {
  formatDate, formatDayLabel, formatDuration, formatDueLabel, plural, todayISO,
} from '../lib/date';
import type { Difficulty, Task } from '../types';

type Filter = 'todo' | 'done';

export function TasksScreen() {
  const { data, toggleTask, replan, warnings } = useStore();
  const toast = useToast();
  const today = todayISO();

  const [filter, setFilter] = useState<Filter>('todo');
  const [addOpen, setAddOpen] = useState(false);
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const tasks = useMemo(() => {
    const list = data.tasks.filter((t) => t.status === filter);
    return filter === 'todo'
      ? list.sort((a, b) => (a.due === b.due ? b.difficulty - a.difficulty : a.due < b.due ? -1 : 1))
      : list.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  }, [data.tasks, filter]);

  const totalRemaining = data.tasks
    .filter((t) => t.status === 'todo')
    .reduce((sum, t) => sum + t.estimatedMinutes, 0);

  const doReplan = () => {
    const result = replan();
    toast(result.length ? `Przeplanowano — ${result.length} ${plural(result.length, 'uwaga', 'uwagi', 'uwag')}` : 'Grafik przeliczony');
  };

  // Widok szczegółów musi czytać świeże dane po każdej zmianie w store.
  const current = openTask ? data.tasks.find((t) => t.id === openTask.id) ?? null : null;

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Zadania</h1>
          <div className="screen-subtitle">
            {totalRemaining > 0
              ? `${formatDuration(totalRemaining)} pracy przed Tobą`
              : 'Wszystko ogarnięte'}
          </div>
        </div>
        <button type="button" className="icon-btn" aria-label="Dodaj zadanie" onClick={() => setAddOpen(true)}>
          +
        </button>
      </header>

      <div className="stack-lg">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'todo', label: `Do zrobienia (${data.tasks.filter((t) => t.status === 'todo').length})` },
            { value: 'done', label: `Zrobione (${data.tasks.filter((t) => t.status === 'done').length})` },
          ]}
        />

        {filter === 'todo' && warnings.length > 0 && (
          <div className="banner banner-warning stack-sm">
            <div className="strong">Planer ma uwagi:</div>
            {warnings.slice(0, 4).map((w) => (
              <div key={`${w.taskId}-${w.kind}`}>• {w.taskTitle}: {w.message}</div>
            ))}
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="card card-flat">
            <EmptyState
              icon={filter === 'todo' ? '🎯' : '📦'}
              title={filter === 'todo' ? 'Brak zadań' : 'Nic jeszcze nie ukończone'}
              hint={filter === 'todo' ? 'Dodaj zadanie zwykłym zdaniem — AI oceni trudność i wstawi je w grafik.' : undefined}
            />
          </div>
        ) : (
          <div className="list">
            {tasks.map((task) => {
              const overdue = task.status === 'todo' && task.due < today;
              const plannedBlocks = data.blocks.filter((b) => b.taskId === task.id && b.status === 'planned');
              const nextBlock = plannedBlocks.sort((a, b) => (a.date < b.date ? -1 : 1))[0];

              return (
                <div className="list-row" key={task.id}>
                  <button
                    type="button"
                    className="check"
                    data-checked={task.status === 'done'}
                    aria-label={`Przełącz "${task.title}"`}
                    onClick={() => toggleTask(task.id)}
                  >
                    ✓
                  </button>

                  <button
                    type="button"
                    className="grow"
                    style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0, color: 'inherit' }}
                    onClick={() => setOpenTask(task)}
                  >
                    <div
                      className="strong"
                      style={{
                        fontSize: 15,
                        textDecoration: task.status === 'done' ? 'line-through' : undefined,
                        opacity: task.status === 'done' ? 0.6 : 1,
                      }}
                    >
                      {task.title}
                    </div>
                    <div className="tiny dim">
                      {task.subject ? `${task.subject} · ` : ''}
                      <span style={{ color: overdue ? 'var(--critical)' : undefined }}>
                        {task.status === 'done' ? 'zrobione' : formatDueLabel(task.due)}
                      </span>
                      {task.status === 'todo' && nextBlock ? ` · start ${formatDayLabel(nextBlock.date)} ${nextBlock.start}` : ''}
                    </div>
                  </button>

                  <span className="chip">{formatDuration(task.estimatedMinutes)}</span>
                </div>
              );
            })}
          </div>
        )}

        {filter === 'todo' && data.tasks.some((t) => t.status === 'todo') && (
          <button type="button" className="btn btn-ghost btn-block" onClick={doReplan}>
            🔄 Przelicz grafik od nowa
          </button>
        )}
      </div>

      <AddTaskSheet open={addOpen} onClose={() => setAddOpen(false)} />
      <TaskDetailSheet task={current} onClose={() => setOpenTask(null)} />
    </div>
  );
}

/* ----------------------- szczegóły zadania ----------------------- */

function TaskDetailSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { data, updateTask, deleteTask, toggleTask } = useStore();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  if (!task) return null;

  const blocks = data.blocks
    .filter((b) => b.taskId === task.id)
    .sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date < b.date ? -1 : 1));
  const plannedMinutes = blocks.filter((b) => b.status !== 'skipped').reduce((s, b) => s + b.minutes, 0);
  const doneMinutes = blocks.filter((b) => b.status === 'done').reduce((s, b) => s + b.minutes, 0);

  return (
    <Sheet open onClose={() => { setEditing(false); onClose(); }} title={task.title}>
      <div className="stack">
        <div className="row wrap" style={{ gap: 6 }}>
          {task.subject && <span className="chip">{task.subject}</span>}
          <span className="chip">trudność {task.difficulty}/5</span>
          <span className="chip">⏱ {formatDuration(task.estimatedMinutes)}</span>
          <span className="chip">📅 {formatDate(task.due)}</span>
          <span className={`chip ${task.estimatedBy === 'ai' ? 'chip-accent' : ''}`}>
            {task.estimatedBy === 'ai' ? '✨ oceniło AI' : task.estimatedBy === 'manual' ? 'ustawione ręcznie' : 'ocena lokalna'}
          </span>
        </div>

        {task.reasoning && (
          <div className="banner">
            <span className="strong">Dlaczego taka ocena: </span>{task.reasoning}
          </div>
        )}

        <div className="card card-tight stack-sm">
          <div className="section-label" style={{ margin: 0 }}>Postęp</div>
          <div className="row-between small">
            <span className="muted">Zrobione sesje</span>
            <span className="mono strong">{formatDuration(doneMinutes)} / {formatDuration(plannedMinutes)}</span>
          </div>
          {blocks.length === 0 ? (
            <p className="tiny dim">Brak zaplanowanych sesji — użyj „Przelicz grafik".</p>
          ) : (
            <div className="stack-sm">
              {blocks.map((b) => (
                <div className="row-between tiny" key={b.id}>
                  <span className="muted">
                    {formatDayLabel(b.date)} · {b.start}–{b.end}
                  </span>
                  <span className={b.status === 'done' ? 'chip chip-good' : b.status === 'skipped' ? 'chip chip-critical' : 'chip'}>
                    {b.status === 'done' ? 'zrobione' : b.status === 'skipped' ? 'pominięte' : 'zaplanowane'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {editing && (
          <div className="stack-sm">
            <Field label="Tytuł">
              <input
                className="input"
                value={task.title}
                onChange={(e) => updateTask(task.id, { title: e.target.value })}
              />
            </Field>
            <Field label="Termin">
              <input
                className="input"
                type="date"
                value={task.due}
                onChange={(e) => updateTask(task.id, { due: e.target.value })}
              />
            </Field>
            <Field label={`Trudność: ${task.difficulty}/5`}>
              <input
                type="range"
                min={1}
                max={5}
                value={task.difficulty}
                onChange={(e) => updateTask(task.id, { difficulty: Number(e.target.value) as Difficulty, estimatedBy: 'manual' })}
              />
            </Field>
            <Field label="Szacowany czas (min)">
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={10}
                step={15}
                value={task.estimatedMinutes}
                onChange={(e) => updateTask(task.id, { estimatedMinutes: Number(e.target.value), estimatedBy: 'manual' })}
              />
            </Field>
          </div>
        )}

        <div className="stack-sm">
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => {
              toggleTask(task.id);
              toast(task.status === 'done' ? 'Cofnięto ukończenie' : 'Zadanie zrobione! 🎉');
              onClose();
            }}
          >
            {task.status === 'done' ? 'Oznacz jako niezrobione' : '✓ Oznacz jako zrobione'}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Zamknij edycję' : '✏️ Edytuj'}
          </button>
          <ConfirmButton
            className="btn btn-danger btn-block"
            label="Usuń zadanie"
            confirmLabel="Na pewno? Dotknij ponownie"
            onConfirm={() => {
              deleteTask(task.id);
              toast('Zadanie usunięte');
              onClose();
            }}
          />
        </div>
      </div>
    </Sheet>
  );
}
