\set ON_ERROR_STOP on

-- O que os índices passam a **impedir** (e o que continuam permitindo) depois da migration. É a
-- outra metade da correção 3 da feature 074: a limpeza resolve o passado, o índice resolve o futuro.
--
-- Este arquivo também decide uma escolha do cliente: `insertMaterializedTasks`
-- (`src/api/tasks/taskRows.ts`) chama `upsert(..., { ignoreDuplicates: true })` **sem**
-- `onConflict`. O bloco 3 é a prova de que nomear as colunas não funcionaria com índice parcial.
do $$
declare n int;
begin
  -- ---- 1. dose repetida agora é erro do banco, não convenção da aplicação ----------------------
  begin
    insert into public.task (user_id, medication_id, due_date, dose_time, title, status)
    values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-0000000000a1',
            '2026-08-18', '08:00', 'SEMTRI', 'todo');
    raise exception 'FALHOU: o banco aceitou uma segunda dose de 18/08 08:00';
  exception
    when unique_violation then null;
  end;

  -- ---- 2. ocorrência repetida da mesma série, idem ---------------------------------------------
  begin
    insert into public.task (user_id, recurrence_origin_id, due_date, title, status)
    values ('11111111-1111-1111-1111-111111111111', 'e0000000-0000-0000-0000-000000000001',
            '2026-08-17', 'Trocar lençóis', 'todo');
    raise exception 'FALHOU: o banco aceitou uma segunda ocorrência de 17/08 na mesma série';
  exception
    when unique_violation then null;
  end;

  -- ---- 3. `on conflict` COM alvo não funciona em índice parcial --------------------------------
  -- O Postgres não infere um índice parcial a partir de `ON CONFLICT (colunas)` sem predicado — que
  -- é exatamente o SQL que o parâmetro `on_conflict` do PostgREST gera. Daí a decisão de **não**
  -- passar `onConflict` no `upsert` do cliente. Se um dia isto parar de dar erro, a decisão pode ser
  -- revista; enquanto der, o teste documenta o porquê.
  begin
    insert into public.task (user_id, medication_id, due_date, dose_time, title, status)
    values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-0000000000a1',
            '2026-08-18', '08:00', 'SEMTRI', 'todo')
    on conflict (medication_id, due_date, dose_time) do nothing;
    raise exception 'FALHOU: o alvo nomeado passou a inferir o índice parcial — revisar taskRows.ts';
  exception
    when invalid_column_reference then null; -- 42P10
  end;

  -- ---- 4. `on conflict do nothing` SEM alvo é no-op silencioso ---------------------------------
  -- É o que a corrida entre duas `fetchTasks()` precisa: a linha que eu ia criar já existe, então
  -- não criar nada é a semântica certa — e não um 23505 vermelho na tela do usuário.
  select count(*) into n from public.task;
  insert into public.task (user_id, medication_id, due_date, dose_time, title, status)
  values ('11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-0000000000a1',
          '2026-08-18', '08:00', 'SEMTRI', 'todo')
  on conflict do nothing;
  if (select count(*) from public.task) <> n then
    raise exception 'FALHOU: `on conflict do nothing` inseriu a dose duplicada assim mesmo';
  end if;

  -- E continua inserindo o que **não** conflita.
  insert into public.task (id, user_id, medication_id, due_date, dose_time, title, status)
  values ('d0000000-0000-0000-0000-0000000000ff', '11111111-1111-1111-1111-111111111111',
          'aaaa0000-0000-0000-0000-0000000000a1', '2026-08-26', '08:00', 'SEMTRI', 'todo')
  on conflict do nothing;
  if (select count(*) from public.task) <> n + 1 then
    raise exception 'FALHOU: `on conflict do nothing` engoliu uma dose nova que não era duplicata';
  end if;
  delete from public.task where id = 'd0000000-0000-0000-0000-0000000000ff';

  -- ---- 5. o que os índices NÃO podem barrar ----------------------------------------------------
  -- Terceira parcela da mesma Recorrência Financeira no mesmo `due_date`: legítima.
  insert into public.task
    (id, user_id, recurrence_origin_id, due_date, title, status, linked_recurring_id,
     linked_installment_number)
  values ('f0000000-0000-0000-0000-0000000000ff', '11111111-1111-1111-1111-111111111111',
          'f0000000-0000-0000-0000-000000000001', '2026-09-05', 'Internet', 'todo',
          'cccccccc-cccc-cccc-cccc-cccccccccccc', 3);
  delete from public.task where id = 'f0000000-0000-0000-0000-0000000000ff';

  -- Mesma dose, mesmo dia e horário, tratamento diferente: chaves diferentes.
  insert into public.task (id, user_id, medication_id, due_date, dose_time, title, status)
  values ('d0000000-0000-0000-0000-0000000000fe', '22222222-2222-2222-2222-222222222222',
          'aaaa0000-0000-0000-0000-0000000000a2', '2026-08-19', '08:00', 'Losartana', 'todo');
  delete from public.task where id = 'd0000000-0000-0000-0000-0000000000fe';

  -- Duas tarefas avulsas iguais no mesmo dia continuam permitidas.
  insert into public.task (id, user_id, due_date, title, status) values
    ('a0000000-0000-0000-0000-0000000000ff', '11111111-1111-1111-1111-111111111111',
     '2026-08-18', 'Comprar cimento', 'todo');
  delete from public.task where id = 'a0000000-0000-0000-0000-0000000000ff';
end $$;
