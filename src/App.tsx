import { useEffect, useState } from 'react';
import { useStore } from './store';
import { TodayScreen } from './screens/TodayScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { TasksScreen } from './screens/TasksScreen';
import { StatsScreen } from './screens/StatsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Sheet } from './components/ui';
import { todayISO } from './lib/date';

type Tab = 'today' | 'calendar' | 'tasks' | 'stats' | 'settings';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'today', label: 'Dziś', icon: '☀️' },
  { id: 'calendar', label: 'Kalendarz', icon: '🗓' },
  { id: 'tasks', label: 'Zadania', icon: '✅' },
  { id: 'stats', label: 'Statystyki', icon: '📊' },
  { id: 'settings', label: 'Ustawienia', icon: '⚙️' },
];

const WELCOME_KEY = 'productiveness-calendar:welcomed';

export function App() {
  const { data, replan } = useStore();
  const [tab, setTab] = useState<Tab>('today');
  const [welcome, setWelcome] = useState(false);

  // Przejście między zakładkami zaczyna się od góry, jak w natywnych apkach iOS.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  // Motyw stempluje <html>, żeby CSS mógł go nadpisać w obu kierunkach.
  useEffect(() => {
    const root = document.documentElement;
    if (data.settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', data.settings.theme);
  }, [data.settings.theme]);

  // Po zmianie dnia grafik trzeba przeliczyć — inaczej wczorajsze bloki wiszą jako "dziś".
  useEffect(() => {
    const key = 'productiveness-calendar:last-plan';
    try {
      if (localStorage.getItem(key) !== todayISO()) {
        replan();
        localStorage.setItem(key, todayISO());
      }
    } catch {
      // Prywatne okno Safari — planowanie i tak zadziała, tylko bez zapamiętania daty.
    }
  }, [replan]);

  useEffect(() => {
    try {
      if (!localStorage.getItem(WELCOME_KEY)) setWelcome(true);
    } catch {
      /* pusto */
    }
  }, []);

  const closeWelcome = () => {
    setWelcome(false);
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      /* pusto */
    }
  };

  return (
    <div className="app">
      {tab === 'today' && <TodayScreen />}
      {tab === 'calendar' && <CalendarScreen />}
      {tab === 'tasks' && <TasksScreen />}
      {tab === 'stats' && <StatsScreen />}
      {tab === 'settings' && <SettingsScreen />}

      <nav className="tabbar" role="tablist" aria-label="Nawigacja">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon" aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <Sheet open={welcome} title="Cześć 👋" onClose={closeWelcome}>
        <div className="stack">
          <p className="small muted">
            Ta aplikacja robi trzy rzeczy: planuje za Ciebie naukę, liczy Twój wskaźnik
            produktywności i trzyma wszystko na tym telefonie.
          </p>

          <div className="stack-sm">
            <div className="card card-tight">
              <div className="strong small">1. Wpisz plan lekcji</div>
              <p className="tiny dim">
                Ustawienia → Plan tygodnia. Bez tego planer myśli, że masz wolne cały dzień.
              </p>
            </div>
            <div className="card card-tight">
              <div className="strong small">2. Dodaj klucz Gemini (opcjonalnie)</div>
              <p className="tiny dim">
                Darmowy na aistudio.google.com. Bez niego apka działa, tylko ocenia zadania prościej.
              </p>
            </div>
            <div className="card card-tight">
              <div className="strong small">3. Dodaj pierwsze zadanie</div>
              <p className="tiny dim">
                Zwykłym zdaniem, np. „rozprawka z wosu na 14 września". Resztę wyliczę sam.
              </p>
            </div>
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={closeWelcome}>
            Zaczynamy
          </button>
        </div>
      </Sheet>
    </div>
  );
}
