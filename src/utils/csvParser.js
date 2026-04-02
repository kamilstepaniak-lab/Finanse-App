import Papa from 'papaparse';
import { findRateForDate } from './currencyUtils';

export const parseCSV = (file, camps = []) => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            encoding: "Windows-1250",
            complete: async (results) => {
                try {
                    const rawData = results.data;
                    if (!rawData || rawData.length === 0) throw new Error("Pusty plik");

                    // Process all rows asynchronously
                    const finalData = [];
                    for (const row of rawData) {
                        const result = await normalizeTransaction(row, camps);
                        finalData.push(result);
                    }

                    resolve(finalData);

                } catch (e) {
                    reject(e);
                }
            },
            error: (error) => {
                reject(error);
            }
        });
    });
};

export const normalizeTransaction = async (row, camps = []) => {
    // Assume 5-column format: Date, Amount, Currency, Sender, Title
    // row[0] = Date
    // row[1] = Amount
    // row[2] = Currency
    // row[3] = Sender
    // row[4] = Title

    // 1. Date
    let dateStr = row[0];
    let date = new Date().toISOString().split('T')[0];
    if (dateStr) {
        const d = String(dateStr).trim();
        if (/^\d{2}-\d{2}-\d{4}$/.test(d)) {
            const parts = d.split('-');
            date = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) {
            const parts = d.split('.');
            date = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (d.match(/^\d{4}-\d{2}-\d{2}/)) {
            date = d.slice(0, 10);
        }
    }

    // 2. Amount
    let amountStr = row[1];
    let amount = 0;
    if (amountStr) {
        let str = String(amountStr).trim();
        str = str.replace(/[^0-9,-]/g, '').replace(',', '.');
        amount = parseFloat(str);
        if (isNaN(amount)) amount = 0;
    }

    // 3. Currency (from column 3)
    let currency = 'PLN';
    let originalAmount = null;

    if (row[2]) {
        const currencyStr = String(row[2]).trim().toUpperCase();
        if (currencyStr === 'EUR' || currencyStr === 'PLN') {
            currency = currencyStr;
        }
    }

    // 4. Convert EUR to PLN
    if (currency === 'EUR') {
        originalAmount = amount;
        const rate = await findRateForDate(date, 'EUR');
        if (rate) {
            amount = parseFloat((amount * rate).toFixed(2));
        }
    }

    // 5. Sender & Title
    let sender = row[3] || 'Nieznany';
    let title = row[4] || 'Bez tytułu';

    // Normalize Polish Chars
    const normalizeString = (str) => {
        if (!str) return '';
        const map = {
            'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
            'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
        };
        return str.split('').map(c => map[c] || c).join('');
    };

    sender = normalizeString(sender);
    title = normalizeString(title);

    // Auto-Categorization
    const autoCategorize = (txt) => {
        const lower = txt.toLowerCase();

        if (lower.includes('zwrot') || lower.includes('refund') || lower.includes('refundacja')) return 'Zwrot';

        if (
            lower.includes('plywani') ||
            lower.includes('pływani') ||
            lower.includes('basen') ||
            lower.includes('pływalnia') ||
            lower.includes('awf') ||
            lower.includes('uek') ||
            lower.includes('akf') ||
            /\bup\b/.test(lower)
        ) return 'nauka pływania';

        // Dzień tygodnia + godzina (np. "środa 19.30", "niedziela 18:45") → nauka pływania
        // Usuń spacje i sprawdź też wariant z literówką (np. "n iedziela")
        const lowerNoSpaces = lower.replace(/\s+/g, '');
        const daysOfWeek = ['poniedzialek', 'wtorek', 'sroda', 'czwartek', 'piatek', 'sobota', 'niedziela',
                            'poniedzialek', 'sroda', 'piatek'];
        const hasDay = daysOfWeek.some(d => lower.includes(d) || lowerNoSpaces.includes(d));
        const hasTime = /\d{1,2}[.,:]\d{2}/.test(lower);
        if (hasDay && hasTime) return 'nauka pływania';

        if (
            lower.includes('trening') ||
            lower.includes('szkolenie') ||
            lower.includes('hala')
        ) return 'Szkolenie';

        const datePattern = /\d{1,2}[-.]\d{1,2}/;
        if (
            lower.includes('obóz') ||
            lower.includes('oboz') ||
            lower.includes('turyst') ||
            lower.includes('pobyt') ||
            lower.includes('zaliczka') ||
            lower.includes('wyjazd') ||
            lower.includes('wycieczka') ||
            lower.includes('kwatera') ||
            lower.includes('zakwaterowanie') ||
            lower.includes('camp') ||
            lower.includes('rejs') ||
            lower.includes('zeglarski') ||
            lower.includes('żeglarski') ||
            lower.includes('gniewino') ||
            lower.includes('borek') ||
            lower.includes('chotowa') ||
            (datePattern.test(lower) && (lower.includes('krynica') || lower.includes('poronin') || lower.includes('jurgow') || lower.includes('bialka') || lower.includes('zakopane')))
        ) return 'usługa turystyczna';

        if (lower.includes('czepek')) return 'zakup czepek';
        if (lower.includes('wpisowe')) return 'wpisowe';
        if (lower.includes('faktura')) return 'FAKTURA VAT';
        if (lower.includes('ubrania') || lower.includes('odziez') || lower.includes('stroj')) return 'zakup ubrania';

        return '';
    };

    let category = autoCategorize(title);
    if (!category) category = autoCategorize(sender);

    if (amount < 0) {
        category = 'Koszt';
    } else {
        if (!category) category = 'usługa turystyczna';
    }

    // Smart Camp Assignment (Wyjazd)
    // Returns: { camp: string, needsReview: boolean }
    const attemptAutoAssignCamp = (textToSearch, campsList, transactionDate) => {
        if (!campsList || campsList.length === 0 || !textToSearch) return { camp: '', needsReview: false };

        const CHAR_MAP = { 'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z' };
        const norm = (s) => s.toLowerCase().split('').map(c => CHAR_MAP[c] || c).join('');

        // Stop-words that appear in camp names but carry no matching value
        const STOP_WORDS = new Set([
            'oboz', 'wyjazd', 'wycieczka', 'camp', 'kolonia', 'turnus', 'rejs',
            'lato', 'zima', 'leni', 'zimow', 'ferie', 'wakacje',
            // przymiotniki obozowe
            'letni', 'letnia', 'letnie', 'zimowy', 'zimowa', 'zimowe',
            'sportowy', 'sportowa', 'sportowe', 'sport',
            'morski', 'morska', 'gorski', 'gorska',
            'narciarski', 'narciarska',
            'mlodziezowy', 'mlodziezowa', 'mlodziezowe',
            'jezdziecki', 'taneczny', 'muzyczny', 'artystyczny',
            // organizacyjne / poziomy programu — pojawiają się w wielu obozach, nie identyfikują konkretnego
            'sekcja', 'family', 'hero', 'prokids', 'semipro', 'beeski',
            // produkty dodatkowe
            'karnet', 'karnety',
            // słowa płatnicze
            'rata', 'doplata', 'dla', 'oraz', 'przelew', 'oplata', 'wplata', 'zaliczka', 'udzial', 'uczestnictwo'
        ]);

        // Extract words >= 3 chars that are not stop-words.
        // Dates are stripped first so they don't produce garbled tokens like "08032026".
        const extractTokens = (str) => {
            const withoutDates = norm(str)
                .replace(/\d{1,2}[-\/]\d{1,2}[.]\d{1,2}(?:[.\-\/]\d{2,4})?/g, ' ') // ranges: 06-08.03.2026
                .replace(/\b\d{1,2}[.]\d{1,2}(?:[.]\d{2,4})?\b/g, ' ')              // single: 08.03.2026
                .replace(/\b\d{4}\b/g, ' ');                                          // bare years: 2025

            return withoutDates
                .split(/[\s,;\-:()\[\]\/\\]+/)
                .map(t => t.replace(/[^a-z]/g, ''))   // letters only — no digits in word tokens
                .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
        };

        // Normalize dates from a string into a Set of "day.month" strings
        // Handles: "7-8.03", "7-8.03.2025", "08.03", "8.03.2025", "7/8.03"
        const extractDates = (str) => {
            const dates = new Set();
            const s = norm(str);

            // Range: 7-8.03 or 7-8.03.2025 or 7/8.03
            const rangeRe = /(\d{1,2})[-\/](\d{1,2})[.](\d{1,2})(?:[.\-\/]\d{2,4})?/g;
            let m;
            while ((m = rangeRe.exec(s)) !== null) {
                const [, d1, d2, mo] = m;
                const month = parseInt(mo, 10);
                if (month >= 1 && month <= 12) {
                    dates.add(`${parseInt(d1)}.${month}`);
                    dates.add(`${parseInt(d2)}.${month}`);
                }
            }

            // Single: 08.03 or 8.03.2025 — only if not already captured as part of a range
            const singleRe = /(?<![0-9])(\d{1,2})[.](\d{1,2})(?:[.\-\/]\d{2,4})?(?![0-9])/g;
            while ((m = singleRe.exec(s)) !== null) {
                const [, d, mo] = m;
                const month = parseInt(mo, 10);
                if (month >= 1 && month <= 12) {
                    dates.add(`${parseInt(d)}.${month}`);
                }
            }

            return dates;
        };

        const tNorm = norm(textToSearch);
        const tNormNoSpaces = tNorm.replace(/\s+/g, '');
        const tTokens = extractTokens(textToSearch);
        const tDates = extractDates(textToSearch);

        let bestMatch = '';
        let highestScore = 0;
        let bestHadTagBonus = false;
        let bestTokenRatio = 0;
        let bestHasAnyMatch = false;
        let isTie = false;
        let tieCandidates = []; // track all camps with equal top score for date tie-breaking

        for (const c of campsList) {
            const cTokens = extractTokens(c.name);
            const cDates = extractDates(c.name);

            // Tags unique to the camp (exclude ones already in cTokens to avoid double-counting)
            const campTags = (c.tags || []).map(t => norm(t)).filter(t => t.length >= 2);
            const extraTags = campTags.filter(t => !cTokens.includes(t));

            if (cTokens.length === 0 && extraTags.length === 0) continue;

            let matchingTokens = 0;

            for (const token of cTokens) {
                // Exact token match
                if (tTokens.includes(token)) {
                    matchingTokens += 1;
                    continue;
                }
                // Root match: strip last char to handle Polish grammar (e.g. "gniewinie" → "gniewino")
                const root = token.length >= 4 ? token.slice(0, -1) : null;
                if (root && tNorm.includes(root)) {
                    matchingTokens += 0.7;
                }
            }

            // Date bonus: each date from the camp name that appears in the title
            let dateBonus = 0;
            for (const d of cDates) {
                if (tDates.has(d)) {
                    dateBonus += 1;
                }
            }

            // Tag bonus: extra tags (not already in name tokens) — also check without spaces for typos
            let tagBonus = 0;
            for (const tag of extraTags) {
                if (tNorm.includes(tag) || tNormNoSpaces.includes(tag)) {
                    tagBonus += 2;
                }
            }

            // Also check cTokens against no-spaces version (catches typos like "Choto wa")
            for (const token of cTokens) {
                if (!tTokens.includes(token) && tNormNoSpaces.includes(token)) {
                    matchingTokens += 0.8;
                }
            }

            const totalItems = cTokens.length + cDates.size + extraTags.length * 2;
            const score = totalItems > 0 ? (matchingTokens + dateBonus + tagBonus) / totalItems : 0;
            const tokenMatchRatio = cTokens.length > 0 ? matchingTokens / cTokens.length : 0;
            const hasAnyMatch = matchingTokens > 0 || dateBonus > 0 || tagBonus > 0;

            if (score > highestScore) {
                highestScore = score;
                bestMatch = c.name;
                bestHadTagBonus = tagBonus > 0;
                bestTokenRatio = tokenMatchRatio;
                bestHasAnyMatch = hasAnyMatch;
                isTie = false;
                tieCandidates = [{ name: c.name, cDates }];
            } else if (Math.abs(score - highestScore) < 0.001 && score > 0) {
                isTie = true;
                tieCandidates.push({ name: c.name, cDates });
            }
        }

        if (!bestMatch || highestScore === 0) return { camp: '', needsReview: true };

        // Tie-breaker: use transaction date proximity to pick best camp
        // e.g. "Suche 12-14.12" vs "Suche 19-22.12" — choose the one whose dates are closest to transaction date
        if (isTie && transactionDate && tieCandidates.length > 1) {
            const tDate = new Date(transactionDate);
            let closestName = null;
            let closestDiff = Infinity;
            for (const candidate of tieCandidates) {
                for (const d of candidate.cDates) {
                    const [day, month] = d.split('.').map(Number);
                    // Try same year and adjacent years
                    for (const yr of [tDate.getFullYear(), tDate.getFullYear() + 1, tDate.getFullYear() - 1]) {
                        const campDate = new Date(yr, month - 1, day);
                        const diff = Math.abs((tDate - campDate) / (1000 * 60 * 60 * 24));
                        if (diff < closestDiff) {
                            closestDiff = diff;
                            closestName = candidate.name;
                        }
                    }
                }
            }
            // Only use date tie-breaker if within 90 days
            if (closestName && closestDiff <= 90) {
                return { camp: closestName, needsReview: false };
            }
        }

        // Certain match: no tie AND at least one keyword hit
        const isCertain = !isTie && bestHasAnyMatch;

        // Tie: still assign best candidate but flag for review
        if (isCertain) return { camp: bestMatch, needsReview: false };
        if (highestScore >= 0.3) return { camp: bestMatch, needsReview: true };
        return { camp: '', needsReview: true };
    };

    const requiresCamp = category && category.toLowerCase().includes('usługa turystyczna');
    const matchResult = requiresCamp
        ? attemptAutoAssignCamp(`${title} ${sender}`, camps, date)
        : { camp: '', needsReview: false };
    let assignedCamp = matchResult.camp;
    let needsReview = matchResult.needsReview;

    return {
        date,
        amount,
        originalAmount,
        currency,
        title,
        sender,
        category,
        camp: assignedCamp,
        needsReview,
        sourceFile: 'import'
    };
};
