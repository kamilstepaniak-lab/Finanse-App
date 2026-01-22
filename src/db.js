import Dexie from 'dexie';

export const db = new Dexie('FinanceAppDB');

db.version(3).stores({
    transactions: '++id, date, amount, sender, title, category, camp, sourceFile, originalAmount, currency',
    categories: '++id, &name, type',
    camps: '++id, &name'
});

// Seed default categories if empty
db.on('populate', () => {
    db.categories.bulkAdd([
        { name: 'usługa turystyczna', type: 'income' },
        { name: 'usługa turystyczna FAKTURA', type: 'income' },
        { name: 'nauka pływania', type: 'income' },
        { name: 'nauka pływania FAKTURA', type: 'income' },
        { name: 'Szkolenie', type: 'income' },
        { name: 'Szkolenie FAKTURA', type: 'income' },
        { name: 'wpisowe', type: 'income' },
        { name: 'zakup czepek', type: 'income' },
        { name: 'zakup ubrania', type: 'expense' },
        { name: 'FAKTURA VAT', type: 'expense' }
    ]);
});
