-- Marca-página: página em que o usuário parou.

alter table public.book
  add column if not exists current_page integer
    check (current_page is null or current_page >= 0);

comment on column public.book.current_page is
  'Marca-página — última página lida (útil em status to_read).';
