-- Supabase Database Schema for Finance App
-- Run this in Supabase SQL Editor after creating your project

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    type TEXT CHECK (type IN ('income', 'expense')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Camps Table
CREATE TABLE IF NOT EXISTS camps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    original_amount DECIMAL(10, 2),
    currency TEXT DEFAULT 'PLN',
    sender TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    camp TEXT,
    note TEXT,
    source_file TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES for Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_camp ON transactions(camp);
CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount);
CREATE INDEX IF NOT EXISTS idx_transactions_currency ON transactions(currency);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE camps ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (no authentication required)
-- You can modify these policies later when you add authentication

-- Categories policies
CREATE POLICY "Allow all access to categories" ON categories
    FOR ALL USING (true) WITH CHECK (true);

-- Camps policies
CREATE POLICY "Allow all access to camps" ON camps
    FOR ALL USING (true) WITH CHECK (true);

-- Transactions policies
CREATE POLICY "Allow all access to transactions" ON transactions
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- SEED DEFAULT CATEGORIES
-- ============================================

INSERT INTO categories (name, type) VALUES
    ('usługa turystyczna', 'income'),
    ('usługa turystyczna FAKTURA', 'income'),
    ('nauka pływania', 'income'),
    ('nauka pływania FAKTURA', 'income'),
    ('Szkolenie', 'income'),
    ('Szkolenie FAKTURA', 'income'),
    ('wpisowe', 'income'),
    ('zakup czepek', 'income'),
    ('zakup ubrania', 'expense'),
    ('FAKTURA VAT', 'expense'),
    ('Koszt', 'expense')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- REALTIME
-- ============================================

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE camps;
