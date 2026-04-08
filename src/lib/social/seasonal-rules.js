export const SEASONAL_RULES = {
    1:  { season: 'zima', themes: ['ferie zimowe', 'wyjazdy narciarskie', 'zapisy na obozy'], emphasis: 'sprzedażowy' },
    2:  { season: 'zima', themes: ['ferie zimowe', 'ostatnie miejsca', 'stoki narciarskie'], emphasis: 'sprzedażowy' },
    3:  { season: 'wiosna', themes: ['koniec sezonu narciarskiego', 'podsumowania', 'zapisy letnie'], emphasis: 'relacyjny' },
    4:  { season: 'wiosna', themes: ['obozy letnie — wczesne zapisy', 'treningi wiosenne', 'motywacja'], emphasis: 'sprzedażowy' },
    5:  { season: 'wiosna', themes: ['obozy letnie', 'zawody', 'treningi'], emphasis: 'sprzedażowy' },
    6:  { season: 'lato', themes: ['obozy letnie start', 'relacje z wyjazdów', 'pływanie'], emphasis: 'relacyjny' },
    7:  { season: 'lato', themes: ['relacje z obozów', 'zdjęcia uczestników', 'aktywne wakacje'], emphasis: 'relacyjny' },
    8:  { season: 'lato', themes: ['podsumowanie obozów', 'zapisy jesień', 'powrót do treningów'], emphasis: 'sprzedażowy' },
    9:  { season: 'jesień', themes: ['start sezonu', 'nowe zapisy', 'treningi jesienne'], emphasis: 'sprzedażowy' },
    10: { season: 'jesień', themes: ['treningi', 'przygotowanie do zimy', 'zima preview'], emphasis: 'edukacyjny' },
    11: { season: 'jesień', themes: ['wyjazdy zimowe — zapisy', 'early bird', 'black friday'], emphasis: 'sprzedażowy' },
    12: { season: 'zima', themes: ['święta', 'sylwester', 'ferie — ostatnie miejsca'], emphasis: 'relacyjny' },
};

export function getMonthPlan(channel, month) {
    const rule = SEASONAL_RULES[month];
    if (!rule) throw new Error(`Invalid month: ${month}. Must be 1–12.`);
    const postsPerWeek = channel === 'BS' ? 3 : 2;
    const weeksInMonth = 4;
    const totalPosts = postsPerWeek * weeksInMonth;

    return {
        ...rule,
        totalPosts,
        postsPerWeek,
    };
}
