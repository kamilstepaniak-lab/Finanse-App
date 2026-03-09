# Supabase Setup Guide

## Krok 1: Przygotowanie Projektu Supabase

1. **Zaloguj się do Supabase**
   - Przejdź na [supabase.com](https://supabase.com)
   - Zaloguj się na swoje konto

2. **Utwórz nowy projekt** (jeśli jeszcze nie masz)
   - Kliknij "New Project"
   - Wybierz organizację
   - Podaj nazwę projektu (np. "Finanse Firma")
   - Ustaw hasło do bazy danych (ZAPISZ JE!)
   - Wybierz region (najlepiej Frankfurt dla Polski)
   - Kliknij "Create new project"
   - Poczekaj ~2 minuty na inicjalizację

## Krok 2: Uruchomienie SQL Schema

1. **Otwórz SQL Editor**
   - W lewym menu kliknij "SQL Editor"
   - Kliknij "New query"

2. **Skopiuj i uruchom schema**
   - Otwórz plik `supabase-schema.sql` z tego projektu
   - Skopiuj całą zawartość
   - Wklej do SQL Editor w Supabase
   - Kliknij "Run" (lub Cmd/Ctrl + Enter)
   - Poczekaj na komunikat "Success. No rows returned"

3. **Weryfikacja**
   - Przejdź do "Table Editor" w lewym menu
   - Powinieneś zobaczyć 3 tabele: `transactions`, `categories`, `camps`
   - Kliknij na `categories` - powinna zawierać domyślne kategorie

## Krok 3: Pobranie Kluczy API

1. **Przejdź do ustawień**
   - Kliknij ikonę ⚙️ (Settings) w lewym dolnym rogu
   - Wybierz "API" z menu

2. **Skopiuj klucze**
   - **Project URL** - skopiuj (np. `https://xxxxx.supabase.co`)
   - **anon public** - kliknij "Copy" przy kluczu `anon` `public`

## Krok 4: Konfiguracja Aplikacji React

1. **Utwórz plik .env**
   ```bash
   cd "/Users/kamilstepaniak/Desktop/Finanse firma APP"
   cp .env.example .env
   ```

2. **Edytuj plik .env**
   - Otwórz plik `.env` w edytorze
   - Wklej swoje wartości:
   ```
   VITE_SUPABASE_URL=https://twoj-projekt-id.supabase.co
   VITE_SUPABASE_ANON_KEY=twoj-anon-key
   ```
   - Zapisz plik

3. **Zainstaluj zależności**
   ```bash
   npm install
   ```

4. **Uruchom aplikację**
   ```bash
   npm run dev
   ```

5. **Sprawdź konsolę**
   - Otwórz aplikację w przeglądarce
   - Otwórz Developer Tools (F12)
   - Nie powinno być błędów związanych z Supabase

## Krok 5: Test Połączenia

1. **Import CSV**
   - Kliknij "Wgraj CSV" w aplikacji
   - Wybierz plik CSV
   - Sprawdź czy transakcje się pojawiły

2. **Sprawdź w Supabase**
   - Wróć do Supabase Dashboard
   - Przejdź do "Table Editor" → "transactions"
   - Powinieneś zobaczyć zaimportowane dane

3. **Test Realtime**
   - Otwórz aplikację w dwóch kartach przeglądarki
   - W jednej karcie dodaj transakcję
   - W drugiej karcie powinna pojawić się automatycznie (bez odświeżania)

## Krok 6: Konfiguracja File Watcher (Opcjonalnie)

Jeśli chcesz automatyczne importowanie CSV z folderu:

1. **Przejdź do folderu file-watcher**
   ```bash
   cd file-watcher
   ```

2. **Zainstaluj zależności**
   ```bash
   npm install
   ```

3. **Utwórz .env**
   ```bash
   cp .env.example .env
   ```

4. **Edytuj .env**
   - Potrzebujesz klucza `service_role` (UWAGA: to klucz administratora!)
   - W Supabase: Settings → API → `service_role` (kliknij "Reveal" i skopiuj)
   - Wklej do `.env`:
   ```
   SUPABASE_URL=https://twoj-projekt-id.supabase.co
   SUPABASE_SERVICE_KEY=twoj-service-role-key
   WATCH_FOLDER=/sciezka/do/folderu/z/csv
   ```

5. **Uruchom watcher**
   ```bash
   node watcher.js
   ```

6. **Test**
   - Skopiuj plik CSV do obserwowanego folderu
   - Sprawdź konsolę - powinieneś zobaczyć logi o imporcie
   - Sprawdź aplikację - transakcje powinny się pojawić

## Troubleshooting

### Błąd: "Missing Supabase environment variables"
- Upewnij się, że plik `.env` istnieje w głównym folderze projektu
- Sprawdź czy wartości są poprawnie skopiowane (bez spacji na końcu)
- Zrestartuj serwer dev (`npm run dev`)

### Błąd: "Invalid API key"
- Sprawdź czy skopiowałeś klucz `anon public` (nie `service_role`)
- Upewnij się, że nie ma dodatkowych spacji w `.env`

### Dane nie synchronizują się
- Sprawdź czy realtime jest włączony w Supabase (Settings → API → Realtime)
- Sprawdź konsolę przeglądarki - czy są błędy WebSocket?

### File watcher nie działa
- Sprawdź czy ścieżka do folderu jest poprawna (pełna ścieżka, nie relatywna)
- Sprawdź uprawnienia do folderu
- Sprawdź czy używasz klucza `service_role` (nie `anon`)

## Bezpieczeństwo

⚠️ **WAŻNE:**
- **NIE** commituj pliku `.env` do git
- **NIE** udostępniaj klucza `service_role` nikomu
- Klucz `anon` jest bezpieczny do użycia w aplikacji frontendowej
- Jeśli przypadkowo ujawnisz klucze, zresetuj je w Supabase (Settings → API → Reset)
