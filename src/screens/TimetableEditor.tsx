import { useState } from 'react';
import { useStore } from '../store';
import { ConfirmButton, Field, Sheet, useToast } from '../components/ui';
import { DAY_NAMES, clockToMinutes } from '../lib/date';
import type { FixedEvent, Weekday } from '../types';

const KINDS: Array<{ value: FixedEvent['kind']; label: string; icon: string }> = [
  { value: 'school', label: 'Szkoła', icon: '🎓' },
  { value: 'gym', label: 'Trening', icon: '🏋️' },
  { value: 'work', label: 'Praca', icon: '💼' },
  { value: 'other', label: 'Inne', icon: '📌' },
];

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

const emptyDraft = (weekday: Weekday) => ({
  title: '',
  weekday,
  start: '08:00',
  end: '14:30',
  kind: 'school' as FixedEvent['kind'],
});

/**
 * Stałe zajęcia tygodnia. Planer traktuje je jako czas zajęty i nigdy
 * nie wstawia w nie bloków nauki.
 */
export function TimetableEditor({ onBack }: { onBack: () => void }) {
  const { data, addFixedEvent, updateFixedEvent, deleteFixedEvent } = useStore();
  const toast = useToast();

  const [editing, setEditing] = useState<FixedEvent | null>(null);
  const [draft, setDraft] = useState<Omit<FixedEvent, 'id'> | null>(null);

  const openNew = (weekday: Weekday) => {
    setEditing(null);
    setDraft(emptyDraft(weekday));
  };

  const openEdit = (event: FixedEvent) => {
    setEditing(event);
    const { id: _id, ...rest } = event;
    setDraft(rest);
  };

  const save = () => {
    if (!draft || !draft.title.trim()) return;
    if (clockToMinutes(draft.end) <= clockToMinutes(draft.start)) {
      toast('Koniec musi być późniejszy niż początek');
      return;
    }
    if (editing) {
      updateFixedEvent(editing.id, draft);
      toast('Zapisano zmiany');
    } else {
      addFixedEvent(draft);
      toast('Dodano do planu tygodnia');
    }
    setDraft(null);
    setEditing(null);
  };

  const copyPreviousDay = (weekday: Weekday) => {
    const source = weekday === 1 ? 7 : ((weekday - 1) as Weekday);
    const events = data.fixedEvents.filter((e) => e.weekday === source);
    if (!events.length) {
      toast('Poprzedni dzień jest pusty');
      return;
    }
    for (const e of events) {
      addFixedEvent({ title: e.title, weekday, start: e.start, end: e.end, kind: e.kind });
    }
    toast(`Skopiowano ${events.length} z ${DAY_NAMES[source - 1]}`);
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <button type="button" className="btn btn-plain" onClick={onBack} style={{ marginLeft: -6 }}>
            ‹ Ustawienia
          </button>
          <h1 className="screen-title">Plan tygodnia</h1>
          <div className="screen-subtitle">Godziny, w których jesteś zajęty</div>
        </div>
      </header>

      <div className="stack-lg">
        <div className="banner">
          Planer nigdy nie wstawi nauki w te godziny. Wpisz lekcje, dojazdy i stałe
          treningi — im dokładniej, tym sensowniejszy grafik.
        </div>

        {WEEKDAYS.map((weekday) => {
          const events = data.fixedEvents
            .filter((e) => e.weekday === weekday)
            .sort((a, b) => clockToMinutes(a.start) - clockToMinutes(b.start));

          return (
            <section className="stack-sm" key={weekday}>
              <div className="row-between">
                <div className="section-label" style={{ margin: 0 }}>{DAY_NAMES[weekday - 1]}</div>
                <div className="row" style={{ gap: 4 }}>
                  {events.length === 0 && (
                    <button type="button" className="btn btn-plain" onClick={() => copyPreviousDay(weekday)}>
                      Kopiuj poprzedni
                    </button>
                  )}
                  <button type="button" className="btn btn-plain" onClick={() => openNew(weekday)}>
                    + Dodaj
                  </button>
                </div>
              </div>

              {events.length === 0 ? (
                <p className="tiny dim" style={{ padding: '0 4px' }}>Dzień wolny</p>
              ) : (
                <div className="list">
                  {events.map((e) => (
                    <button type="button" className="list-row" key={e.id} onClick={() => openEdit(e)}>
                      <span style={{ fontSize: 18 }}>{KINDS.find((k) => k.value === e.kind)?.icon}</span>
                      <div className="grow">
                        <div className="strong" style={{ fontSize: 15 }}>{e.title}</div>
                        <div className="tiny dim mono">{e.start}–{e.end}</div>
                      </div>
                      <span className="dim">›</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <Sheet
        open={draft !== null}
        title={editing ? 'Edytuj zajęcia' : 'Nowe zajęcia'}
        onClose={() => { setDraft(null); setEditing(null); }}
      >
        {draft && (
          <div className="stack">
            <Field label="Nazwa">
              <input
                className="input"
                autoFocus
                value={draft.title}
                placeholder="np. Lekcje, Trening, Dojazd"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>

            <Field label="Rodzaj">
              <div className="row wrap" style={{ gap: 6 }}>
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    className={`chip ${draft.kind === k.value ? 'chip-accent' : ''}`}
                    onClick={() => setDraft({ ...draft, kind: k.value })}
                  >
                    {k.icon} {k.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Dzień">
              <select
                className="select"
                value={draft.weekday}
                onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) as Weekday })}
              >
                {WEEKDAYS.map((w) => (
                  <option key={w} value={w}>{DAY_NAMES[w - 1]}</option>
                ))}
              </select>
            </Field>

            <div className="row" style={{ gap: 10 }}>
              <Field label="Od">
                <input
                  className="input"
                  type="time"
                  value={draft.start}
                  onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                />
              </Field>
              <Field label="Do">
                <input
                  className="input"
                  type="time"
                  value={draft.end}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                />
              </Field>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={save}
              disabled={!draft.title.trim()}
            >
              Zapisz
            </button>

            {editing && (
              <ConfirmButton
                className="btn btn-danger btn-block"
                label="Usuń"
                confirmLabel="Na pewno? Dotknij ponownie"
                onConfirm={() => {
                  deleteFixedEvent(editing.id);
                  setDraft(null);
                  setEditing(null);
                  toast('Usunięto z planu');
                }}
              />
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
