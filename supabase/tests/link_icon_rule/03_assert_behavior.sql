\set ON_ERROR_STOP on

-- Comportamento da tabela nova, com efeito colateral de verdade — por isso este arquivo roda por
-- último. Cada bloco abre e desfaz a própria transação (menos o último, o do wipe, que é o fim da
-- linha).

-- ---- a constraint de pattern barra o que a tela barraria ---------------------------------------
begin;
do $$
declare gigante text := repeat('a', 201);
begin
  begin
    insert into public.link_icon_rule (user_id, name, pattern) values
      ('11111111-1111-1111-1111-111111111111', 'Gigante', gigante);
    raise exception 'FALHOU (check): pattern de 201 caracteres entrou';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.link_icon_rule (user_id, name, pattern) values
      ('11111111-1111-1111-1111-111111111111', 'Vazia', '   ');
    raise exception 'FALHOU (check): pattern só com espaços entrou';
  exception
    when check_violation then null;
  end;

  -- Exatamente no teto passa: o limite é 200, não 199.
  insert into public.link_icon_rule (user_id, name, pattern) values
    ('11111111-1111-1111-1111-111111111111', 'No teto', repeat('a', 200));

  raise notice 'OK: o teto de 200 caracteres e a pattern vazia são barrados pelo banco, não só pela tela';
end $$;
rollback;

-- ---- ordem, defaults e o desligar-sem-perder ---------------------------------------------------
begin;
do $$
declare
  r record;
  ordem text[];
begin
  insert into public.link_icon_rule
    (user_id, name, pattern, label_template, icon_key, position, enabled)
  values
    ('11111111-1111-1111-1111-111111111111', 'GitHub issue',
     '^https?://github\.com/([^/]+)/([^/]+)/issues/(\d+)', '$1/$2#$3', 'github', 0, true),
    ('11111111-1111-1111-1111-111111111111', 'GitHub',
     'github\.com', 'GitHub', 'github', 1, true),
    ('11111111-1111-1111-1111-111111111111', 'Figma (desligada)',
     'figma\.com', 'Figma', 'star', 2, false);

  -- Defaults: uma regra mínima nasce visível e no topo.
  insert into public.link_icon_rule (user_id, name, pattern) values
    ('11111111-1111-1111-1111-111111111111', 'Mínima', 'exemplo\.com');
  select * into r from public.link_icon_rule where name = 'Mínima';
  if r.position <> 0 or r.enabled is not true then
    raise exception 'FALHOU (defaults): regra mínima nasceu position=% enabled=%', r.position, r.enabled;
  end if;
  if r.label_template is not null or r.icon_key is not null or r.icon_url is not null then
    raise exception 'FALHOU (defaults): template/ícone deveriam nascer nulos';
  end if;

  -- A ordem de avaliação vem do índice, e é ela que decide quem vence: "GitHub issue" antes de
  -- "GitHub".
  select array_agg(name order by position asc, name asc) into ordem
    from public.link_icon_rule
   where user_id = '11111111-1111-1111-1111-111111111111' and enabled;
  if ordem <> array['GitHub issue', 'Mínima', 'GitHub'] then
    raise exception 'FALHOU: ordem de avaliação inesperada: %', ordem;
  end if;

  -- Desligada continua na lista (é o "desligar sem perder"), fora do conjunto avaliado.
  if (select count(*) from public.link_icon_rule
       where user_id = '11111111-1111-1111-1111-111111111111') <> 4 then
    raise exception 'FALHOU: a regra desligada deveria continuar na lista';
  end if;

  -- Reordenar é update de `position`: trocar as duas primeiras inverte o vencedor.
  update public.link_icon_rule set position = 5 where name = 'GitHub issue';
  select array_agg(name order by position asc, name asc) into ordem
    from public.link_icon_rule
   where user_id = '11111111-1111-1111-1111-111111111111' and enabled;
  if ordem[1] = 'GitHub issue' then
    raise exception 'FALHOU: reordenar não mudou a ordem de avaliação';
  end if;

  raise notice 'OK: defaults, ordem por position, reordenar e regra desligada convivendo na lista';
end $$;
rollback;

