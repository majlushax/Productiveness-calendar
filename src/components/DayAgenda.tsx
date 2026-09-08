import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { clockToMinutes, formatDayLabel, formatDuration, weekdayOf } from '../lib/date';
import { EmptyState, Field, Sheet, useToast } from './ui';
import type { ISODate, StudyBlock } from '../types';

const KIND_ICON: Record<string, string> = {
  school: '🎓',
  gym: '🏋️',
  work: '💼',
  other: '📌',
};

type ItemKind = 'fixed' | 'block' | 'done' | 'skipped' | 'workout' | 'session' | 'meal' | 'deadline';

/**
 * Wysokość karty rośnie z czasem trwania, żeby lekcje 8:00-12:15 nie wyglądały
 * jak trzydziestominutowy blok. Dolna granica trzyma czytelność krótkich sesji,
 * górna nie pozwala jednemu wydarzeniu zająć całego ekranu.
 */
function heightFor(minutes: number | undefined): number | undefined {
  if (!minutes) return undefined;
  return Math.max(58, Math.min(300, Math.round(40 + minutes * 0.45)));
}

interface AgendaItem {
  key: string;
  time: string;
  title: string;
  subtitle: string;
  kind: ItemKind;
  blockId?: string;
  workoutId?: string;
  sessionId?: string;
  mealId?: string;
  taskId?: string;
  /** Czas trwania w minutach — steruje wysokością karty. */
  minutes?: number;
  /** Godzina zakończenia pokazywana przy dłuższych wydarzeniach. */
  endLabel?: string;
  sortAt: number;
}

/**
 * Plan jednego dnia: stałe zajęcia, bloki nauki z planera oraz to, co zostało
 * ręcznie zapisane (treningi, czas nauki). Wszystko, co widać, da się tu
 * poprawić albo usunąć — pomyłka na telefonie zdarza się często.
 */
