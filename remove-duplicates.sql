-- Skrypt do usuwania duplikatów z tabeli transactions
-- Zachowuje pierwszą (najwcześniej wgraną) kopię transakcji i usuwa wszystkie jej zduplikowane wersje.

DELETE FROM transactions
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY date, amount, title, sender
                   ORDER BY created_at ASC
               ) as rnum
        FROM transactions
    ) t
    WHERE t.rnum > 1
);
