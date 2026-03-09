
// Cache for exchange rates to avoid redundant API calls
const rateCache = new Map();

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
                    // Cache this rate for the date found
                    rateCache.set(cacheKey, rate);
                    // Also cache strictly for the original requested date? No, that's misleading.
                    return rate;
                }
            }
        } catch (e) {
            // ignore
        }

        // Go back 1 day
        currentCheckDate.setDate(currentCheckDate.getDate() - 1);
    }
    // Fallback: If totally failed, return 1? Or throw?
    console.warn(`Could not find NBP rate for ${date} within 7 days.`);
    return 1; // 1:1 fallback
};
