-- Tabela cache'uje skompilowany system prompt agenta marketingowego.
-- Prompt jest pobierany z plików .md na Google Drive i zapisywany tutaj.
-- Aplikacja czyta stąd przy każdym wywołaniu generate — bez uderzania w Drive.

CREATE TABLE IF NOT EXISTS social_agent_cache (
    channel TEXT PRIMARY KEY,          -- 'BS' lub 'AP'
    system_prompt TEXT NOT NULL,       -- skompilowany prompt ze wszystkich plików .md
    drive_files JSONB,                 -- lista plików użytych do kompilacji (do debugowania)
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE social_agent_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to social_agent_cache" ON social_agent_cache
    FOR ALL USING (true) WITH CHECK (true);
