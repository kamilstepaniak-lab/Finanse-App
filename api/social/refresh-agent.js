// api/social/refresh-agent.js
// POST /api/social/refresh-agent
// Body: { channel: 'BS' | 'AP' }
//
// Pobiera pliki agenta z Google Drive, kompiluje system prompt
// i zapisuje do tabeli social_agent_cache w Supabase.
//
// Env wymagane:
//   BS_COWORK_FOLDER_ID
//   GOOGLE_SERVICE_ACCOUNT_JSON  — lub —
//   GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET + GOOGLE_DRIVE_REFRESH_TOKEN
//   VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';
import { buildAgentPromptFromDrive } from '../../src/lib/social/drive-agent.js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { channel } = req.body;

    if (!channel || !['BS', 'AP'].includes(channel)) {
        return res.status(400).json({ error: 'channel must be "BS" or "AP"' });
    }

    try {
        const { systemPrompt, driveFiles } = await buildAgentPromptFromDrive(channel);

        const { error } = await supabase
            .from('social_agent_cache')
            .upsert({
                channel,
                system_prompt: systemPrompt,
                drive_files: driveFiles,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'channel' });

        if (error) throw error;

        return res.status(200).json({
            ok: true,
            channel,
            filesLoaded: driveFiles.length,
            files: driveFiles.map(f => f.name),
        });
    } catch (err) {
        console.error('[refresh-agent] error:', err);
        return res.status(500).json({ error: err.message || 'Nie udało się odświeżyć agenta.' });
    }
}
