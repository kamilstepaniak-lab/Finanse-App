-- Migration: Add needs_review column to transactions
-- Run this ONCE in Supabase SQL Editor

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;

-- Index for quickly filtering transactions that need review
CREATE INDEX IF NOT EXISTS idx_transactions_needs_review ON transactions(needs_review);
