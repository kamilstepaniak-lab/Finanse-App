# Finance App - Aplikacja Finansowa

Aplikacja do zarządzania finansami firmy z automatycznym importem CSV i synchronizacją w czasie rzeczywistym.

## Funkcje

- 📊 **Dashboard** - przegląd wszystkich transakcji z filtrowaniem i wyszukiwaniem
- 📈 **Raporty** - szczegółowe raporty finansowe z podziałem na kategorie i obozy
- 🏕️ **Zarządzanie obozami** - przypisywanie transakcji do konkretnych obozów
- 📤 **Import CSV** - automatyczny import plików CSV z konwersją walut
- 🔄 **Realtime sync** - aktualizacje w czasie rzeczywistym dla wielu użytkowników
- 🤖 **Automatyczny import** - monitorowanie folderu i automatyczne przetwarzanie CSV
- ☁️ **Cloud database** - dane przechowywane w Supabase (PostgreSQL)

## Wymagania

- Node.js 18+ 
- Konto Supabase (darmowe)
- Przeglądarka internetowa

## Instalacja

### 1. Sklonuj repozytorium

```bash
cd "/Users/kamilstepaniak/Desktop/Finanse firma APP"
```

### 2. Zainstaluj zależności

```bash
npm install
```

### 3. Konfiguracja Supabase

Szczegółowe instrukcje znajdziesz w pliku [SUPABASE_SETUP.md](SUPABASE_SETUP.md)

Krótka wersja:
1. Utwórz projekt w [Supabase](https://supabase.com)
2. Uruchom SQL schema z pliku `supabase-schema.sql`
3. Skopiuj klucze API
4. Utwórz plik `.env`:

```bash
cp .env.example .env
```

5. Edytuj `.env` i wpisz swoje klucze:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Uruchom aplikację

```bash
npm run dev
```

Aplikacja będzie dostępna pod adresem `http://localhost:5173`

## Automatyczny Import CSV (Opcjonalnie)

Jeśli chcesz automatycznie importować pliki CSV z folderu:

1. Przejdź do folderu `file-watcher`:

```bash
cd file-watcher
```

2. Zainstaluj zależności:

```bash
npm install
```

3. Skonfiguruj `.env` (szczegóły w `file-watcher/README.md`)

4. Uruchom watcher:

```bash
npm start
```

Szczegółowe instrukcje: [file-watcher/README.md](file-watcher/README.md)

## Format CSV

Aplikacja akceptuje pliki CSV w następującym formacie:

```
Data,Kwota,Waluta,Nadawca,Tytuł
15-01-2024,1500.00,PLN,Jan Kowalski,Obóz letni
16-01-2024,-250.50,EUR,Sklep ABC,Zakup sprzętu
```

- **Data**: DD-MM-YYYY, DD.MM.YYYY lub YYYY-MM-DD
- **Kwota**: Liczba dodatnia (przychód) lub ujemna (koszt)
- **Waluta**: PLN lub EUR (automatyczna konwersja)
- **Nadawca**: Nazwa nadawcy/odbiorcy
- **Tytuł**: Opis transakcji

## Współpraca Wieloużytkownikowa

Aplikacja wspiera wielu użytkowników jednocześnie:
- Wszyscy użytkownicy widzą te same dane
- Zmiany synchronizują się automatycznie w czasie rzeczywistym
- Każdy użytkownik może importować CSV
- Dane są bezpiecznie przechowywane w chmurze

## Budowanie Produkcyjne

```bash
npm run build
```

Pliki produkcyjne znajdą się w folderze `dist/`.

## Technologie

- **Frontend**: React 19, Vite
- **Database**: Supabase (PostgreSQL)
- **Realtime**: Supabase Realtime
- **Charts**: Recharts
- **CSV Parser**: PapaParse
- **File Watcher**: Chokidar (Node.js)

## Struktura Projektu

```
├── src/
│   ├── components/      # Komponenty React
│   ├── pages/          # Strony aplikacji
│   ├── utils/          # Narzędzia (CSV parser, konwersja walut)
│   ├── db.js           # Warstwa danych Supabase
│   └── supabaseClient.js # Konfiguracja Supabase
├── file-watcher/       # Automatyczny import CSV
│   ├── watcher.js      # Skrypt monitorujący
│   └── README.md       # Instrukcje
├── supabase-schema.sql # Schema bazy danych
├── SUPABASE_SETUP.md   # Instrukcje konfiguracji
└── README.md           # Ten plik
```

## Troubleshooting

### Błąd: "Missing Supabase environment variables"
- Upewnij się, że plik `.env` istnieje
- Sprawdź czy wartości są poprawnie skopiowane
- Zrestartuj serwer dev (`npm run dev`)

### Dane nie synchronizują się
- Sprawdź połączenie z internetem
- Sprawdź konsolę przeglądarki (F12) - czy są błędy?
- Sprawdź czy Supabase Realtime jest włączony

### File watcher nie działa
- Zobacz [file-watcher/README.md](file-watcher/README.md)
- Sprawdź czy ścieżka do folderu jest poprawna
- Sprawdź czy używasz klucza `service_role`

## Bezpieczeństwo

⚠️ **Ważne:**
- **NIE** commituj pliku `.env` do git
- **NIE** udostępniaj klucza `service_role` nikomu
- Klucz `anon` jest bezpieczny do użycia w aplikacji frontendowej
- Jeśli klucze wyciekną, zresetuj je w Supabase Dashboard

## Licencja

Prywatna aplikacja firmowa.
