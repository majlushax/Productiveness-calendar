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
  treningów (w oknie 7 dni), zgodności posiłków z Twoją dietą i ocenionych przez AI
  wpisów „co dziś zrobiłem".
- **Jedzenie według Twoich zasad.** Opisujesz swoją dietę własnymi słowami, a AI ocenia
  każdy posiłek względem tego opisu — nie względem ogólnych wyobrażeń o zdrowym jedzeniu.
- **Własne wytyczne dla AI.** Pole na instrukcje doklejane do każdego zapytania:
  kim jesteś, jak ma z Tobą rozmawiać, co ma brać pod uwagę przy ocenach.
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

1. Repozytorium musi być **publiczne** (na darmowym planie Pages nie działa w prywatnych).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Wypchnij zmiany na gałąź domyślną — workflow `.github/workflows/deploy.yml`
   zbuduje i wgra apkę.
4. Adres: `https://<twoja-nazwa>.github.io/Productiveness-calendar/`

Publikuje wyłącznie **gałąź domyślna repozytorium**. Na pozostałych ten sam workflow
uruchamia testy i build jako zwykły check — push do gałęzi roboczej nie nadpisuje
działającej aplikacji niescalonym kodem.

> Warunek w workflow czyta gałąź domyślną z repozytorium, zamiast wpisywać `main`
> na sztywno. Środowisko `github-pages`, które GitHub tworzy przy włączaniu Pages,
> i tak wpuszcza deploy wyłącznie z gałęzi domyślnej — przy dwóch niezależnych
> źródłach prawdy deploy potrafi paść bez jednego wiersza w logach. Jeśli chcesz,
> żeby produkcją była gałąź `main`, ustaw ją jako domyślną w
> **Settings → General → Default branch**; workflow sam za tym pójdzie.

> Po zmianie nazwy repozytorium trzeba zaktualizować stałą `BASE`
> w `vite.config.ts` — inaczej Pages nie znajdzie plików.

## Klucz Gemini (opcjonalny)

1. Wejdź na [aistudio.google.com/apikey](https://aistudio.google.com/apikey) i wygeneruj
   klucz. Darmowy tier ma limity zapytań (na minutę i na dobę), nie płacisz za tokeny —
   przy prywatnym użytku te limity są nieosiągalne.
2. W aplikacji: **Ustawienia → Gemini → Klucz API**, wklej i dotknij **Testuj**.
3. Przycisk **Pobierz modele** wypełni listę modeli dostępnych dla Twojego klucza.

Klucz zapisuje się wyłącznie w pamięci przeglądarki na Twoim telefonie i nie
trafia do repozytorium ani na żaden serwer poza Google. Zapytania idą prosto
z telefonu do API Gemini.

## Pierwsze kroki w aplikacji

1. **Ustawienia → Plan tygodnia** — wpisz lekcje i stałe zajęcia. Bez tego planer
   zakłada, że masz wolny cały dzień.
2. **Ustawienia → Dieta** — opisz swoje zasady żywieniowe, np. „steki, wołowina, jajka,
   ziemniaki, ryż, owoce i warzywa; bez fast foodów i słodyczy". Bez tego posiłki dostają
   tylko prostą ocenę lokalną opartą na słowach kluczowych.
3. **Ustawienia → Twoje wytyczne dla AI** — opcjonalnie napisz, kim jesteś i jak AI ma
   Cię oceniać. Trafia to do każdego zapytania.
4. **Ustawienia → Cele** — ustaw treningi na tydzień, minuty nauki dziennie, liczbę
   posiłków i próg serii.
5. **Dziś → + Zadanie** — dodaj pierwsze zadanie i zobacz, jak wskoczy w grafik.

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
| Zadania | 30 | suma trudności zadań ukończonych tego dnia / cel dzienny |
| Nauka | 25 | minuty z zrobionych bloków i ręcznych wpisów / cel dzienny |
| Siłownia | 20 | treningi z ostatnich 7 dni / cel tygodniowy |
| Jedzenie | 15 | suma ocen posiłków / (liczba posiłków w celu × 10) |
| Wpisy | 10 | ocena AI wpisu „co dziś zrobiłem" (0–10) |

Trening liczony jest w oknie tygodniowym, żeby dzień przerwy nie zjeżdżał wyniku
do zera.

Jedzenie liczy jednocześnie jakość i regularność: trzy posiłki po 8/10 dają 0,8,
a jeden idealny 10/10 tylko 0,33. Śmieciowy posiłek nie odejmuje punktów, ale zajmuje
miejsce w mianowniku — dzień na fast foodach wychodzi nisko sam z siebie, bez karania
za szczerość w zapisywaniu.

Kategorie oparte na dobrowolnym zapisie (jedzenie, wpisy) nie karzą za brak danych:
w dniu bez posiłków albo bez notatki ich waga rozkłada się proporcjonalnie na
pozostałe składniki.

## Ograniczenia

- **Brak synchronizacji z Kalendarzem Apple w obie strony.** Przeglądarka nie ma
  dostępu do EventKit. Działa jednokierunkowy eksport `.ics`.
- **Brak powiadomień push w tle.** Przypomnienia dostaniesz z Kalendarza Apple po
  zaimportowaniu pliku `.ics` — każdy blok ma alarm 10 minut wcześniej.
- **Dane tylko na jednym urządzeniu.** Przenosisz je plikiem kopii zapasowej.
