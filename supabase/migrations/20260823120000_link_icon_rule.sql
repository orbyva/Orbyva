-- Feature 087: "coloque uma seção para que eu configure os ícones pre-configurados... esse regex".
--
-- Reconhecer um link externo era **código**: `detectGitHubLink` tinha a regex de issue/PR do GitHub
-- embutida e o chip escolhia entre dois ícones num `if`. Qualquer outro serviço — GitLab, Jira,
-- Figma, Linear, Notion — caía no genérico, e acrescentar um exigia deploy. Esta tabela inverte
-- isso: a regra (regex → ícone → texto derivado do link) vira dado do usuário.
--
-- Por que tabela e não `jsonb` numa coluna de preferências: `position` é o que decide a
-- **precedência** entre regras que casam a mesma URL, e reordenar/desligar uma regra tem de ser um
-- update por linha, com RLS por linha — não a reescrita de um documento inteiro.
--
-- A tabela nasce **vazia** de propósito. As oito regras semente (GitHub issue/PR, GitHub
-- repositório, GitLab, Jira, Figma, Notion, YouTube, Google Docs) são inseridas por um botão na
-- tela, como se o usuário as tivesse digitado — editáveis e apagáveis. Escrever no banco do usuário
-- por migration decidiria por ele algo que é preferência, e um `delete` dele seria desfeito no push
-- seguinte.

create table if not exists public.link_icon_rule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Nome da regra na lista ("GitHub issue"). Não participa do casamento — é como o usuário
  -- reconhece qual linha mexer.
  name text not null,
  -- A regex, como o usuário digitou. Sempre compilada com a flag `i` e **nunca** com `g` (regex
  -- global guardada em variável carrega `lastIndex` entre chamadas e falha de forma intermitente).
  pattern text not null,
  -- O "texto que deriva do link": texto livre com `$1`…`$9` referindo os grupos capturados pela
  -- `pattern`. Nulo/vazio cai no host da URL — nunca num chip sem texto.
  label_template text,
  -- Preset de `TASK_ICON_PRESETS` **ou** URL de um ícone da biblioteca (feature 086) — mutuamente
  -- exclusivos na UI, exatamente como em `task.icon_key`/`task.icon_url`.
  icon_key text,
  icon_url text,
  -- Ordem de avaliação, crescente. A **primeira** regra que casa vence e as seguintes nem são
  -- testadas: é assim que "GitHub issue" (específica) fica acima de "GitHub" (genérica).
  position integer not null default 0,
  -- "Desligar sem perder": regra desabilitada é pulada no casamento e continua na lista, o que
  -- evita apagar uma regra só para testar outra.
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  -- Defesa contra regex ruim, no banco e não só na tela: a `pattern` vem do usuário e é entrada
  -- perigosa (ReDoS). O casamento roda sempre contra uma URL — string curta —, o que já limita
  -- muito o estrago de um backtracking patológico; o teto de tamanho é a parte que não custa nada
  -- e que nenhum caminho de escrita pode contornar. `char_length` (caracteres), não `octet_length`:
  -- é a mesma régua que `String.length` no cliente.
  constraint link_icon_rule_pattern_check
    check (char_length(btrim(pattern)) > 0 and char_length(pattern) <= 200)
);

-- A única consulta da tabela: "minhas regras, na ordem de avaliação" — lida por toda lista de
-- tarefas (via cache do `useLinkIconRules`) e pela tela de configuração. Começa por `user_id`, que
-- é também o escopo que a RLS exige.
create index if not exists link_icon_rule_user_position_idx
  on public.link_icon_rule (user_id, position);

comment on table public.link_icon_rule is
  'Regras de aparência de link externo (feature 087): regex -> ícone + texto derivado do link, '
  'configuráveis pelo usuário. Avaliadas por position crescente, e a PRIMEIRA que casa vence — '
  'duas regras casando a mesma URL é o mecanismo, não erro. Regra com enabled=false é pulada sem '
  'sair da lista. Nasce vazia: as regras semente vêm de um botão na tela, não daqui.';

comment on column public.link_icon_rule.pattern is
  'A regex do usuário, no máximo 200 caracteres (defesa contra ReDoS). Compilada sempre com a flag '
  'i e nunca com g. Regra que não compila é PULADA em tempo de render, nunca derruba a lista.';
comment on column public.link_icon_rule.label_template is
  'Texto livre com $1..$9 (grupos capturados) e $$ para um $ literal. Grupo inexistente vira '
  'vazio; template vazio ou que resulte em espaços cai no host da URL. Cortado em 60 caracteres.';
comment on column public.link_icon_rule.position is
  'Ordem de avaliação (crescente) e único lugar em que a precedência entre regras é decidida.';
comment on column public.link_icon_rule.icon_url is
  'URL pública de um ícone da biblioteca (feature 086). Guarda a URL, e não o id de icon_asset, '
  'de propósito: excluir o ícone da biblioteca tira da lista sem apagar o arquivo, e a regra que '
  'já apontava para ele continua desenhando o mesmo ícone.';

alter table public.link_icon_rule enable row level security;

drop policy if exists link_icon_rule_select_own on public.link_icon_rule;
create policy link_icon_rule_select_own on public.link_icon_rule
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists link_icon_rule_insert_own on public.link_icon_rule;
create policy link_icon_rule_insert_own on public.link_icon_rule
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists link_icon_rule_update_own on public.link_icon_rule;
create policy link_icon_rule_update_own on public.link_icon_rule
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists link_icon_rule_delete_own on public.link_icon_rule;
create policy link_icon_rule_delete_own on public.link_icon_rule
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.link_icon_rule to authenticated;

-- Inclui `link_icon_rule` no wipe de conta. Sem FK para `task` (a regra é do usuário, não da
-- tarefa), então a posição na lista é livre — fica ao lado de `icon_asset`, que é o outro
-- catálogo de aparência do módulo.
create or replace function public.wipe_own_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t text;
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;

  -- Antes do loop: os convites do dono (feature 076). O `on delete cascade` de `event_id` já
  -- levaria os convites junto com os eventos, mas o delete explícito também cobre convite cujo
  -- evento já sumiu.
  if to_regclass('public.event_invite') is not null then
    delete from public.event_invite where created_by = uid;
  end if;

  foreach t in array array[
    'transaction',
    'recurring_transaction',
    'monthly_budget',
    'movie',
    'movie_episode',
    'book_note',
    'book',
    'album',
    'personal_goal',
    'habit',
    'place_visit',
    'trip',
    'vehicle',
    'class',
    'type',
    'task_time_entry',
    'task_dependency',
    'task_external_link',
    'task',
    'icon_asset',
    'link_icon_rule',
    'project_event',
    'note',
    'project',
    'tag',
    'content_link',
    'shopping_item',
    'shopping_category',
    'health_metric',
    'reminder_preference',
    'medication'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;

-- Gate de acesso Pro (mesmo padrão das demais tabelas do app).
do $$
begin
  if to_regclass('public.enforce_app_access') is null
     and not exists (
       select 1 from pg_proc where proname = 'enforce_app_access'
     ) then
    raise notice 'enforce_app_access ausente — skip trigger link_icon_rule';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.link_icon_rule;
  create trigger trg_enforce_app_access before insert or update or delete on public.link_icon_rule
    for each row execute function public.enforce_app_access();
end $$;
