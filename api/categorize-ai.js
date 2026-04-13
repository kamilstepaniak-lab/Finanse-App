// api/categorize-ai.js
// POST /api/categorize-ai
// Body: { transactions: [{id, title, sender, amount, date}], categories: [string], camps: [{name, tags, year, season}] }
// Returns: { results: [{ id, category, camp, needsReview }] }

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BATCH_SIZE = 20;

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
- Kwota ujemna → zawsze "Koszt"
- Wpłata za obóz/wyjazd → "usługa turystyczna" + dopasuj wyjazd po nazwie lokalizacji, roku, sezonie
- Lekcje pływania, basen, treningi → "nauka pływania"
- Szkolenia bez lokalizacji obozu → "Szkolenie"
- Zwrot pieniędzy → "Zwrot"
- Faktury, zakupy → odpowiednia kategoria
- camp: null gdy kwota ujemna lub brak pasującego wyjazdu
- needsReview: true gdy tytuł/nadawca jest niejednoznaczny lub nie pasuje do żadnego wyjazdu z listy

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

    const campNames = new Set(camps.map(c => c.name));
    const categorySet = new Set(categories);
    const allResults = [];

    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
        const batch = transactions.slice(i, i + BATCH_SIZE);
        try {
            const message = await anthropic.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 4096,
                messages: [{ role: 'user', content: buildPrompt(batch, categories, camps) }],
            });

            const raw = message.content[0].text.trim();
            const jsonMatch = raw.match(/\[[\s\S]*\]/);
            if (!jsonMatch) throw new Error('No JSON array in Claude response');
            const parsed = JSON.parse(jsonMatch[0]);

            for (const item of parsed) {
                allResults.push({
                    id: item.id,
                    category: categorySet.has(item.category) ? item.category : null,
                    camp: campNames.has(item.camp) ? item.camp : null,
                    needsReview: item.needsReview !== false && item.needsReview !== 'false',
                });
            }
        } catch (err) {
            console.error(`AI categorize batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err);
            for (const t of batch) {
                allResults.push({ id: t.id, category: null, camp: null, needsReview: true });
            }
        }
    }

    return res.status(200).json({ results: allResults });
}
