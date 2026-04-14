// Shared utilities for camp name processing.
// Single source of truth for STOP_WORDS, normalization, and tag extraction.
// Used by csvParser.js (import matching) and Camps.jsx (tag generation).

export const STOP_WORDS = new Set([
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

export const CHAR_MAP = {
    'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z',
    'Ą':'A','Ć':'C','Ę':'E','Ł':'L','Ń':'N','Ó':'O','Ś':'S','Ź':'Z','Ż':'Z'
};

export const norm = (s) => s.toLowerCase().split('').map(c => CHAR_MAP[c] || c).join('');

export const extractTagsFromName = (name) => {
    const normalized = norm(name)
        .replace(/\d{1,2}[-\/]\d{1,2}[.]\d{1,2}(?:[.\-\/]\d{2,4})?/g, ' ')
        .replace(/\b\d{1,2}[.]\d{1,2}(?:[.]\d{2,4})?\b/g, ' ')
        .replace(/\b\d{4}\b/g, ' ');
    return normalized
        .split(/[\s,;\-:()\[\]\/\\]+/)
        .flatMap(t => t.split(/(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/))
        .map(t => t.replace(/[^a-z]/g, ''))
        .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
};
