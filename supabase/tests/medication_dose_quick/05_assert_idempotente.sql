\set ON_ERROR_STOP on

-- Idempotência provada linha a linha, não presumida. Reaplicar o backfill (o que acontece de
-- verdade se o `supabase db push` for repetido, ou se a migration entrar num banco que já a
-- recebeu) não pode mudar **nenhuma** coluna de **nenhuma** linha.
do $$
declare n int;
begin
  select count(*) into n from (
    (select * from post_1 except select * from public.task)
    union all
    (select * from public.task except select * from post_1)
  ) diff;
  if n <> 0 then
    raise exception 'FALHOU: reaplicar o backfill mudou % linha(s) — a migration não é idempotente', n;
  end if;
end $$;
