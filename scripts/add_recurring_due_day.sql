-- Adiciona dia de vencimento e quantidade de parcelas às recorrências.
-- Execute no SQL Editor do Supabase.

ALTER TABLE recurring_transaction
  ADD COLUMN IF NOT EXISTS due_day INTEGER CHECK (due_day >= 1 AND due_day <= 31),
  ADD COLUMN IF NOT EXISTS installment_count INTEGER CHECK (installment_count >= 1),
  ADD COLUMN IF NOT EXISTS payment_start_date DATE;

COMMENT ON COLUMN recurring_transaction.due_day IS 'Dia do mês em que cada parcela vence (1-31)';
COMMENT ON COLUMN recurring_transaction.installment_count IS 'Quantidade total de parcelas do parcelamento';
COMMENT ON COLUMN recurring_transaction.payment_start_date IS 'Mês/ano de referência da primeira parcela';