-- ---- a regra aponta para um ícone da biblioteca, sem FK ----------------------------------------
begin;
do $$
declare n int;
begin
  insert into public.link_icon_rule (user_id, name, pattern, icon_url) values
    ('11111111-1111-1111-1111-111111111111', 'GitHub (ícone meu)', 'github\.com',
     'https://cdn.example/storage/task-icons/11111111/library/gh.svg');

  -- Excluir o ícone da biblioteca **não** apaga nem esvazia a regra: a 086 decidiu que excluir
  -- tira da lista sem apagar o arquivo, e a URL continua servindo.
  delete from public.icon_asset where id = 'eeeeeeee-0000-0000-0000-000000000001';

  select count(*) into n from public.link_icon_rule
   where icon_url = 'https://cdn.example/storage/task-icons/11111111/library/gh.svg';
  if n <> 1 then
    raise exception 'FALHOU: a regra perdeu o ícone quando o asset saiu da biblioteca (sobraram %)', n;
  end if;

  raise notice 'OK: icon_url é URL e não FK — tirar o ícone da lista não quebra a regra';
end $$;
rollback;

-- ---- RLS: só o dono lê e escreve ---------------------------------------------------------------
begin;
insert into public.link_icon_rule (user_id, name, pattern, label_template, position) values
  ('11111111-1111-1111-1111-111111111111', 'Minha', 'github\.com', 'GitHub', 0),
  ('22222222-2222-2222-2222-222222222222', 'Do vizinho', 'jira\.com', 'Jira', 0);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare n int;
begin
  select count(*) into n from public.link_icon_rule;
  if n <> 1 then
    raise exception 'FALHOU (RLS select): o dono deveria ver 1 regra própria, viu %', n;
  end if;

  perform 1 from public.link_icon_rule where name = 'Do vizinho';
  if found then raise exception 'FALHOU (RLS select): vazou regra de outro usuário'; end if;

  -- Insert com user_id alheio é barrado pelo WITH CHECK.
  begin
    insert into public.link_icon_rule (user_id, name, pattern) values
      ('22222222-2222-2222-2222-222222222222', 'Invasão', 'exemplo\.com');
    raise exception 'FALHOU (RLS insert): inserir regra com user_id alheio foi permitido';
  exception
    when insufficient_privilege then null;
  end;

  -- Insert próprio funciona (senão a policy estaria barrando tudo).
  insert into public.link_icon_rule (user_id, name, pattern, position) values
    ('11111111-1111-1111-1111-111111111111', 'Outra minha', 'figma\.com', 1);
  perform 1 from public.link_icon_rule where name = 'Outra minha';
  if not found then raise exception 'FALHOU: insert da própria regra não gravou'; end if;

  -- Update e delete em regra alheia não alcançam linha nenhuma (invisíveis pelo USING) — nem
  -- reordenar, que é o update que a tela mais faz.
  update public.link_icon_rule set position = 99, enabled = false
   where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS update): alterou % regra(s) alheia(s)', n; end if;

  delete from public.link_icon_rule where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS delete): apagou % regra(s) alheia(s)', n; end if;

  raise notice 'OK: RLS por auth.uid() barra leitura, insert, update (inclusive reordenar) e delete alheios';
end $$;
rollback;

-- ---- apagar a conta leva as regras (FK cascade) ------------------------------------------------
begin;
do $$
declare n int;
begin
  insert into public.link_icon_rule (user_id, name, pattern) values
    ('22222222-2222-2222-2222-222222222222', 'Do vizinho', 'jira\.com');

  delete from auth.users where id = '22222222-2222-2222-2222-222222222222';

  select count(*) into n from public.link_icon_rule
   where user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 0 then raise exception 'FALHOU (cascade): sobraram % regras da conta apagada', n; end if;

  raise notice 'OK: apagar a conta leva as regras dela';
end $$;
rollback;

-- ---- wipe_own_data leva as regras do dono (e nenhuma alheia) -----------------------------------
-- Vem por último: apaga o seed.
insert into public.link_icon_rule (user_id, name, pattern, position) values
  ('11111111-1111-1111-1111-111111111111', 'Minha 1', 'github\.com', 0),
  ('11111111-1111-1111-1111-111111111111', 'Minha 2', 'figma\.com', 1),
  ('22222222-2222-2222-2222-222222222222', 'Do vizinho', 'jira\.com', 0);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare n int;
begin
  perform public.wipe_own_data();

  select count(*) into n from public.link_icon_rule
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (wipe): sobraram % regras do dono', n; end if;

  select count(*) into n from public.link_icon_rule
   where user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then raise exception 'FALHOU (wipe): a regra do outro usuário sumiu (sobraram %)', n; end if;

  -- E o que já estava na lista antes desta migration continua sendo apagado.
  select count(*) into n from public.icon_asset
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (wipe): sobraram % ícones do dono', n; end if;

  raise notice 'OK: wipe_own_data apaga as regras do usuário sem tocar nas alheias nem perder icon_asset';
end $$;
