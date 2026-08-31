\set ON_ERROR_STOP on

-- Reaplicar a migration não pode mudar **nada**. Numa migration que apaga linha isto é mais do que
-- higiene: um `delete` que fosse por engano relativo (ex.: "apaga a mais nova de cada par") comeria
-- uma linha a mais a cada aplicação, e a segunda passagem é o único lugar onde isso aparece.
do $$
declare n int;
begin
  select count(*) into n from (
    (select * from post_1 except select * from public.task)
    union all
    (select * from public.task except select * from post_1)
  ) diff;
  if n <> 0 then
    raise exception 'FALHOU: reaplicar a migration mudou % linha(s)', n;
  end if;

  -- E os índices continuam únicos (o `if not exists` não pode ter virado um índice duplicado).
  select count(*) into n from pg_indexes
   where schemaname = 'public'
     and indexname in ('task_medication_dose_unique_idx', 'task_recurrence_occurrence_unique_idx');
  if n <> 2 then
    raise exception 'FALHOU: existem % índices da 074 (esperados 2)', n;
  end if;
end $$;
