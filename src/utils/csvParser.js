import Papa from 'papaparse';
import { findRateForDate } from './currencyUtils';

export const parseCSV = (file) => {
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
                        const result = await normalizeTransaction(row);
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

export const normalizeTransaction = async (row) => {
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

        if (
            lower.includes('plywania') ||
            lower.includes('pływania') ||
            lower.includes('basen') ||
            lower.includes('pływalnia')
        ) return 'nauka pływania';

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

    return {
        date,
        amount,
        originalAmount,
        currency,
        title,
        sender,
        category,
        camp: '',
        sourceFile: 'import'
    };
};
