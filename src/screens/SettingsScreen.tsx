import { useRef, useState } from 'react';
import { useStore } from '../store';
import { TimetableEditor } from './TimetableEditor';
import { ConfirmButton, Field, Segmented, StepperRow, useToast } from '../components/ui';
import { GeminiError, listModels, testConnection, type ModelInfo } from '../lib/gemini';
import { exportJSON, importJSON } from '../lib/storage';
import { buildICS, DEFAULT_ICS_OPTIONS, shareOrDownload } from '../lib/ics';
import { todayISO } from '../lib/date';
import type { Settings } from '../types';

export function SettingsScreen() {
  const { data, updateSettings, replaceAll, resetAll, replan } = useStore();
  const toast = useToast();
  const s = data.settings;

  const [view, setView] = useState<'main' | 'timetable'>('main');
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [busy, setBusy] = useState<'test' | 'models' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (view === 'timetable') return <TimetableEditor onBack={() => setView('main')} />;

  const set = (patch: Partial<Settings>) => updateSettings(patch);

  const runTest = async () => {
    setBusy('test');
    try {
      await testConnection(s.geminiApiKey, s.geminiModel);
      toast('Połączenie działa ✅');
    } catch (err) {
      toast(err instanceof GeminiError ? err.message : 'Test nie powiódł się');
    } finally {
      setBusy(null);
    }
  };

  const fetchModels = async () => {
    setBusy('models');
    try {
      const list = await listModels(s.geminiApiKey);
      setModels(list);
      toast(`Znaleziono ${list.length} modeli`);
    } catch (err) {
      toast(err instanceof GeminiError ? err.message : 'Nie udało się pobrać listy');
    } finally {
      setBusy(null);
    }
  };

  const doExport = async () => {
    const where = await shareOrDownload(
      `kalendarz-kopia-${todayISO()}.json`,
      exportJSON(data),
      'application/json',
    );
    toast(where === 'shared' ? 'Zapisz plik w Plikach albo wyślij sobie' : 'Kopia pobrana');
  };

  const doExportIcs = async () => {
    await shareOrDownload('plan-nauki.ics', buildICS(data, DEFAULT_ICS_OPTIONS), 'text/calendar');
    toast('Wybierz Kalendarz w oknie udostępniania');
  };

  const doImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        replaceAll(importJSON(String(reader.result)));
        toast('Dane wczytane');
      } catch {
        toast('Nieprawidłowy plik kopii');
      }
    };
    reader.readAsText(file);
  };

  const weightsTotal =
    s.weights.tasks + s.weights.study + s.weights.workout + s.weights.meals + s.weights.journal;

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Ustawienia</h1>
          <div className="screen-subtitle">Wszystko zapisuje się na tym telefonie</div>
        </div>
      </header>

      <div className="stack-lg">
        {/* ------------------------------ AI ------------------------------ */}
        <section className="card stack">
          <div className="section-label" style={{ margin: 0 }}>Gemini (AI)</div>

          <Field
            label="Klucz API"
            hint="Zapisany tylko w tej przeglądarce. Nie trafia na żaden serwer poza Google."
          >
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                type={showKey ? 'text' : 'password'}
                value={s.geminiApiKey}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="AIza…"
                onChange={(e) => set({ geminiApiKey: e.target.value.trim() })}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={showKey ? 'Ukryj klucz' : 'Pokaż klucz'}
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? '🙈' : '👁'}
              </button>
            </div>
          </Field>

          <p className="tiny dim">
            Klucz wyrobisz za darmo na{' '}
            <a className="link" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              aistudio.google.com/apikey
            </a>. Bez klucza aplikacja działa, ale ocenia zadania lokalną heurystyką.
          </p>

          <Field label="Model">
            {models ? (
              <select className="select" value={s.geminiModel} onChange={(e) => set({ geminiModel: e.target.value })}>
                {models.map((m) => (
                  <option key={m.name} value={m.name}>{m.displayName}</option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={s.geminiModel}
                onChange={(e) => set({ geminiModel: e.target.value.trim() })}
              />
            )}
          </Field>

          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost grow"
              onClick={fetchModels}
              disabled={!s.geminiApiKey || busy !== null}
            >
              {busy === 'models' ? <span className="spinner" /> : 'Pobierz modele'}
            </button>
            <button
              type="button"
              className="btn btn-ghost grow"
              onClick={runTest}
              disabled={!s.geminiApiKey || busy !== null}
            >
              {busy === 'test' ? <span className="spinner" /> : 'Testuj'}
            </button>
          </div>
        </section>

        {/* ----------------------- personalizacja AI ---------------------- */}
        <section className="card stack">
          <div className="section-label" style={{ margin: 0 }}>Twoje wytyczne dla AI</div>
          <p className="tiny dim">
            Doklejane do każdego zapytania — oceny zadań, wpisów, posiłków i podsumowań
            tygodnia. Napisz, co AI ma o Tobie wiedzieć i jak ma Cię oceniać.
          </p>
          <textarea
            className="textarea"
            rows={5}
            value={s.aiInstructions}
            placeholder={'np. Jestem w 3 klasie liceum, profil mat-fiz.\nNie owijaj w bawełnę, wolę krótko i konkretnie.\nTrening liczy się dla mnie tak samo jak nauka.'}
            onChange={(e) => set({ aiInstructions: e.target.value })}
          />
          {s.aiInstructions.trim().length > 0 && (
            <span className="tiny dim">{s.aiInstructions.trim().length} znaków</span>
          )}
        </section>

        <section className="card stack">
          <div className="section-label" style={{ margin: 0 }}>Dieta</div>
          <p className="tiny dim">
            Na tej podstawie AI ocenia posiłki. Opisz swoje zasady własnymi słowami —
            model porównuje jedzenie do tego opisu, a nie do ogólnych wyobrażeń
            o zdrowym odżywianiu.
          </p>
          <textarea
            className="textarea"
            rows={4}
            value={s.dietDescription}
            placeholder={'np. Jem dużo mięsa: steki, wołowina, jajka.\nDo tego ziemniaki, ryż, owoce i warzywa.\nUnikam fast foodów, słodyczy i słodkich napojów.'}
            onChange={(e) => set({ dietDescription: e.target.value })}
          />
          {!s.dietDescription.trim() && (
            <div className="banner">
              Bez opisu diety posiłki dostają prostą ocenę lokalną opartą na słowach
              kluczowych. Wpisz swoje zasady, żeby oceniało je AI.
            </div>
          )}
        </section>

        {/* -------------------------- plan tygodnia ----------------------- */}
        <section className="card stack-sm">
          <div className="section-label" style={{ margin: 0 }}>Plan tygodnia</div>
          <p className="tiny dim">
            {data.fixedEvents.length === 0
              ? 'Nie masz jeszcze wpisanych stałych zajęć — planer zakłada, że cały dzień jest wolny.'
              : `${data.fixedEvents.length} stałych zajęć w tygodniu.`}
          </p>
          <button type="button" className="btn btn-block" onClick={() => setView('timetable')}>
            🎓 Edytuj plan lekcji i stałe zajęcia
          </button>
        </section>

        {/* --------------------------- dostępność ------------------------- */}
        <section className="card stack">
          <div className="section-label" style={{ margin: 0 }}>Kiedy mogę planować naukę</div>

          <div className="stack-sm">
            <span className="field-label">Dni powszednie</span>
            <div className="row" style={{ gap: 10 }}>
              <input
                className="input"
                type="time"
                value={s.availability.weekday.start}
                onChange={(e) => set({ availability: { ...s.availability, weekday: { ...s.availability.weekday, start: e.target.value } } })}
              />
              <span className="dim">–</span>
              <input
                className="input"
                type="time"
                value={s.availability.weekday.end}
                onChange={(e) => set({ availability: { ...s.availability, weekday: { ...s.availability.weekday, end: e.target.value } } })}
              />
            </div>
          </div>

          <div className="stack-sm">
            <span className="field-label">Weekend</span>
            <div className="row" style={{ gap: 10 }}>
              <input
                className="input"
                type="time"
                value={s.availability.weekend.start}
                onChange={(e) => set({ availability: { ...s.availability, weekend: { ...s.availability.weekend, start: e.target.value } } })}
              />
              <span className="dim">–</span>
              <input
                className="input"
                type="time"
                value={s.availability.weekend.end}
                onChange={(e) => set({ availability: { ...s.availability, weekend: { ...s.availability.weekend, end: e.target.value } } })}
              />
            </div>
          </div>
        </section>

        {/* ------------------------------ cele ---------------------------- */}
        <section className="card stack">
          <div className="section-label" style={{ margin: 0 }}>Cele</div>
          <StepperRow
            label="Treningi tygodniowo"
            value={s.goals.workoutsPerWeek}
            min={0}
            max={14}
            onChange={(v) => set({ goals: { ...s.goals, workoutsPerWeek: v } })}
          />
          <StepperRow
            label="Nauka dziennie"
            value={s.goals.studyMinutesPerDay}
            step={15}
            min={0}
            max={600}
            suffix="min"
            onChange={(v) => set({ goals: { ...s.goals, studyMinutesPerDay: v } })}
          />
          <StepperRow
            label="Punkty za zadania dziennie"
            value={s.goals.taskPointsPerDay}
            min={1}
            max={30}
            hint="Punkt = trudność zadania. Zrobiona rozprawka (4/5) to 4 punkty."
            onChange={(v) => set({ goals: { ...s.goals, taskPointsPerDay: v } })}
          />
          <StepperRow
            label="Posiłki dziennie"
            value={s.goals.mealsPerDay}
            min={1}
            max={8}
            hint="Mianownik oceny jedzenia: cel to liczba posiłków razy 10 punktów."
            onChange={(v) => set({ goals: { ...s.goals, mealsPerDay: v } })}
          />
          <StepperRow
            label="Próg serii"
            value={s.streakThreshold}
            step={5}
            min={10}
            max={95}
            suffix="/100"
            hint="Wynik dnia od tej wartości przedłuża serię."
            onChange={(v) => set({ streakThreshold: v })}
          />
        </section>

        {/* ---------------------------- planer ---------------------------- */}
        <section className="card stack">
          <div className="section-label" style={{ margin: 0 }}>Planer</div>
          <StepperRow
            label="Najkrótsza sesja"
            value={s.minBlockMinutes}
            step={5}
            min={10}
            max={90}
            suffix="min"
            onChange={(v) => set({ minBlockMinutes: v })}
          />
          <StepperRow
            label="Najdłuższa sesja"
            value={s.maxBlockMinutes}
            step={15}
            min={30}
            max={240}
            suffix="min"
            onChange={(v) => set({ maxBlockMinutes: v })}
          />
          <StepperRow
            label="Przerwa między sesjami"
            value={s.breakMinutes}
            step={5}
            min={0}
            max={60}
            suffix="min"
            onChange={(v) => set({ breakMinutes: v })}
          />
          <StepperRow
            label="Zapas przed terminem"
            value={s.bufferDays}
            min={0}
            max={7}
            suffix="dni"
            hint="Planer stara się skończyć zadanie tyle dni przed terminem."
            onChange={(v) => set({ bufferDays: v })}
          />
          <StepperRow
            label="Limit nauki na dzień"
            value={s.dailyCapMinutes}
            step={30}
            min={60}
            max={600}
            suffix="min"
            onChange={(v) => set({ dailyCapMinutes: v })}
          />
          <button type="button" className="btn btn-ghost btn-block" onClick={() => { replan(); toast('Grafik przeliczony'); }}>
            🔄 Przelicz grafik
          </button>
        </section>

        {/* --------------------------- wagi wyniku ------------------------ */}
        <section className="card stack">
          <div className="section-label" style={{ margin: 0 }}>Wagi wskaźnika</div>
          <p className="tiny dim">
            Ile każda kategoria waży w dziennym wyniku. Suma: {weightsTotal} — wartości
            są przeliczane proporcjonalnie, więc nie musi wynosić dokładnie 100.
            Jedzenie i wpisy liczą się tylko w dni, w których coś zapisałeś; w pozostałe
            ich waga rozkłada się na resztę kategorii.
          </p>
          {([
            ['tasks', 'Zadania', 'var(--series-1)'],
            ['study', 'Nauka', 'var(--series-2)'],
            ['workout', 'Siłownia', 'var(--series-3)'],
            ['meals', 'Jedzenie', 'var(--series-5)'],
            ['journal', 'Wpisy', 'var(--series-4)'],
          ] as const).map(([key, label, color]) => (
            <div className="stack-sm" key={key}>
              <div className="row-between small">
                <span className="row" style={{ gap: 8 }}>
                  <span className="dot" style={{ background: color }} />
                  <span className="muted">{label}</span>
                </span>
                <span className="mono strong">{s.weights[key]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                step={5}
                value={s.weights[key]}
                onChange={(e) => set({ weights: { ...s.weights, [key]: Number(e.target.value) } })}
              />
            </div>
          ))}
        </section>

        {/* ---------------------------- wygląd ---------------------------- */}
        <section className="card stack-sm">
          <div className="section-label" style={{ margin: 0 }}>Wygląd</div>
          <Segmented
            value={s.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { value: 'dark', label: 'Ciemny' },
              { value: 'light', label: 'Jasny' },
              { value: 'auto', label: 'Systemowy' },
            ]}
          />
        </section>

        {/* ----------------------------- dane ----------------------------- */}
        <section className="card stack-sm">
          <div className="section-label" style={{ margin: 0 }}>Kopia zapasowa</div>
          <p className="tiny dim">
            Dane siedzą wyłącznie w pamięci Safari. Wyczyszczenie danych przeglądarki
            albo zmiana telefonu je kasuje — rób kopię co jakiś czas.
          </p>
          <button type="button" className="btn btn-block" onClick={doExport}>
            💾 Zapisz kopię (JSON)
          </button>
          <button type="button" className="btn btn-block" onClick={() => fileRef.current?.click()}>
            📥 Wczytaj kopię
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) doImport(file);
              e.target.value = '';
            }}
          />
          <button type="button" className="btn btn-block" onClick={doExportIcs}>
            📤 Eksportuj plan do .ics
          </button>
          <ConfirmButton
            className="btn btn-danger btn-block"
            label="Wyczyść wszystkie dane"
            confirmLabel="Na pewno? Dotknij ponownie"
            onConfirm={() => { resetAll(); toast('Dane wyczyszczone'); }}
          />
        </section>

        <section className="card stack-sm">
          <div className="section-label" style={{ margin: 0 }}>O aplikacji</div>
          <p className="tiny dim">
            Kalendarz Produktywności · wersja 1.0 · aplikacja prywatna, działa offline.
            Żeby mieć ją na ekranie początkowym: w Safari dotknij Udostępnij →
            „Dodaj do ekranu początkowego".
          </p>
        </section>
      </div>
    </div>
  );
}
