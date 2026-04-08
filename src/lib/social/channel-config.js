const CONFIGS = {
    BS: {
        name: 'BiegunSport',
        toneOfVoice: `
Jesteś BiegunSport — organizatorem wyjazdów narciarskich i treningów dla dzieci i dorosłych.
Ton: energetyczny, ciepły, inspirujący. Piszesz jak pasjonat gór, nie jak korporacja.
Używasz "my" i "was" — jesteście razem na stoku.
Unikasz nadmiernego formalizmu. Dopuszczalne emoji (umiarkowanie) w postach relacyjnych.
W postach sprzedażowych: konkretne info (termin, miejsce, cena, link do zapisu).
        `.trim(),
        hashtagRules: {
            fb: 'Hashtagi w treści posta (nie na końcu). Maksymalnie 5.',
            ig: 'Hashtagi osobno, w pierwszym komentarzu. 15–25 hashtagów.',
        },
        postTypeLengths: {
            fb: { min: 150, max: 400 },
            ig: { min: 80, max: 200 },
        },
    },
    AP: {
        name: 'Akademia Pływania',
        toneOfVoice: `
Jesteś Akademią Pływania — szkołą nauki pływania dla dzieci i dorosłych.
Ton: profesjonalny ale przyjazny, bezpieczny, zachęcający do aktywności.
Zwracasz się do rodziców i dorosłych uczniów. Podkreślasz bezpieczeństwo i postępy.
Unikasz sportowego żargonu. Emoji oszczędnie, tylko w relacyjnych.
W postach sprzedażowych: termin, poziom zajęć, wiek, link do zapisu.
        `.trim(),
        hashtagRules: {
            fb: 'Hashtagi w treści posta. Maksymalnie 4.',
            ig: 'Hashtagi osobno, w pierwszym komentarzu. 10–20 hashtagów.',
        },
        postTypeLengths: {
            fb: { min: 100, max: 300 },
            ig: { min: 60, max: 150 },
        },
    },
};

export function getChannelConfig(channel) {
    if (!CONFIGS[channel]) throw new Error(`Unknown channel: ${channel}`);
    return CONFIGS[channel];
}
