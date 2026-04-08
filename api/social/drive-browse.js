// api/social/drive-browse.js
// GET /api/social/drive-browse?folderId=<id>
// Lists files/folders in a Google Drive folder.

import { google } from 'googleapis';

function getDriveClient() {
    // Support both service account (Option A) and OAuth refresh token (Option B)
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

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const folderId = req.query.folderId || 'root';

    try {
        const drive = getDriveClient();
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, thumbnailLink, size)',
            orderBy: 'modifiedTime desc',
            pageSize: 50,
        });

        const files = (response.data.files || []).map(f => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            thumbnail: f.thumbnailLink,
            isFolder: f.mimeType === 'application/vnd.google-apps.folder',
            size: f.size,
        }));

        return res.status(200).json({ files });
    } catch (err) {
        console.error('drive-browse error:', err);
        return res.status(500).json({ error: 'Nie można pobrać pliku. Sprawdź uprawnienia w Drive.' });
    }
}
