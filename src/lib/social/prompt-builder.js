import { getChannelConfig } from './channel-config.js';

export function buildGenerationPrompt({ channel, postType, contextNote, partners, learningExamples }) {
    const config = getChannelConfig(channel);

    const partnerList = partners.length > 0
        ? partners.map(p => `${p.name} (${p.handle})`).join(', ')
        : 'brak partnerów dla tego posta';

    const examplesSection = learningExamples.length > 0
        ? `
## Przykłady uczenia (ostatnie zatwierdzenia użytkownika)

Użyj tych przykładów jako wzorzec stylu i tonu. To ważna wskazówka.

${learningExamples.map((ex, i) => `
### Przykład ${i + 1}
**AI napisało (FB):** ${ex.ai_version_fb}
**Użytkownik zatwierdził (FB):** ${ex.human_version_fb}

**AI napisało (IG):** ${ex.ai_version_ig}
**Użytkownik zatwierdził (IG):** ${ex.human_version_ig}
`).join('\n')}
`.trim()
        : '';

    return `
Jesteś copywriterem dla ${config.name}.

## Reguły kanału

${config.toneOfVoice}

## Reguły hashtagów

Facebook: ${config.hashtagRules.fb}
Instagram: ${config.hashtagRules.ig}

## Długości

Facebook: ${config.postTypeLengths.fb.min}–${config.postTypeLengths.fb.max} słów
Instagram: ${config.postTypeLengths.ig.min}–${config.postTypeLengths.ig.max} słów

## Partnerzy dostępni do oznaczenia

${partnerList}

Oznacz partnera (@handle) w treści TYLKO jeśli pasuje do kontekstu posta.

${examplesSection}

## Zadanie

Napisz post typu: **${postType}**

Kontekst / co jest na zdjęciu/filmie:
${contextNote || 'brak opisu — oprzyj się na typowym contencie kanału dla tego miesiąca'}

## Format odpowiedzi

Odpowiedz TYLKO w formacie JSON, bez żadnego dodatkowego tekstu:

{
  "fb": "<tekst posta na Facebook>",
  "ig": "<tekst posta na Instagram>"
}
`.trim();
}
