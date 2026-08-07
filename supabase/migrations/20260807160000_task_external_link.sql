-- Feature 013: link externo genérico na tarefa (ex.: issue do GitHub) — provider é detectado no
-- cliente a partir da URL, sem chamada de API nem token. Campo nasce genérico pra não exigir
-- migração nova quando outro provider for reconhecido no futuro.

alter table public.task
  add column if not exists external_url text;

alter table public.task
  add column if not exists external_provider text;
