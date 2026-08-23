\set ON_ERROR_STOP on

-- Estado depois da **primeira** aplicação. `05_assert_idempotente.sql` compara isto com o estado
-- depois da segunda: se a migration reescrevesse qualquer coisa (inclusive `updated_at`, que no
-- banco real tem trigger), a diferença apareceria.
create table post_1 as select * from public.task;