export function DayAgenda({ date, showFixed = true }: { date: ISODate; showFixed?: boolean }) {
  const {
    data, setBlockStatus, deleteBlock, deleteWorkout, deleteStudySession, deleteMeal, toggleTask,
  } = useStore();
  const toast = useToast();

  const [selected, setSelected] = useState<AgendaItem | null>(null);
  const [moving, setMoving] = useState<StudyBlock | null>(null);

  const items = useMemo<AgendaItem[]>(() => {
    const taskById = new Map(data.tasks.map((t) => [t.id, t]));
    const wd = weekdayOf(date);
    const out: AgendaItem[] = [];

    if (showFixed) {
      for (const e of data.fixedEvents) {
        if (e.weekday !== wd) continue;
        const minutes = clockToMinutes(e.end) - clockToMinutes(e.start);
        out.push({
          key: `fixed-${e.id}`,
          time: e.start,
          title: `${KIND_ICON[e.kind] ?? '📌'} ${e.title}`,
          subtitle: `${e.start}–${e.end} · ${formatDuration(minutes)}`,
          kind: 'fixed',
          minutes,
          endLabel: e.end,
          sortAt: clockToMinutes(e.start),
        });
      }
    }

    for (const b of data.blocks) {
      if (b.date !== date) continue;
      const task = taskById.get(b.taskId);
      const status = b.status === 'done' ? ' · zrobione' : b.status === 'skipped' ? ' · pominięte' : '';
      out.push({
        key: `block-${b.id}`,
        blockId: b.id,
        time: b.start,
        title: task?.title ?? 'Blok nauki',
        subtitle: [
          `${b.start}–${b.end}`,
          task?.subject,
          formatDuration(b.minutes),
        ].filter(Boolean).join(' · ') + status + (b.locked ? ' · przypięty' : ''),
        kind: b.status === 'done' ? 'done' : b.status === 'skipped' ? 'skipped' : 'block',
        minutes: b.minutes,
        endLabel: b.end,
        sortAt: clockToMinutes(b.start),
      });
    }

    for (const w of data.workouts) {
      if (w.date !== date) continue;
      out.push({
        key: `workout-${w.id}`,
        workoutId: w.id,
        time: '💪',
        title: w.kind,
        subtitle: [
          formatDuration(w.durationMinutes),
          `intensywność ${w.intensity}/5`,
          w.notes,
        ].filter(Boolean).join(' · '),
        kind: 'workout',
        sortAt: 24 * 60 + 1, // ręczne wpisy nie mają godziny — lądują na końcu dnia
      });
    }

    for (const s of data.studySessions) {
      if (s.date !== date) continue;
      out.push({
        key: `session-${s.id}`,
        sessionId: s.id,
        time: '📚',
        title: s.subject ? `Nauka: ${s.subject}` : 'Nauka',
        subtitle: [formatDuration(s.minutes), s.note].filter(Boolean).join(' · '),
        kind: 'session',
        sortAt: 24 * 60 + 2,
      });
    }

    for (const m of data.meals) {
      if (m.date !== date) continue;
      out.push({
        key: `meal-${m.id}`,
        mealId: m.id,
        time: '🍽',
        title: m.kind.charAt(0).toUpperCase() + m.kind.slice(1),
        subtitle: [
          m.description,
          typeof m.score === 'number' ? `zgodność ${m.score}/10` : null,
        ].filter(Boolean).join(' · '),
        kind: 'meal',
        sortAt: 24 * 60 + 3,
      });
    }

    if (data.settings.showDeadlines) {
      for (const t of data.tasks) {
        if (t.due !== date || t.status !== 'todo') continue;
        out.push({
          key: `due-${t.id}`,
          taskId: t.id,
          time: t.dueTime ?? '❗',
          title: t.title,
          subtitle: [
            'termin',
            t.subject,
            `trudność ${t.difficulty}/5`,
          ].filter(Boolean).join(' · '),
          kind: 'deadline',
          // Termin bez godziny ląduje na samej górze dnia — ma rzucać się w oczy.
          sortAt: t.dueTime ? clockToMinutes(t.dueTime) : -1,
        });
      }
    }

    return out.sort((a, b) => a.sortAt - b.sortAt);
  }, [data, date, showFixed]);

  if (!items.length) {
    return (
      <EmptyState
        icon="🗓"
        title="Pusty dzień"
        hint="Dodaj zadanie, a planer sam wstawi tu bloki nauki."
      />
    );
  }

  const openActions = (item: AgendaItem) => {
    if (item.kind === 'fixed') return; // plan tygodnia edytuje się w Ustawieniach
    setSelected(item);
  };

  const selectedTask = selected?.taskId
    ? data.tasks.find((t) => t.id === selected.taskId) ?? null
    : null;

  const remove = (item: AgendaItem) => {
    if (item.blockId) deleteBlock(item.blockId);
    else if (item.workoutId) deleteWorkout(item.workoutId);
    else if (item.sessionId) deleteStudySession(item.sessionId);
    else if (item.mealId) deleteMeal(item.mealId);
    toast('Usunięto');
    setSelected(null);
  };

  const selectedBlock = selected?.blockId
    ? data.blocks.find((b) => b.id === selected.blockId) ?? null
    : null;

  return (
    <>
      <div className="timeline">
        {items.map((item) => (
          <div className="tl-item" key={item.key}>
            <div className="tl-time">
              <span>{item.time}</span>
              {/* Godzina końca tylko przy dłuższych wydarzeniach — przy krótkich
                  byłaby szumem, a i tak nie zmieściłaby się czytelnie. */}
              {item.endLabel && (item.minutes ?? 0) >= 100 && (
                <span className="tl-time-end">{item.endLabel}</span>
              )}
            </div>
            <div
              className="tl-body"
              data-kind={item.kind}
              style={{
                minHeight: heightFor(item.minutes),
                ...(item.kind === 'workout' ? { borderLeftColor: 'var(--series-3)' }
                  : item.kind === 'meal' ? { borderLeftColor: 'var(--series-5)' }
                  : item.kind === 'deadline' ? { borderLeftColor: 'var(--critical)' }
                  : null),
              }}
            >
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <button
                  type="button"
                  className="grow"
                  style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'inherit' }}
                  onClick={() => openActions(item)}
                  aria-label={item.kind === 'fixed' ? item.title : `Opcje: ${item.title}`}
                >
                  <div className="strong" style={{ fontSize: 15 }}>{item.title}</div>
                  <div className="tiny dim">{item.subtitle}</div>
                </button>

                {item.kind === 'block' && (
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Oznacz jako zrobione"
                      onClick={() => setBlockStatus(item.blockId!, 'done')}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Pomiń blok"
                      onClick={() => setBlockStatus(item.blockId!, 'skipped')}
                    >
                      ⤫
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Sheet
        open={selected !== null}
        title={selected?.title}
        onClose={() => setSelected(null)}
      >
        {selected && selectedTask && (
          <div className="stack-sm">
            <p className="tiny dim">
              Termin: {selectedTask.due}
              {selectedTask.dueTime ? `, ${selectedTask.dueTime}` : ''} ·
              {' '}szacowany czas {formatDuration(selectedTask.estimatedMinutes)}
            </p>
            {selectedTask.reasoning && (
              <div className="banner">{selectedTask.reasoning}</div>
            )}
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => {
                toggleTask(selectedTask.id);
                toast('Zadanie zrobione 🎉');
                setSelected(null);
              }}
            >
              ✓ Oznacz zadanie jako zrobione
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setSelected(null)}>
              Anuluj
            </button>
          </div>
        )}

        {selected && !selectedTask && (
          <div className="stack-sm">
            <p className="tiny dim">{selected.subtitle}</p>

            {selectedBlock && (
              <>
                {selectedBlock.status !== 'planned' && (
                  <button
                    type="button"
                    className="btn btn-block"
                    onClick={() => {
                      setBlockStatus(selectedBlock.id, 'planned');
                      setSelected(null);
                    }}
                  >
                    ↩︎ Przywróć jako zaplanowane
                  </button>
                )}
                {selectedBlock.status === 'planned' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      onClick={() => {
                        setBlockStatus(selectedBlock.id, 'done');
                        toast('Zrobione 👊');
                        setSelected(null);
                      }}
                    >
                      ✓ Zrobione
                    </button>
                    <button
                      type="button"
                      className="btn btn-block"
                      onClick={() => {
                        setMoving(selectedBlock);
                        setSelected(null);
                      }}
                    >
                      🕘 Przesuń na inną porę
                    </button>
                  </>
                )}
              </>
            )}

            <button type="button" className="btn btn-danger btn-block" onClick={() => remove(selected)}>
              Usuń
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setSelected(null)}>
              Anuluj
            </button>
          </div>
        )}
      </Sheet>

      <MoveBlockSheet block={moving} onClose={() => setMoving(null)} />
    </>
  );
}

