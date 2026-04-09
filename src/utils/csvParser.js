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
        if (!category) category = 'usługa turystyczna';
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

        // Normalize dates from a string into a Set of "day.month" strings
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

        // Helper: compute matching tokens for a set of transaction tokens against camp tokens
        const computeMatchingTokens = (cTokens, txTokens, normNoSpaces) => {
            let matching = 0;
            for (const token of cTokens) {
                if (txTokens.includes(token)) {
                    matching += 1;                        // exact match
                } else if (fuzzyTokenMatch(token, txTokens)) {
                    matching += 0.8;                      // fuzzy prefix match (Polish grammar)
                } else if (normNoSpaces.includes(token)) {
                    matching += 0.7;                      // no-spaces match (typos like "JASTAR NIA")
                }
            }
            return matching;
        };

        let bestMatch = '';
        let highestScore = 0;
        let secondBestScore = 0;
        let bestHasAnyMatch = false;
        let tieCandidates = [];       // camps within ~5% of best score for date tie-breaking
        let campsWithSignificantMatch = 0; // camps where >=50% of their tokens match
        let campsWithAnyMatch = 0;    // camps with any token/date/tag match at all

        for (const c of campsList) {
            const cTokens = extractTokens(c.name);
            const cDates = extractDates(c.name);

            // Tags unique to the camp (exclude ones already in cTokens to avoid double-counting)
            const campTags = (c.tags || []).map(t => norm(t)).filter(t => t.length >= 2);
            const extraTags = campTags.filter(t => !cTokens.includes(t));

            if (cTokens.length === 0 && extraTags.length === 0) continue;

            // Score title tokens separately — prevents sender noise from diluting score
            const titleMatching = computeMatchingTokens(cTokens, titleTokens, titleNormNoSpaces);
            // Score combined (title + sender) — catches camp name appearing in sender
            const combinedMatching = computeMatchingTokens(cTokens, allTokens, combinedNormNoSpaces);

            // Date bonus: each date from the camp name that appears in the title
            let dateBonus = 0;
            for (const d of cDates) {
                if (tDates.has(d)) dateBonus += 1;
            }

            // Tag bonus: extra tags (not already in name tokens) — check against combined text
            let tagBonus = 0;
            for (const tag of extraTags) {
                if (combinedNorm.includes(tag) || combinedNormNoSpaces.includes(tag)) {
                    tagBonus += 2;
                }
            }

            const totalItems = cTokens.length + cDates.size;

            // Title-only score (higher precision, not diluted by sender tokens)
            const titleCampCoverage = totalItems > 0 ? (titleMatching + dateBonus + tagBonus) / totalItems : 0;
            const titleTxCoverage = titleTokens.length > 0 ? Math.max(titleMatching / titleTokens.length, 0.2) : 1;
            const titleScore = titleCampCoverage * titleTxCoverage;

            // Combined score (broader recall, uses all tokens)
            const combinedCampCoverage = totalItems > 0 ? (combinedMatching + dateBonus + tagBonus) / totalItems : 0;
            const combinedTxCoverage = allTokens.length > 0 ? Math.max(combinedMatching / allTokens.length, 0.15) : 1;
            const combinedScore = combinedCampCoverage * combinedTxCoverage;

            // Final score: title has priority, combined score discounted
            let score = Math.max(titleScore, combinedScore * 0.7);

            // ── Year-awareness: bind transactions to the correct season ──
            const campYear = c.year || extractYear(c.name);
            const referenceYear = txTitleYear || txYear;
            if (campYear && referenceYear) {
                const yearDiff = Math.abs(campYear - referenceYear);
                if (yearDiff === 0) {
                    score *= 1.1;   // slight bonus — correct year
                } else if (yearDiff === 1) {
                    // Exception: Oct-Dec payments for next-year winter camps
                    if (campYear === referenceYear + 1 && txMonth >= 10 && c.season === 'zima') {
                        score *= 0.9;   // minor penalty — advance winter payment
                    } else {
                        score *= 0.25;  // heavy penalty — adjacent year
                    }
                } else {
                    score *= 0.05;  // near-eliminate — 2+ years apart
                }
            }

            const hasAnyMatch = titleMatching > 0 || combinedMatching > 0 || dateBonus > 0 || tagBonus > 0;

            // Count matches for confidence logic
            const matchRatio = cTokens.length > 0 ? combinedMatching / cTokens.length : 0;
            if (matchRatio >= 0.5) campsWithSignificantMatch++;
            if (hasAnyMatch && score > 0) campsWithAnyMatch++;

            // Track best, second-best, and near-ties
            if (score > highestScore) {
                secondBestScore = highestScore;
                highestScore = score;
                bestMatch = c.name;
                bestHasAnyMatch = hasAnyMatch;
                tieCandidates = [{ name: c.name, cDates }];
            } else if (score > secondBestScore) {
                secondBestScore = score;
                if (highestScore > 0 && (highestScore - score) / highestScore < 0.1) {
                    tieCandidates.push({ name: c.name, cDates });
                }
            }
        }

        // ── Decision logic based on confidence ──

        // 1. Multi-camp: 3+ camps have significant (>=50%) token matches → manual split needed
        if (campsWithSignificantMatch >= 3) return { camp: bestMatch || '', needsReview: true };

        // 2. No match at all
        if (!bestMatch || highestScore === 0) return { camp: '', needsReview: true };

        // 3. SINGLE CAMP MATCH — if exactly one camp scored, auto-approve regardless of score
        //    e.g. "Gniewino" matches only one camp → no ambiguity → approve
        if (campsWithAnyMatch === 1 && bestHasAnyMatch) {
            return { camp: bestMatch, needsReview: false };
        }

        const scoreGap = highestScore - secondBestScore;
        const relativeGap = highestScore > 0 ? scoreGap / highestScore : 1;

        // 4. Near-tie: scores within 10% — try date proximity to pick winner
        if (relativeGap < 0.1 && tieCandidates.length > 1 && transactionDate) {
            const tDate = new Date(transactionDate);
            let closestName = null;
            let closestDiff = Infinity;
            for (const candidate of tieCandidates) {
                for (const d of candidate.cDates) {
                    const [day, month] = d.split('.').map(Number);
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
            if (closestName && closestDiff <= 90) {
                return { camp: closestName, needsReview: false };
            }
            return { camp: bestMatch, needsReview: true };
        }

        // 5. Clear winner: meaningful gap over runner-up (lowered thresholds)
        const isConfident = bestHasAnyMatch && highestScore >= 0.05 && (
            secondBestScore === 0 ||    // only one camp matched at all
            relativeGap >= 0.15         // winner is >=15% better than runner-up (was 25%)
        );

        if (isConfident) return { camp: bestMatch, needsReview: false };

        // 6. Weak/ambiguous match — assign best guess but flag for review
        if (bestMatch && highestScore > 0) return { camp: bestMatch, needsReview: true };
        return { camp: '', needsReview: true };
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
