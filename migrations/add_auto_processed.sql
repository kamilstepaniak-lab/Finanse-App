-- Migration: Add auto_processed column to transactions
-- Run this ONCE in Supabase SQL Editor
--
-- Semantics:
--   NULL / FALSE  → algorytm jeszcze nie przetwarzał tej transakcji
--   TRUE          → algorytm już ją widział (import CSV lub auto-dopasuj)
--
-- Dzięki temu przycisk "Auto-dopasuj" pomija transakcje już przetworzone —
-- bez względu na to co admin zrobił z dopasowaniem po fakcie.

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS auto_processed BOOLEAN DEFAULT FALSE;

-- Index for fast filtering in auto-dopasuj queries
CREATE INDEX IF NOT EXISTS idx_transactions_auto_processed ON transactions(auto_processed);
