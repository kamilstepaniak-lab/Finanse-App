// api/social/drive-download.js
// POST /api/social/drive-download
// Body: { drive_file_id, post_id }
// Downloads file from Google Drive, uploads to Vercel Blob, updates post.

import { google } from 'googleapis';
import { put } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_MIMES = ['video/mp4', 'video/mov', 'video/quicktime'];

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { drive_file_id, post_id } = req.body;
    if (!drive_file_id || !post_id) {
        return res.status(400).json({ error: 'drive_file_id and post_id required' });
    }

    try {
        const drive = getDriveClient();

        // Get file metadata
        const meta = await drive.files.get({
            fileId: drive_file_id,
            fields: 'id, name, mimeType, size',
        });
        const { name, mimeType, size } = meta.data;

        // Guard against oversized files (200 MB limit)
        const MAX_BYTES = 200 * 1024 * 1024;
        if (size && parseInt(size, 10) > MAX_BYTES) {
            return res.status(400).json({ error: 'Plik jest za duży (maks. 200 MB).' });
        }

        // Determine media type
        let mediaType;
        if (IMAGE_MIMES.includes(mimeType)) mediaType = 'image';
        else if (VIDEO_MIMES.includes(mimeType)) mediaType = 'video';
        else return res.status(400).json({ error: 'Nieobsługiwany typ pliku.' });

        // Download file stream
        const fileStream = await drive.files.get(
            { fileId: drive_file_id, alt: 'media' },
            { responseType: 'stream' }
        );

        // Upload to Vercel Blob
        const blob = await put(`social-media/${post_id}/${name}`, fileStream.data, {
            access: 'public',
            contentType: mimeType,
        });

        // Update post record
        await supabase.from('social_posts').update({
            media_drive_id: drive_file_id,
            media_public_url: blob.url,
            media_type: mediaType,
        }).eq('id', post_id);

        return res.status(200).json({ url: blob.url, media_type: mediaType });
    } catch (err) {
        console.error('drive-download error:', err);
        return res.status(500).json({ error: 'Nie można pobrać pliku. Sprawdź uprawnienia w Drive.' });
    }
}