/**
 * Ręczne przesunięcie bloku przypina go na stałe — kolejne przeliczenie
 * grafiku układa resztę wokół niego, zamiast wracać do swojej propozycji.
 */
function MoveBlockSheet({ block, onClose }: { block: StudyBlock | null; onClose: () => void }) {
  const { data, moveBlock } = useStore();
  const toast = useToast();
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');

  // Pola startują od aktualnych wartości bloku przy każdym otwarciu.
  const current = block ? `${block.id}` : '';
  const [initialised, setInitialised] = useState('');
  if (block && initialised !== current) {
    setInitialised(current);
    setDate(block.date);
    setStart(block.start);
  }

  if (!block) return null;

  const task = data.tasks.find((t) => t.id === block.taskId);
  const endMinutes = clockToMinutes(start || block.start) + block.minutes;
  const end = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
  const collides = data.blocks.some(
    (b) => b.id !== block.id && b.date === date && b.status === 'planned' &&
      clockToMinutes(b.start) < endMinutes && clockToMinutes(start) < clockToMinutes(b.end),
  );
  const afterDue = task && date > task.due;

  return (
    <Sheet open title="Przesuń blok" onClose={onClose}>
      <div className="stack">
        <div className="card card-tight">
          <div className="strong">{task?.title ?? 'Blok nauki'}</div>
          <div className="tiny dim">
            {formatDuration(block.minutes)}
            {task ? ` · termin ${task.due}` : ''}
          </div>
        </div>

        <Field label="Dzień">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="Początek" hint={`Koniec wypadnie o ${end}.`}>
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>

        {collides && (
          <div className="banner banner-warning">
            O tej porze masz już inny blok nauki. Możesz przesunąć mimo to — planer
            nie będzie później ruszał żadnego z nich.
          </div>
        )}
        {afterDue && (
          <div className="banner banner-critical">
            To już po terminie zadania ({task?.due}).
          </div>
        )}

        <p className="tiny dim">
          Po przesunięciu blok zostaje przypięty do tej pory i przeliczanie grafiku
          go nie ruszy. Żeby oddać go planerowi, usuń go i przelicz grafik od nowa.
        </p>

        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => {
            moveBlock(block.id, date, start);
            toast(`Przesunięto na ${formatDayLabel(date)}, ${start}`);
            onClose();
          }}
        >
          Przesuń i przypnij
        </button>
      </div>
    </Sheet>
  );
}
