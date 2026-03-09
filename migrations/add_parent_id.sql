-- Modify transactions table to include parent_id for split transactions
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE;

-- Optional: Create an index for faster lookups of child transactions
CREATE INDEX IF NOT EXISTS idx_transactions_parent_id ON public.transactions(parent_id);
