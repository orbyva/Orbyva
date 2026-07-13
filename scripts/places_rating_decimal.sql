-- Permite notas decimais em place_visit (ex.: 4.5 estrelas)
-- Execute no SQL Editor do Supabase se a coluna rating for INTEGER.

ALTER TABLE place_visit
  ALTER COLUMN rating TYPE DECIMAL(2, 1)
  USING rating::DECIMAL(2, 1);

ALTER TABLE place_visit
  DROP CONSTRAINT IF EXISTS place_visit_rating_check;

ALTER TABLE place_visit
  ADD CONSTRAINT place_visit_rating_check
  CHECK (rating IS NULL OR (rating >= 0.5 AND rating <= 5));
