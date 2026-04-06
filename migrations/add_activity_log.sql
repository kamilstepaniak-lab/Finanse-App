-- Migration: Create activity_log table for persistent change history
-- Run this ONCE in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    action TEXT NOT NULL,
    -- actions: 'create', 'update', 'delete', 'split_add', 'split_delete',
    --         'csv_import', 'category_confirm', 'note_update', 'bulk_delete'
    transaction_id UUID,                -- no FK — survives hard delete / soft delete
    transaction_snapshot JSONB,         -- full transaction state (for delete: state before)
    changes JSONB,                      -- for update: { field: { from, to } }
    message TEXT,
    details JSONB
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_transaction_id ON activity_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
