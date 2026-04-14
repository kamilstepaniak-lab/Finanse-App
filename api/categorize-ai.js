// api/categorize-ai.js
// POST /api/categorize-ai
// Body: { transactions: [{id, title, sender, amount, date}], categories: [string], camps: [{name, tags, year, season}] }
// Returns: { results: [{ id, category, camp, needsReview }] }

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BATCH_SIZE = 20;

// Normalize string: lowercase + strip Polish diacritics
const normStr = (s) => {
    if (!s) return '';
    const MAP = { 'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z' };
    return s.toLowerCase().split('').map(c => MAP[c] || c).join('').trim();
};

function buildPrompt(batch, categories, camps) {
    const campList = camps.length > 0
        ? camps.map(c =>
            `- "${c.name}" (rok: ${c.year || '?'}, sezon: ${c.season || '?'}, tagi: ${(c.tags || []).join(', ')})`
          ).join('\n')
        : '(brak wyjazdów)';

    const txList = batch.map((t, i) =>
        `${i + 1}. id="${t.id}" | data=${t.date} | kwota=${t.amount} PLN | nadawca="${t.sender || ''}" | tytuł="${t.title || ''}"`
    ).join('\n');

    return `Jesteś asystentem księgowości polskiej firmy turystyczno-sportowej (obozy pływackie, narciarskie, letnie). Przeanalizuj poniższe transakcje bankowe i przypisz każdej:
1. Kategorię — DOKŁADNIE jedną z dostępnych (identyczna pisownia)
2. Wyjazd — DOKŁADNIE jedną nazwę z listy wyjazdów, lub null jeśli nie dotyczy
3. needsReview — false jeśli pewny, true jeśli niepewny

DOSTĘPNE KATEGORIE:
${categories.join(', ')}

DOSTĘPNE WYJAZDY:
${campList}

TRANSAKCJE:
${txList}

Zasady kategoryzacji:
- Kwota ujemna → zawsze kategoria "Koszt", camp: null
- Wpłata za obóz/wyjazd → "usługa turystyczna" + dopasuj wyjazd po nazwie lokalizacji, roku, sezonie
- Lekcje pływania, basen, treningi → "nauka pływania", camp: null
- Szkolenia bez lokalizacji obozu → "Szkolenie", camp: null
- Faktury, zakupy → odpowiednia kategoria, camp: null

Dopasowanie wyjazdu — kluczowe:
- Ignoruj imiona i nazwiska klientów w tytule — to nie są nazwy obozów
- "REJS LICEALISTOW MAZURY" → szukaj wyjazdu z "rejs" i "licealistow" w nazwie
- Tytuł może zawierać nazwę obozu pisaną bez polskich znaków — porównuj fonetycznie
- Jeśli tytuł zawiera słowa które wyraźnie pasują do nazwy/tagów JEDNEGO wyjazdu → dopasuj go

Zasady needsReview:
- needsReview: false gdy kategoria jest pewna i (dla usługi turystycznej) udało się dopasować wyjazd
- needsReview: false gdy kategoria nie wymaga wyjazdu (Koszt, nauka pływania, Szkolenie, Zwrot)
- needsReview: true TYLKO gdy tytuł jest całkowicie nieczytelny LUB gdy "usługa turystyczna" ale żaden wyjazd z listy nie pasuje

Odpowiedz TYLKO tablicą JSON (bez markdown, bez komentarzy) w tej samej kolejności co transakcje:
[
  { "id": "...", "category": "...", "camp": "..." lub null, "needsReview": true lub false },
  ...
]`;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { transactions, categories, camps } = req.body;

    if (!Array.isArray(transactions) || transactions.length === 0)
        return res.status(400).json({ error: 'transactions array required' });
    if (!Array.isArray(categories) || categories.length === 0)
        return res.status(400).json({ error: 'categories array required' });
    if (!Array.isArray(camps))
        return res.status(400).json({ error: 'camps array required' });

    // Build normalized lookup: normStr(campName) → original campName
    // This lets us match Claude's response even if it drops Polish characters
    const campNormMap = new Map();
    camps.forEach(c => campNormMap.set(normStr(c.name), c.name));

    const categorySet = new Set(categories);
    const categoryNormMap = new Map();
    categories.forEach(c => categoryNormMap.set(normStr(c), c));

    const resolveCamp = (name) => {
        if (!name) return null;
        // Try exact match first
        if (campNormMap.has(normStr(name))) return campNormMap.get(normStr(name));
        return null;
    };

    const resolveCategory = (cat) => {
        if (!cat) return null;
        if (categorySet.has(cat)) return cat;
        // Try normalized match
        const norm = normStr(cat);
        if (categoryNormMap.has(norm)) return categoryNormMap.get(norm);
        return null;
    };

    // Split into batches
    const batches = [];
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
        batches.push(transactions.slice(i, i + BATCH_SIZE));
    }

    // Process all batches in parallel
    const batchResults = await Promise.allSettled(batches.map(async (batch, idx) => {
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            messages: [{ role: 'user', content: buildPrompt(batch, categories, camps) }],
        });

        const raw = message.content[0].text.trim();
        console.log(`Batch ${idx + 1} raw (first 400):`, raw.slice(0, 400));

        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error(`Batch ${idx + 1}: no JSON array in response`);
        const parsed = JSON.parse(jsonMatch[0]);

        return parsed.map(item => {
            const resolvedCategory = resolveCategory(item.category);
            // Camp only makes sense for tourist services — enforce null for everything else
            const campAllowed = resolvedCategory && resolvedCategory.toLowerCase().includes('turystyczna');
            const resolvedCamp = campAllowed ? resolveCamp(item.camp) : null;
            if (item.camp && !campAllowed) {
                console.warn(`Camp cleared: category="${resolvedCategory}" does not allow camp assignment`);
            } else if (item.camp && !resolvedCamp) {
                console.warn(`Camp not resolved: Claude="${item.camp}" normKey="${normStr(item.camp)}"`);
            }
            return {
                id: item.id,
                category: resolvedCategory,
                camp: resolvedCamp,
                needsReview: item.needsReview !== false && item.needsReview !== 'false',
            };
        });
    }));

    const allResults = [];
    const debugInfo = { batches: batches.length, errors: [] };

    batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
            allResults.push(...result.value);
        } else {
            console.error(`Batch ${idx + 1} failed:`, result.reason?.message);
            debugInfo.errors.push(`Batch ${idx + 1}: ${result.reason?.message}`);
            batches[idx].forEach(t =>
                allResults.push({ id: t.id, category: null, camp: null, needsReview: true })
            );
        }
    });

    return res.status(200).json({ results: allResults, debug: debugInfo });
}
