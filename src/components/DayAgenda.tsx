import { useMemo } from 'react';
import { useStore } from '../store';
import { clockToMinutes, formatDuration, weekdayOf } from '../lib/date';
import { EmptyState } from './ui';
import type { ISODate } from '../types';

const KIND_ICON: Record<string, string> = {
  school: '🎓',
  gym: '🏋️',
  work: '💼',
  other: '📌',
};

interface AgendaItem {
  key: string;
  start: string;
  end: string;
  title: string;
  subtitle?: string;
  kind: 'fixed' | 'block' | 'done' | 'skipped';
  blockId?: string;
  sortAt: number;
}

/** Plan jednego dnia: stałe zajęcia z planu tygodnia + zaplanowane bloki nauki. */
export function DayAgenda({ date, showFixed = true }: { date: ISODate; showFixed?: boolean }) {
  const { data, setBlockStatus, deleteBlock } = useStore();

  const items = useMemo<AgendaItem[]>(() => {
    const taskById = new Map(data.tasks.map((t) => [t.id, t]));
    const wd = weekdayOf(date);

    const fixed: AgendaItem[] = showFixed
      ? data.fixedEvents
          .filter((e) => e.weekday === wd)
          .map((e) => ({
            key: `fixed-${e.id}`,
            start: e.start,
            end: e.end,
            title: `${KIND_ICON[e.kind] ?? '📌'} ${e.title}`,
            kind: 'fixed' as const,
            sortAt: clockToMinutes(e.start),
          }))
      : [];

    const blocks: AgendaItem[] = data.blocks
      .filter((b) => b.date === date)
      .map((b) => {
        const task = taskById.get(b.taskId);
        return {
          key: `block-${b.id}`,
          blockId: b.id,
          start: b.start,
          end: b.end,
          title: task?.title ?? 'Blok nauki',
          subtitle: [task?.subject, formatDuration(b.minutes)].filter(Boolean).join(' · '),
          kind: b.status === 'done' ? ('done' as const)
            : b.status === 'skipped' ? ('skipped' as const)
            : ('block' as const),
          sortAt: clockToMinutes(b.start),
        };
      });

    return [...fixed, ...blocks].sort((a, b) => a.sortAt - b.sortAt);
  }, [data, date, showFixed]);

  const workouts = data.workouts.filter((w) => w.date === date);

  if (!items.length && !workouts.length) {
    return (
      <EmptyState
        icon="🗓"
        title="Pusty dzień"
        hint="Dodaj zadanie, a planer sam wstawi tu bloki nauki."
      />
    );
  }

  return (
    <div className="timeline">
      {items.map((item) => (
        <div className="tl-item" key={item.key}>
          <div className="tl-time">{item.start}</div>
          <div className="tl-body" data-kind={item.kind}>
            <div className="row-between" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="strong" style={{ fontSize: 15 }}>{item.title}</div>
                <div className="tiny dim">
                  {item.start}–{item.end}
                  {item.subtitle ? ` · ${item.subtitle}` : ''}
                  {item.kind === 'done' ? ' · zrobione' : item.kind === 'skipped' ? ' · pominięte' : ''}
                </div>
              </div>

              {item.blockId && item.kind === 'block' && (
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

              {item.blockId && item.kind !== 'block' && item.kind !== 'fixed' && (
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setBlockStatus(item.blockId!, 'planned')}
                  >
                    Cofnij
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Usuń blok"
                    onClick={() => deleteBlock(item.blockId!)}
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {workouts.map((w) => (
        <div className="tl-item" key={w.id}>
          <div className="tl-time">💪</div>
          <div className="tl-body" style={{ borderLeftColor: 'var(--series-3)' }}>
            <div className="strong" style={{ fontSize: 15 }}>{w.kind}</div>
            <div className="tiny dim">
              {formatDuration(w.durationMinutes)} · intensywność {w.intensity}/5
              {w.notes ? ` · ${w.notes}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
