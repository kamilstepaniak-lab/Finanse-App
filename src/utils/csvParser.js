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
        const lowerNoSpaces = lower.replace(/\s+/g, '');

        // 1. Zwrot (refund) — highest priority
        if (lower.includes('zwrot') || lower.includes('refund') || lower.includes('refundacja')) return 'Zwrot';

        // 2. Nauka pływania (swimming lessons)
        if (
            lower.includes('plywani') ||
            lower.includes('basen') ||
            lower.includes('plywalnia') ||
            lower.includes('awf') ||
            lower.includes('uek') ||
            lower.includes('akf') ||
            lower.includes('swimming') ||
            lower.includes('plywanie dowolne') ||
            /\bup\b/.test(lower)
        ) return 'nauka pływania';

        // Dzień tygodnia + godzina (np. "środa 19.30") → nauka pływania
        const daysOfWeek = ['poniedzialek', 'wtorek', 'sroda', 'czwartek', 'piatek', 'sobota', 'niedziela'];
        const hasDay = daysOfWeek.some(d => lower.includes(d) || lowerNoSpaces.includes(d));
        const hasTime = /\d{1,2}[.,:]\d{2}/.test(lower);
        if (hasDay && hasTime) return 'nauka pływania';

        // 3. usługa turystyczna — BEFORE Szkolenie, so "szkolenie Livigno" → trip, not training
        // Locations that always indicate a trip/camp
        const TRIP_LOCATIONS = [
            'gniewino', 'borek', 'chotowa', 'jastarnia', 'mazury',
            'livigno', 'kluszkowce', 'piancavallo', 'flachau',
            'stubai', 'suche', 'jurgow', 'szczyrk', 'turnau',
            'krynica', 'poronin', 'bialka', 'zakopane', 'ryn',
            'dluga polana', 'grapa'
        ];
        // Activity/product keywords that indicate a trip
        const TRIP_KEYWORDS = [
            'oboz', 'turyst', 'pobyt', 'camp', 'rejs',
            'zeglarski', 'windsurfing', 'adventure', 'summer',
            'licealist', 'polkolonia', 'kids trophy', 'kidstrophy',
            'mozn', 'family camp', 'wyjazd', 'wycieczka',
            'kwatera', 'zakwaterowanie', 'autokar',
            'zaliczka', 'sekcja camp',
            'hero', 'prokids', 'sekcja', 'mpp',
            'liga', 'semi', 'karnet', 'sport camp', 'sport chill'
        ];

        if (TRIP_LOCATIONS.some(loc => lower.includes(loc) || lowerNoSpaces.includes(loc))) {
            return 'usługa turystyczna';
        }
        if (TRIP_KEYWORDS.some(kw => lower.includes(kw) || lowerNoSpaces.includes(kw))) {
            return 'usługa turystyczna';
        }

        // 4. Szkolenie (training — only if no trip location detected above)
        if (
            lower.includes('trening') ||
            lower.includes('szkolenie') ||
            lower.includes('hala') ||
            lower.includes('hali')
        ) return 'Szkolenie';

        // 5. Other specific categories
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
        // Default for unrecognized POSITIVE amounts — guard against obvious non-camp transfers
        if (!category) {
            const titleLower = title.toLowerCase();
            const NON_CAMP_KEYWORDS = [
                'podatek', 'wewne', 'przelew', 'pensja', 'wynagrodzenie',
                'faktura', 'sklada', 'skladka', 'ubezpiecz', 'zus', 'pit', 'vat'
            ];
            const looksLikeInternalTransfer = NON_CAMP_KEYWORDS.some(kw => titleLower.includes(kw));
            if (!looksLikeInternalTransfer) category = 'usługa turystyczna';
        }
    }

    // Smart Camp Assignment (Wyjazd)
    // Returns: { camp: string, needsReview: boolean }
    const attemptAutoAssignCamp = ({ title: searchTitle, sender: searchSender }, campsList, transactionDate) => {
        if (!campsList || campsList.length === 0 || (!searchTitle && !searchSender)) return { camp: '', needsReview: false };

        const CHAR_MAP = { 'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z' };
        const norm = (s) => s.toLowerCase().split('').map(c => CHAR_MAP[c] || c).join('');

        // Stop-words: generic terms that appear in many camps and DON'T distinguish them.
        // IMPORTANT: program identifiers (hero, prokids, family, sekcja, etc.) are NOT stop-words
        // because they distinguish e.g. "Hero Kluszkowce" from "ProKids Kluszkowce".
        const STOP_WORDS = new Set([
            // generic camp/trip terms
            'oboz', 'wyjazd', 'wycieczka', 'kolonia', 'turnus',
            // seasons
            'lato', 'zima', 'leni', 'zimow', 'ferie', 'wakacje',
            // adjectives
            'letni', 'letnia', 'letnie', 'zimowy', 'zimowa', 'zimowe',
            'sportowy', 'sportowa', 'sportowe',
            'morski', 'morska', 'gorski', 'gorska',
            'narciarski', 'narciarska',
            'mlodziezowy', 'mlodziezowa', 'mlodziezowe',
            'jezdziecki', 'taneczny', 'muzyczny', 'artystyczny',
            // extra products
            'karnet', 'karnety',
            // payment terms
            'rata', 'doplata', 'dla', 'oraz', 'przelew', 'oplata', 'wplata',
            'zaliczka', 'udzial', 'uczestnictwo', 'czesc',
            // countries (too broad)
            'wlochy', 'austria', 'polska'
        ]);

        // Fuzzy prefix matching for Polish grammar (licealistow vs licealisty, gniewino vs gniewinie)
        const fuzzyTokenMatch = (token, tokenList) => {
            if (token.length < 5) return false;
            for (const other of tokenList) {
                if (other.length < 4) continue;
                const maxLen = Math.max(token.length, other.length);
                let commonLen = 0;
                const limit = Math.min(token.length, other.length);
                while (commonLen < limit && token[commonLen] === other[commonLen]) commonLen++;
                if (commonLen / maxLen >= 0.7) return true;
            }
            return false;
        };

        // Extract meaningful tokens from a string.
        // Dates stripped first. Split on whitespace, punctuation, AND digit-letter boundaries
        // so "SPORT1KRAKOW" becomes ["sport", "krakow"] instead of "sportkrakow".
        const extractTokens = (str) => {
            const withoutDates = norm(str)
                .replace(/\d{1,2}[-\/]\d{1,2}[.]\d{1,2}(?:[.\-\/]\d{2,4})?/g, ' ') // ranges: 06-08.03.2026
                .replace(/\b\d{1,2}[.]\d{1,2}(?:[.]\d{2,4})?\b/g, ' ')              // single: 08.03.2026
                .replace(/\b\d{4}\b/g, ' ');                                          // bare years: 2025

            return withoutDates
                .split(/[\s,;\-:()\[\]\/\\]+/)
                .flatMap(t => t.split(/(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/))  // split digit-letter boundaries
                .map(t => t.replace(/[^a-z]/g, ''))   // letters only
                .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
        };

        // Normalize dates from a string into a Set of "day.month" strings.
        // Handles many formats clients use in transfer titles:
        //   7-8.03 / 07-08.03 / 7/8.03 / 7 do 8.03 / 7-8.03.2026
        //   30.01-7.02 (cross-month range) / 8.03 / 08.03.2026
        const extractDates = (str) => {
            const dates = new Set();
            const s = norm(str);

            const addDate = (d, mo) => {
                const day = parseInt(d, 10);
                const month = parseInt(mo, 10);
                if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
                    dates.add(`${day}.${month}`);
                }
            };

            // Cross-month range: 30.01-7.02 / 30.01-07.02.2026
            const crossMonthRe = /(\d{1,2})[.](\d{1,2})[-\/](\d{1,2})[.](\d{1,2})(?:[.\-\/]\d{2,4})?/g;
            let m;
            while ((m = crossMonthRe.exec(s)) !== null) {
                addDate(m[1], m[2]);
                addDate(m[3], m[4]);
            }

            // Same-month range: 7-8.03 / 07-08.03 / 7/8.03 / 7-8.03.2026
            const rangeRe = /(\d{1,2})[-\/](\d{1,2})[.](\d{1,2})(?:[.\-\/]\d{2,4})?/g;
            while ((m = rangeRe.exec(s)) !== null) {
                addDate(m[1], m[3]);
                addDate(m[2], m[3]);
            }

            // "do" range: 7 do 8.03 / 07 do 08.03.2026
            const doRangeRe = /(\d{1,2})\s+do\s+(\d{1,2})[.](\d{1,2})(?:[.\-\/]\d{2,4})?/g;
            while ((m = doRangeRe.exec(s)) !== null) {
                addDate(m[1], m[3]);
                addDate(m[2], m[3]);
            }

            // Single: 8.03 / 08.03 / 8.03.2026
            const singleRe = /(?<![0-9])(\d{1,2})[.](\d{1,2})(?:[.\-\/]\d{2,4})?(?![0-9])/g;
            while ((m = singleRe.exec(s)) !== null) {
                addDate(m[1], m[2]);
            }

            return dates;
        };

        // Extract year (e.g. 2026) from string — used to bind transactions to the correct season
        const extractYear = (str) => {
            const m = str.match(/\b(20\d{2})\b/);
            return m ? parseInt(m[1]) : null;
        };

        // Score title and sender SEPARATELY to avoid sender noise diluting matches
        const titleNorm = norm(searchTitle || '');
        const senderNorm = norm(searchSender || '');
        const combinedNorm = norm(`${searchTitle || ''} ${searchSender || ''}`);
        const titleNormNoSpaces = titleNorm.replace(/\s+/g, '');
        const combinedNormNoSpaces = combinedNorm.replace(/\s+/g, '');
        const titleTokens = extractTokens(searchTitle || '');
        const senderTokens = extractTokens(searchSender || '');
        const allTokens = [...new Set([...titleTokens, ...senderTokens])];
        const tDates = extractDates(`${searchTitle || ''} ${searchSender || ''}`);
        const txYear = transactionDate ? new Date(transactionDate).getFullYear() : null;
        const txTitleYear = extractYear(searchTitle || ''); // year mentioned in the transfer title
        const txMonth = transactionDate ? new Date(transactionDate).getMonth() + 1 : null;

        let bestMatch = '';
        let highestScore = 0;
        let secondBestScore = 0;
        let campsWithAnyMatch = 0;
        let campsAboveThreshold = 0;
        let bestMeetsThreshold = false;

        for (const c of campsList) {
            const cTokens = extractTokens(c.name);
            const cDates = extractDates(c.name);

            // Build word bank: name tokens + individual tag words (normalized)
            const campTagWords = (c.tags || []).map(t => norm(t)).filter(t => t.length >= 2);
            const wordBank = new Set([...cTokens, ...campTagWords]);

            if (wordBank.size === 0) continue;

            // Count transaction title tokens found in this camp's word bank
            let wordMatchCount = 0;
            for (const txToken of titleTokens) {
                if (wordBank.has(txToken)) {
                    wordMatchCount += 1;
                } else if ([...wordBank].some(w => fuzzyTokenMatch(w, [txToken]))) {
                    wordMatchCount += 0.8;  // fuzzy prefix (Polish grammar variants)
                } else if ([...wordBank].some(w => w.length >= 4 && titleNormNoSpaces.includes(w))) {
                    wordMatchCount += 0.7;  // no-spaces (split words like "JASTAR NIA")
                }
            }

            // Date match: each camp date found in transaction counts toward the threshold
            let dateMatchCount = 0;
            for (const d of cDates) {
                if (tDates.has(d)) dateMatchCount += 1;
            }

            // Effective match = word matches + date matches (dates help distinguish same-location camps)
            const effectiveMatch = wordMatchCount + dateMatchCount;

            // Threshold: min(3, name token count) — small camps (1-2 tokens) auto-adjust
            const campThreshold = Math.min(3, cTokens.length);
            const meetsThreshold = effectiveMatch >= campThreshold;

            // Score for ranking when multiple camps qualify
            let score = wordBank.size > 0 ? effectiveMatch / wordBank.size : 0;

            // Year-awareness multiplier
            const campYear = c.year || extractYear(c.name);
            const referenceYear = txTitleYear || txYear;
            if (campYear && referenceYear) {
                const yearDiff = Math.abs(campYear - referenceYear);
                if (yearDiff === 0) {
                    score *= 1.1;
                } else if (yearDiff === 1) {
                    if (campYear === referenceYear + 1 && txMonth >= 10 && c.season === 'zima') {
                        score *= 0.9;   // advance winter payment — minor penalty
                    } else {
                        score *= 0.25;  // adjacent year — heavy penalty
                    }
                } else {
                    score *= 0.05;  // 2+ years apart — near-eliminate
                }
            }

            const hasAnyMatch = effectiveMatch > 0;
            if (hasAnyMatch) campsWithAnyMatch++;
            if (meetsThreshold) campsAboveThreshold++;

            if (score > highestScore) {
                secondBestScore = highestScore;
                highestScore = score;
                bestMatch = c.name;
                bestMeetsThreshold = meetsThreshold;
            } else if (score > secondBestScore) {
                secondBestScore = score;
            }
        }

        // ── Decision logic ──

        // 1. No match at all
        if (!bestMatch || highestScore === 0) return { camp: '', needsReview: true };

        // 2. Multi-camp payment detection: title contains list keywords ("oraz", "i", "&", "+")
        //    AND 2+ different camps matched → parent is paying for multiple camps at once
        const titleLower = norm(searchTitle || '');
        const hasListKeyword = /\boraz\b|\bi\b|[&+]/.test(titleLower);
        if (hasListKeyword && campsWithAnyMatch >= 2) {
            return { camp: '', needsReview: true };
        }

        // 3. Only one camp matched anything → no competition → auto-approve
        if (campsWithAnyMatch === 1) return { camp: bestMatch, needsReview: false };

        // 4. Exactly one camp meets the word+date threshold → confident winner
        if (campsAboveThreshold === 1 && bestMeetsThreshold) {
            return { camp: bestMatch, needsReview: false };
        }

        // 5. Multiple camps meet threshold → ambiguous, suggest best but flag for review
        if (campsAboveThreshold > 1) {
            return { camp: bestMatch, needsReview: true };
        }

        // 6. No camp meets threshold → weak match, suggest best and flag for review
        return { camp: bestMatch, needsReview: true };
    };

    const requiresCamp = category && category.toLowerCase().includes('usługa turystyczna');
    const matchResult = requiresCamp
        ? attemptAutoAssignCamp({ title, sender }, camps, date)
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
