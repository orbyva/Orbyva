\set ON_ERROR_STOP on

-- Congela o estado depois da **primeira** aplicação. A migration é rodada de novo em seguida (é o
-- que acontece se o `supabase db push` for repetido, ou se ela entrar junto com as outras 14
-- pendentes) e `06_assert_idempotente.sql` compara linha a linha contra isto.
create table post_1 as select * from public.task;
