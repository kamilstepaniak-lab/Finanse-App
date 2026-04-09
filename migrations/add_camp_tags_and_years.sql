-- Migration: Add recommended tags to camps for better auto-matching
-- Also set year for camps: zima=2025, lato=2026 (where not already set)

-- Helper: append tags without duplicates (Supabase uses JSONB arrays for tags)
-- We use a function to merge arrays safely

-- Sekcja Camp Gniewino — misspellings
UPDATE camps SET tags = (
    SELECT jsonb_agg(DISTINCT t)
    FROM jsonb_array_elements(COALESCE(tags, '[]'::jsonb) || '["gniewno","giewino"]'::jsonb) AS t
) WHERE name LIKE 'Sekcja Camp Gniewino%';

-- Półkolonia 1 Kraków — aliases
UPDATE camps SET tags = (
    SELECT jsonb_agg(DISTINCT t)
    FROM jsonb_array_elements(COALESCE(tags, '[]'::jsonb) || '["sport 1","sport1"]'::jsonb) AS t
) WHERE name LIKE 'Półkolonia 1%';

-- Półkolonia 2 Kraków — aliases
UPDATE camps SET tags = (
    SELECT jsonb_agg(DISTINCT t)
    FROM jsonb_array_elements(COALESCE(tags, '[]'::jsonb) || '["sport 2","sport2"]'::jsonb) AS t
) WHERE name LIKE 'Półkolonia 2%';

-- Rejs Licealistów — misspellings and variants
UPDATE camps SET tags = (
    SELECT jsonb_agg(DISTINCT t)
    FROM jsonb_array_elements(COALESCE(tags, '[]'::jsonb) || '["licealisty","liceality","12.0 mazury","ryn"]'::jsonb) AS t
) WHERE name LIKE 'Rejs Licealistów%';

-- Kids Trophy Flachau — no-space variant
UPDATE camps SET tags = (
    SELECT jsonb_agg(DISTINCT t)
    FROM jsonb_array_elements(COALESCE(tags, '[]'::jsonb) || '["kidstrophy"]'::jsonb) AS t
) WHERE name LIKE 'Kids Trophy%';

-- Summer Sport Camp Borek — abbreviation
UPDATE camps SET tags = (
    SELECT jsonb_agg(DISTINCT t)
    FROM jsonb_array_elements(COALESCE(tags, '[]'::jsonb) || '["ssc"]'::jsonb) AS t
) WHERE name LIKE 'Summer Sport Camp Borek%';

-- Windsurfing Camp Jastarnia — misspelling
UPDATE camps SET tags = (
    SELECT jsonb_agg(DISTINCT t)
    FROM jsonb_array_elements(COALESCE(tags, '[]'::jsonb) || '["jastar"]'::jsonb) AS t
) WHERE name LIKE 'Windsurfing Camp Jastarnia%';

-- Rejs żeglarski Dzieci Mazury — variant
UPDATE camps SET tags = (
    SELECT jsonb_agg(DISTINCT t)
    FROM jsonb_array_elements(COALESCE(tags, '[]'::jsonb) || '["rejs dzieci","zeglarski dzieci"]'::jsonb) AS t
) WHERE name LIKE 'Rejs żeglarski%';

-- Sport & Chill Camp Jastarnia — alias
UPDATE camps SET tags = (
    SELECT jsonb_agg(DISTINCT t)
    FROM jsonb_array_elements(COALESCE(tags, '[]'::jsonb) || '["sport chill"]'::jsonb) AS t
) WHERE name LIKE 'Sport & Chill%';

-- Set years: zima camps → 2025, lato camps → 2026 (only where year is NULL)
UPDATE camps SET year = 2025 WHERE season = 'zima' AND year IS NULL;
UPDATE camps SET year = 2026 WHERE season = 'lato' AND year IS NULL;
