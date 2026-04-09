// src/lib/social/drive-agent.js
//
// Pobiera pliki .md agenta marketingowego z Google Drive
// i kompiluje je w gotowy system prompt dla Claude.
//
// Używane przez: api/social/refresh-agent.js
//
// Env wymagane (takie same jak drive-browse/download):
//   GOOGLE_SERVICE_ACCOUNT_JSON  — lub —
//   GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET + GOOGLE_DRIVE_REFRESH_TOKEN
//
// Env dodatkowe:
//   BS_COWORK_FOLDER_ID  — ID folderu "BS_AI Cowork" na Google Drive

import { google } from 'googleapis';

// ─── Pliki agenta per kanał ───────────────────────────────────────────────────
// Nazwy plików do pobrania z Google Drive dla każdego kanału.
// Kolejność ma znaczenie — tak zostaną złączone w system prompt.

const CHANNEL_FILES = {
    BS: [
        { folder: 'root',       name: 'Tone of Voice CLAUDE.md' },
        { folder: 'marketing',  name: 'marketing.md' },
        { folder: 'marketing',  name: 'content-creator.md' },
        { folder: 'marketing',  name: 'persona-klienta.md' },
        { folder: 'asystent',   name: 'kontekst-firmy.md' },
    ],
    AP: [
        { folder: 'root',       name: 'Tone of Voice CLAUDE.md' },
        { folder: 'marketing',  name: 'marketing.md' },
        { folder: 'marketing',  name: 'content-creator.md' },
        { folder: 'marketing',  name: 'persona-klienta.md' },
        { folder: 'asystent',   name: 'kontekst-firmy.md' },
    ],
};

// ─── Google Drive client ──────────────────────────────────────────────────────

function getDriveClient() {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });
        return google.drive({ version: 'v3', auth });
    }

    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_CLIENT_ID,
        process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth });
}

// ─── Szukanie folderu po nazwie ───────────────────────────────────────────────

async function findFolderId(drive, name, parentId) {
    const res = await drive.files.list({
        q: `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1,
    });
    return res.data.files?.[0]?.id ?? null;
}

// ─── Pobieranie zawartości pliku tekstowego ───────────────────────────────────

async function downloadTextFile(drive, fileId) {
    const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'text' },
    );
    return res.data;
}

// ─── Szukanie pliku po nazwie w folderze ──────────────────────────────────────

async function findFileId(drive, name, parentId) {
    const res = await drive.files.list({
        q: `'${parentId}' in parents and name = '${name}' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1,
    });
    return res.data.files?.[0]?.id ?? null;
}

// ─── Główna funkcja ───────────────────────────────────────────────────────────

/**
 * Pobiera pliki agenta z Google Drive i zwraca skompilowany system prompt.
 *
 * @param {string} channel  'BS' lub 'AP'
 * @returns {{ systemPrompt: string, driveFiles: Array<{name: string, id: string}> }}
 */
export async function buildAgentPromptFromDrive(channel) {
    const drive = getDriveClient();
    const rootFolderId = process.env.BS_COWORK_FOLDER_ID;

    if (!rootFolderId) {
        throw new Error('Brak BS_COWORK_FOLDER_ID w zmiennych środowiskowych.');
    }

    // Znajdź podfoldery agents/marketing i agents/asystent
    const agentsFolderId    = await findFolderId(drive, 'agents',    rootFolderId);
    const marketingFolderId = agentsFolderId ? await findFolderId(drive, 'marketing', agentsFolderId) : null;
    const asystentFolderId  = agentsFolderId ? await findFolderId(drive, 'asystent',  agentsFolderId) : null;

    const folderMap = {
        root:      rootFolderId,
        marketing: marketingFolderId,
        asystent:  asystentFolderId,
    };

    const files = CHANNEL_FILES[channel];
    if (!files) throw new Error(`Nieznany kanał: ${channel}`);

    const parts = [];
    const driveFiles = [];

    for (const { folder, name } of files) {
        const parentId = folderMap[folder];
        if (!parentId) {
            console.warn(`[drive-agent] Nie znaleziono folderu "${folder}" — pomijam ${name}`);
            continue;
        }

        const fileId = await findFileId(drive, name, parentId);
        if (!fileId) {
            console.warn(`[drive-agent] Nie znaleziono pliku "${name}" w folderze "${folder}"`);
            continue;
        }

        const content = await downloadTextFile(drive, fileId);
        parts.push(`<!-- === ${name} === -->\n${content}`);
        driveFiles.push({ name, id: fileId });
    }

    if (parts.length === 0) {
        throw new Error('Nie udało się pobrać żadnego pliku z Google Drive.');
    }

    // Nagłówek instruujący Claude jak korzystać z tej bazy wiedzy
    const header = channel === 'BS'
        ? `Jesteś agentem contentowym BiegunSport (kanał główny: BeeSki, obozy, wizerunek). NIE piszesz o Akademii Pływania na tym kanale.

Poniżej masz pełną bazę wiedzy — Tone of Voice, zasady pisania, kontekst firmy i persona klienta. Czytaj ją uważnie przed każdym postem.

Zawsze zwracaj TYLKO czysty JSON bez żadnego dodatkowego tekstu:
{"fb": "...treść posta na FB...", "ig": "...treść posta na IG..."}`
        : `Jesteś agentem contentowym Akademii Pływania BiegunSport (osobny kanał: TYLKO tematy basenowe i pływanie).

Poniżej masz pełną bazę wiedzy — Tone of Voice, zasady pisania, kontekst firmy i persona klienta. Czytaj ją uważnie przed każdym postem. Stosuj sekcję "Akademia Pływania" z Tone of Voice — ciepły, kompetentny, uspokajający ton.

Zawsze zwracaj TYLKO czysty JSON bez żadnego dodatkowego tekstu:
{"fb": "...treść posta na FB...", "ig": "...treść posta na IG..."}`;

    const systemPrompt = `${header}\n\n---\n\n${parts.join('\n\n---\n\n')}`;

    return { systemPrompt, driveFiles };
}
