-- Migration: Add is_deleted column to transactions (soft-delete)
-- Run this ONCE in Supabase SQL Editor

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Index for quickly filtering out soft-deleted transactions
CREATE INDEX IF NOT EXISTS idx_transactions_is_deleted ON transactions(is_deleted);

-- Backfill any NULL values (shouldn't exist due to DEFAULT, but just in case)
UPDATE transactions SET is_deleted = FALSE WHERE is_deleted IS NULL;
