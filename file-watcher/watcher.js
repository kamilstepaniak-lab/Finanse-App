import chokidar from 'chokidar';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const watchFolder = process.env.WATCH_FOLDER;
const processedFolder = process.env.PROCESSED_FOLDER;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file');
    process.exit(1);
}

if (!watchFolder) {
    console.error('❌ Error: Missing WATCH_FOLDER in .env file');
    process.exit(1);
}

if (!fs.existsSync(watchFolder)) {
    console.error(`❌ Error: Watch folder does not exist: ${watchFolder}`);
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🚀 CSV File Watcher Started');
console.log(`📁 Watching folder: ${watchFolder}`);
console.log(`🔗 Connected to Supabase: ${supabaseUrl}`);
console.log('⏳ Waiting for CSV files...\n');

// Currency conversion (simplified - you may want to fetch real rates)
const findRateForDate = async (date, currency) => {
    // Simplified: return a fixed rate
    // In production, you'd want to fetch from an API or database
    if (currency === 'EUR') {
        return 4.30; // Example fixed rate
    }
    return 1;
};

// Normalize Polish characters
const normalizeString = (str) => {
    if (!str) return '';
    const map = {
        'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
        'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
    };
    return str.split('').map(c => map[c] || c).join('');
};

// Auto-categorization logic (same as in csvParser.js)
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

// Parse and normalize transaction
const normalizeTransaction = async (row, sourceFile) => {
    // Date
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

    // Amount
    let amountStr = row[1];
    let amount = 0;
    if (amountStr) {
        let str = String(amountStr).trim();
        str = str.replace(/[^0-9,-]/g, '').replace(',', '.');
        amount = parseFloat(str);
        if (isNaN(amount)) amount = 0;
    }

    // Currency
    let currency = 'PLN';
    let originalAmount = null;

    if (row[2]) {
        const currencyStr = String(row[2]).trim().toUpperCase();
        if (currencyStr === 'EUR' || currencyStr === 'PLN') {
            currency = currencyStr;
        }
    }

    // Convert EUR to PLN
    if (currency === 'EUR') {
        originalAmount = amount;
        const rate = await findRateForDate(date, 'EUR');
        if (rate) {
            amount = parseFloat((amount * rate).toFixed(2));
        }
    }

    // Sender & Title
    let sender = row[3] || 'Nieznany';
    let title = row[4] || 'Bez tytułu';

    sender = normalizeString(sender);
    title = normalizeString(title);

    // Auto-Categorization
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
        original_amount: originalAmount,
        currency,
        title,
        sender,
        category,
        camp: '',
        source_file: sourceFile
    };
};

// Process CSV file
const processCSVFile = async (filePath) => {
    const fileName = path.basename(filePath);
    console.log(`\n📄 Processing file: ${fileName}`);

    try {
        const fileContent = fs.readFileSync(filePath, { encoding: 'latin1' });

        return new Promise((resolve, reject) => {
            Papa.parse(fileContent, {
                header: false,
                skipEmptyLines: true,
                complete: async (results) => {
                    try {
                        const rawData = results.data;
                        if (!rawData || rawData.length === 0) {
                            throw new Error('Empty file');
                        }

                        console.log(`   Found ${rawData.length} rows`);

                        // Process all rows
                        const transactions = [];
                        for (const row of rawData) {
                            const transaction = await normalizeTransaction(row, fileName);
                            transactions.push(transaction);
                        }

                        // --- START DEDUPLICATION LOGIC ---
                        console.log(`   Checking ${transactions.length} rows for duplicates...`);

                        // 1. Deduplicate internally within the CSV file
                        const uniqueInternal = [];
                        const seenInternal = new Set();
                        for (const t of transactions) {
                            const key = `${t.date}_${t.amount}_${t.title}_${t.sender}`;
                            if (!seenInternal.has(key)) {
                                seenInternal.add(key);
                                uniqueInternal.push(t);
                            } else {
                                console.log(`   ⚠️ Skipped internal duplicate: ${t.date} | ${t.amount} | ${t.title}`);
                            }
                        }

                        let newTransactions = uniqueInternal;

                        // 2. Deduplicate against the Supabase database
                        if (uniqueInternal.length > 0) {
                            // Find date range to limit the database query
                            let minDate = '9999-12-31';
                            let maxDate = '0000-00-00';
                            for (const t of uniqueInternal) {
                                if (t.date < minDate) minDate = t.date;
                                if (t.date > maxDate) maxDate = t.date;
                            }

                            const { data: existing, error: fetchError } = await supabase
                                .from('transactions')
                                .select('date, amount, title, sender')
                                .gte('date', minDate)
                                .lte('date', maxDate);

                            if (fetchError) {
                                console.error('   ❌ Error fetching existing transactions for deduplication:', fetchError.message);
                                throw fetchError;
                            }

                            if (existing && existing.length > 0) {
                                newTransactions = uniqueInternal.filter(t => {
                                    const isDuplicate = existing.some(e =>
                                        e.date === t.date &&
                                        e.amount === t.amount &&
                                        e.title === t.title &&
                                        e.sender === t.sender
                                    );
                                    if (isDuplicate) {
                                        console.log(`   ⚠️ Skipped existing in DB: ${t.date} | ${t.amount} | ${t.title}`);
                                    }
                                    return !isDuplicate;
                                });
                            }
                        }

                        if (newTransactions.length === 0) {
                            console.log(`   ⏭️ Skipped file: All ${transactions.length} transactions already exist in the database.`);

                            // Move file to processed folder if configured
                            if (processedFolder) {
                                if (!fs.existsSync(processedFolder)) {
                                    fs.mkdirSync(processedFolder, { recursive: true });
                                }
                                const newPath = path.join(processedFolder, fileName);
                                fs.renameSync(filePath, newPath);
                                console.log(`   📦 Moved to: ${processedFolder}`);
                            }

                            resolve([]);
                            return;
                        }

                        // Insert into Supabase
                        console.log(`   Uploading ${newTransactions.length} new transactions to Supabase (skipped ${transactions.length - newTransactions.length} duplicates)...`);
                        const { data, error } = await supabase
                            .from('transactions')
                            .insert(newTransactions)
                            .select();

                        if (error) {
                            throw error;
                        }

                        console.log(`   ✅ Successfully imported ${data.length} new transactions`);

                        // Move file to processed folder if configured
                        if (processedFolder) {
                            if (!fs.existsSync(processedFolder)) {
                                fs.mkdirSync(processedFolder, { recursive: true });
                            }
                            const newPath = path.join(processedFolder, fileName);
                            fs.renameSync(filePath, newPath);
                            console.log(`   📦 Moved to: ${processedFolder}`);
                        }

                        resolve(data);
                    } catch (e) {
                        reject(e);
                    }
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    } catch (error) {
        console.error(`   ❌ Error processing file: ${error.message}`);
        throw error;
    }
};

// Watch for new files
const watcher = chokidar.watch(watchFolder, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: false, // Process existing files on startup
    awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
    }
});

watcher
    .on('add', async (filePath) => {
        // Only process CSV files
        if (path.extname(filePath).toLowerCase() !== '.csv') {
            return;
        }

        try {
            await processCSVFile(filePath);
        } catch (error) {
            console.error(`Failed to process ${filePath}:`, error);
        }
    })
    .on('error', (error) => {
        console.error('Watcher error:', error);
    });

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down file watcher...');
    watcher.close();
    process.exit(0);
});
