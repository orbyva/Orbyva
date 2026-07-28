-- Persiste nota média do Google Books (0–5) para exibir em Para ler.

alter table public.book
  add column if not exists score_google numeric(2, 1)
    check (score_google is null or (score_google >= 0 and score_google <= 5));

comment on column public.book.score_google is
  'Nota média Google Books (0–5), informativa.';
