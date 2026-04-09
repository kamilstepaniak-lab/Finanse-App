// Konfiguracja kanałów social media BiegunSport.
// System prompt jest kompilowany dynamicznie z Google Drive (drive-agent.js)
// i cache'owany w tabeli social_agent_cache w Supabase.

const CONFIGS = {
    BS: {
        name: 'BiegunSport',
        hashtagRules: {
            fb: 'Hashtagi w treści posta (5–8). Zawsze: #BiegunSport #BeeSki.',
            ig: 'Hashtagi osobno, po separatorze "---" na końcu. 10–15 hashtagów. Zawsze: #BiegunSport #BeeSki.',
        },
        postTypeLengths: {
            fb: { min: 150, max: 400 },
            ig: { min: 80, max: 200 },
        },
    },
    AP: {
        name: 'Akademia Pływania',
        hashtagRules: {
            fb: 'Hashtagi w treści posta (4–6). Zawsze: #AkademiaPływaniaBS #BiegunSport.',
            ig: 'Hashtagi osobno, po separatorze "---" na końcu. 10–20 hashtagów. Zawsze: #AkademiaPływaniaBS #BiegunSport.',
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
