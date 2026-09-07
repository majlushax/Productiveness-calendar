# Kalendarz Produktywności

Osobista aplikacja (PWA) na iPhone'a: kalendarz z AI, który sam planuje, kiedy
zrobić zadania, i liczy dzienny wskaźnik produktywności.

## Co potrafi

- **Zadania zwykłym zdaniem.** Wpisujesz „rozprawka z wosu na 14 września", a apka
  wyciąga z tego przedmiot, termin, trudność (1–5) i realny czas pracy.
- **Automatyczne planowanie.** Planer dzieli zadanie na sesje i rozkłada je po
  wolnych oknach — omija lekcje z planu tygodnia, trzyma dzienny limit nauki
  i kończy pracę z zapasem przed terminem.
- **Wskaźnik produktywności 0–100.** Składa się z ukończonych zadań, czasu nauki,
  treningów (w oknie 7 dni) i ocenionych przez AI wpisów „co dziś zrobiłem".
- **Seria dni.** Każdy dzień powyżej ustawionego progu przedłuża streak.
- **Statystyki.** Wynik dzień po dniu, trend względem poprzedniego okresu,
  rozbicie na kategorie i podsumowanie tygodnia napisane przez AI.
- **Eksport do Kalendarza Apple.** Plik `.ics` z blokami nauki i terminami.
- **Działa offline.** Wszystkie dane siedzą na telefonie, nic nie leci na serwer.

Bez klucza API aplikacja działa w całości — po prostu ocenia zadania lokalną
heurystyką zamiast modelem.

## Instalacja na iPhonie

1. Otwórz w Safari adres aplikacji (patrz niżej — GitHub Pages).
2. Dotknij **Udostępnij** → **Dodaj do ekranu początkowego**.
3. Uruchamiaj z ikony — otworzy się na pełnym ekranie, bez paska Safari.

Musi to być Safari. Chrome na iOS nie potrafi instalować aplikacji na ekranie
początkowym.

## Uruchomienie GitHub Pages

Jednorazowo, w ustawieniach repozytorium:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Wypchnij zmiany — workflow `.github/workflows/deploy.yml` zbuduje i wgra apkę.
3. Adres: `https://<twoja-nazwa>.github.io/Productiveness-calendar/`

> Po zmianie nazwy repozytorium trzeba zaktualizować stałą `BASE`
> w `vite.config.ts` — inaczej Pages nie znajdzie plików.

## Klucz Gemini (opcjonalny)

1. Wejdź na [aistudio.google.com/apikey](https://aistudio.google.com/apikey) i wygeneruj
   klucz — darmowy limit spokojnie wystarcza do prywatnego użytku.
2. W aplikacji: **Ustawienia → Gemini → Klucz API**, wklej i dotknij **Testuj**.
3. Przycisk **Pobierz modele** wypełni listę modeli dostępnych dla Twojego klucza.

Klucz zapisuje się wyłącznie w pamięci przeglądarki na Twoim telefonie i nie
trafia do repozytorium ani na żaden serwer poza Google. Zapytania idą prosto
z telefonu do API Gemini.

## Pierwsze kroki w aplikacji

1. **Ustawienia → Plan tygodnia** — wpisz lekcje i stałe zajęcia. Bez tego planer
   zakłada, że masz wolny cały dzień.
2. **Ustawienia → Cele** — ustaw treningi na tydzień, minuty nauki dziennie i próg serii.
3. **Dziś → + Zadanie** — dodaj pierwsze zadanie i zobacz, jak wskoczy w grafik.

## Kopia zapasowa

Dane żyją w pamięci Safari. Wyczyszczenie danych przeglądarki albo zmiana telefonu
je kasuje. **Ustawienia → Kopia zapasowa → Zapisz kopię (JSON)** eksportuje wszystko
do pliku, który wczytasz z powrotem na dowolnym urządzeniu.

## Rozwój

```bash
npm install
npm run dev        # serwer deweloperski
npm test           # testy logiki (parser, planer, wskaźnik, eksport .ics)
npm run typecheck  # kontrola typów
npm run build      # build produkcyjny do dist/
```

Ikony regenerujesz przez `python3 scripts/make-icons.py` (bez zewnętrznych bibliotek).

### Jak to jest zbudowane

| Plik | Odpowiada za |
|---|---|
| `src/lib/parse.ts` | rozbiór polskiego zdania na termin, przedmiot i typ zadania |
| `src/lib/gemini.ts` | rozmowa z API Gemini, z fallbackiem do oceny lokalnej |
| `src/lib/scheduler.ts` | układanie sesji nauki w wolnych oknach grafiku |
| `src/lib/productivity.ts` | liczenie wyniku dnia i serii |
| `src/lib/ics.ts` | eksport do Kalendarza Apple |
| `src/store.tsx` | stan aplikacji i zapis do pamięci przeglądarki |

### Jak liczony jest wynik dnia

Cztery składniki, każdy z własną wagą (do zmiany w Ustawieniach):

| Składnik | Domyślna waga | Jak mierzony |
|---|---|---|
| Zadania | 35 | suma trudności zadań ukończonych tego dnia / cel dzienny |
| Nauka | 30 | minuty z zrobionych bloków i ręcznych wpisów / cel dzienny |
| Siłownia | 20 | treningi z ostatnich 7 dni / cel tygodniowy |
| Wpisy | 15 | ocena AI wpisu „co dziś zrobiłem" (0–10) |

Trening liczony jest w oknie tygodniowym, żeby dzień przerwy nie zjeżdżał wyniku
do zera. Jeśli danego dnia nie ma wpisu, jego waga rozkłada się proporcjonalnie na
pozostałe składniki — brak notatki nie karze wyniku.

## Ograniczenia

- **Brak synchronizacji z Kalendarzem Apple w obie strony.** Przeglądarka nie ma
  dostępu do EventKit. Działa jednokierunkowy eksport `.ics`.
- **Brak powiadomień push w tle.** Przypomnienia dostaniesz z Kalendarza Apple po
  zaimportowaniu pliku `.ics` — każdy blok ma alarm 10 minut wcześniej.
- **Dane tylko na jednym urządzeniu.** Przenosisz je plikiem kopii zapasowej.
