
// Cache for exchange rates to avoid redundant API calls
const rateCache = new Map();
// Cache for original dates where the full 7-day lookback failed — avoids re-querying the same date
const notFoundCache = new Set();

export const getNBPExchangeRate = async (date, currency = 'EUR') => {
    // NBP API requires YYYY-MM-DD
    const dateStr = date.slice(0, 10);
    const cacheKey = `${currency}-${dateStr}`;

    if (rateCache.has(cacheKey)) {
        return rateCache.get(cacheKey);
    }

    try {
        // Try fetching the rate for the specific date
        const response = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${currency}/${dateStr}/?format=json`);

        if (!response.ok) {
            // If 404 (likely weekend/holiday), try the previous day (simple recursive fallback)
            // Limit recursion depth to avoid infinite loops (max 7 days back)
            // But strict recursion might be slow. NBP API usually supports "last 10 days" query but simplified:
            // Let's just try previous day.
            throw new Error(`Rate not found for ${dateStr}`);
        }

        const data = await response.json();
        const rate = data?.rates?.[0]?.mid;

        if (rate) {
            rateCache.set(cacheKey, rate);
            return rate;
        }

    } catch (err) {
        // Fallback: Recursive lookback
        // Parse date, subtract 1 day
        const d = new Date(date);
        d.setDate(d.getDate() - 1);
        const prevDate = d.toISOString().slice(0, 10);

        // Safety Break: Don't go back too far (e.g. into previous year if not needed, or just arbitrary limit)
        // If we fail for 7 days, give up.
        // We need a counter or assume checks are fast enough.
        // Or simpler: use 'last available' endpoint? NBP has `http://api.nbp.pl/api/exchangerates/rates/a/eur/last/1/?format=json` but that is "latest from NOW", not "latest relative to date".

        // Let's implement a loop instead of recursion to keep it safe
    }
    return null;
};

// Robust function with lookback loop
export const findRateForDate = async (date, currency = 'EUR') => {
    const originalDateStr = String(date).slice(0, 10);
    const notFoundKey = `${currency}-${originalDateStr}`;

    // If this exact date already failed a full lookback in this session, skip immediately
    if (notFoundCache.has(notFoundKey)) {
        throw new Error(`Nie znaleziono kursu NBP dla ${originalDateStr} (sprawdzono 7 dni wstecz). Sprawdź datę lub podaj kurs ręcznie.`);
    }

    let currentCheckDate = new Date(date);
    for (let i = 0; i < 7; i++) { // Look back 7 days max
        const dateStr = currentCheckDate.toISOString().slice(0, 10);
        const cacheKey = `${currency}-${dateStr}`;

        if (rateCache.has(cacheKey)) return rateCache.get(cacheKey);

        try {
            const res = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${currency}/${dateStr}/?format=json`);
            if (res.ok) {
                const data = await res.json();
                const rate = data?.rates?.[0]?.mid;
                if (rate) {
                    rateCache.set(cacheKey, rate);
                    return rate;
                }
            }
        } catch (e) {
            // ignore network errors, keep trying previous days
        }

        // Go back 1 day
        currentCheckDate.setDate(currentCheckDate.getDate() - 1);
    }

    // Mark original date as permanently failed in this session
    notFoundCache.add(notFoundKey);
    console.warn(`Could not find NBP rate for ${originalDateStr} within 7 days.`);
    throw new Error(`Nie znaleziono kursu NBP dla ${originalDateStr} (sprawdzono 7 dni wstecz). Sprawdź datę lub podaj kurs ręcznie.`);
};
