-- Água e alimentação como hábitos de saúde (feature 062).
--
-- Não há tabela nova: "beber água 8x/dia" e "comer frutas 3x/semana" são `public.habit` comuns —
-- ganham de graça streak, heatmap, meta semanal (`target_per_week`) e o check-in de
-- `public.habit_log`. Esta flag só decide se o hábito **também** aparece no Health Dashboard
-- (`/life/health`, feature 060); ele continua listado, contado nos insights e no HomeBundle como
-- qualquer outro hábito.
--
-- Sem RLS nova: `public.habit` já é escopada por `user_id = auth.uid()` (20240101000100) e
-- `public.habit_log` herda o escopo pelo dono do hábito. Uma coluna booleana não muda isso — e
-- dado de saúde é sensível, então a leitura continua restrita ao dono.

alter table public.habit
  add column if not exists is_health boolean not null default false;

comment on column public.habit.is_health is
  'Marca o hábito como sendo de cuidado com o corpo (água, alimentação) — faz o hábito aparecer também no Health Dashboard (/life/health) com o check-in do dia. O hábito continua comum em todo o resto.';

-- O dashboard busca só os hábitos de saúde do usuário; índice parcial evita varrer os demais.
create index if not exists habit_user_health_idx
  on public.habit (user_id)
  where is_health;
