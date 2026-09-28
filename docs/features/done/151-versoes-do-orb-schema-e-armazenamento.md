---
prompt: |-
  Pedido do usuário, verbatim (bullet 5 de uma lista de melhorias de interface):

  - quero quer dê para criar versões do orb com IA, você faz uplaod de imagens, e um prompt. ele cria uma imagem png do orb, e você salva, como o seu

  O que "salvar" significa (resposta do usuário, P1): a versão gerada vira o avatar da Orb **neste
  app**, para este usuário, e as anteriores ficam numa galeria com uma marcada como ativa.

  Fatia desta feature — só onde a versão mora:

  - Cada geração é uma linha própria. "Versões", no plural, foi o que se pediu; sobrescrever a
    anterior perderia o material de comparação.
  - Bucket próprio, não `task-icons`: o teto de 1 MB e os mimes de lá foram dimensionados para
    ícone pequeno, e um PNG de 1024² estoura isso com folga.
  - Uma versão ativa por usuário, no máximo. Nenhuma ativa é estado válido (o app cai na esfera CSS).
  - RLS estritamente por `user_id`, entrada no `wipe_own_data`, gate Pro por `enforce_app_access` —
    o mesmo pacote de toda tabela nova do projeto.

  Fora desta feature: gerar a imagem (152), a tela (153) e mostrar a versão na esfera (154).
---

# 151 — Versões da Orb: schema, bucket e API

## Contexto
Sem dependências — é a base das features 152, 153 e 154, e precisa ser implementada antes das três.

Hoje a Orb não tem imagem nenhuma: a esfera é CSS (`src/components/orb/OrbSphere.tsx:22-38` +
`src/index.css:457-531`). Para o app poder mostrar uma versão gerada por IA, primeiro precisa
existir onde guardá-la: uma tabela por usuário, um bucket com teto compatível com PNG grande, e a
camada `src/api/*` que lê, ativa e apaga. Nada aqui gera imagem nem desenha tela.

O molde completo de tabela + bucket + RLS + wipe está em
`supabase/migrations/20260823110000_icon_asset.sql` (feature 086) — inclusive o teste em Docker que
prova a migration sem tocar no banco remoto (`supabase/tests/icon_asset/run.sh`).

## Decisões
- Tabela `public.orb_avatar`, uma linha por geração: `id`, `user_id`, `prompt`, `url`, `model`,
  `is_active`, `created_at`. Guardar o `prompt` e o `model` é o que permite repetir uma versão que
  deu certo depois que o secret `ORB_IMAGE_MODEL` mudar.
- Bucket próprio `orb-avatars` (público, teto 5 MB, só `image/png`), caminho
  `{userId}/{uuid}.png`. Policies ancoradas em `(storage.foldername(name))[1] = auth.uid()::text`,
  igual `task-icons` — é o que prende o arquivo ao dono. Reusar `task-icons` está fora: teto de
  1 MB (`20260814010000_task_icon.sql:15-23`).
- "Qual é a ativa" mora na própria tabela (`is_active` + índice único parcial por `user_id`), **não**
  em `public.profiles`. O planning apontava `profiles` como candidata, mas `profiles` não tem policy
  de UPDATE para `authenticated` — `20240101001200_security_hardening.sql:46` derruba
  `profiles_update_own` e nenhuma migration a recria. Uma coluna lá exigiria abrir escrita na tabela
  de billing (ou uma RPC própria) para uma preferência cosmética; o índice parcial resolve o mesmo
  problema dentro da tabela nova, com a RLS dela.
- Trocar a ativa é a RPC `public.orb_avatar_set_active(p_id uuid)`, `security definer`, e não dois
  updates do cliente: com o índice único parcial a ordem errada (ligar a nova antes de desligar a
  velha) viola a constraint, e duas chamadas separadas podem parar no meio.
- Apagar uma versão apaga **também** o arquivo do bucket, ao contrário de `icon_asset` (lá o arquivo
  fica porque tarefas antigas apontam para a URL). Aqui nada mais referencia a URL, e é um PNG
  grande.
- Nenhuma imagem de referência enviada pelo usuário é guardada: elas vão inline no pedido de geração
  (152) e morrem com a requisição. Não existe bucket de referência.

## Tarefas
- [x] Criar `supabase/migrations/20260924113000_orb_avatar.sql` com a tabela `public.orb_avatar`
      (`id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on
      delete cascade`, `prompt text not null`, `url text not null`, `model text not null`,
      `is_active boolean not null default false`, `created_at timestamptz not null default now()`,
      `constraint orb_avatar_unique_url unique (user_id, url)`), com `comment on table`/`on column`
      no mesmo tom de `20260823110000_icon_asset.sql:36-45`. Antes de criar o arquivo, rode
      `ls supabase/migrations/` e confirme que nenhum outro arquivo usa o timestamp
      `20260924113000` — duas migrations com o mesmo timestamp já causaram bug real de bookkeeping
      do Supabase CLI (ver Notas de `docs/features/done/002-vinculo-tarefa-recorrencia-financeira.md`);
      se colidir, use o minuto seguinte.
- [x] Na mesma migration: índice `orb_avatar_user_created_idx on public.orb_avatar (user_id,
      created_at desc)` (a consulta da galeria) e índice único parcial
      `orb_avatar_one_active_idx on public.orb_avatar (user_id) where is_active`, com comentário
      dizendo que é ele que garante "no máximo uma ativa por dono".
- [x] Na mesma migration: `enable row level security` + as quatro policies `orb_avatar_{select,
      insert,update,delete}_own` (`user_id = auth.uid()`), `grant select, insert, update, delete on
      public.orb_avatar to authenticated` e o `do $$` do gate Pro chamando `enforce_app_access` —
      copiando `20260823110000_icon_asset.sql:47-70` e `:136-150`.
- [x] Na mesma migration: RPC `public.orb_avatar_set_active(p_id uuid) returns void`, `language
      plpgsql`, `security definer`, `set search_path = public` — levanta exceção se `auth.uid()` for
      nulo, desliga `is_active` de todas as linhas do dono e liga só na linha `p_id` **daquele**
      dono; se nenhuma linha do dono tiver esse id, levanta exceção (não é silencioso). `grant
      execute ... to authenticated`. Comentário explicando por que RPC e não dois updates do cliente.
- [x] Na mesma migration: recriar `public.wipe_own_data()` com `'orb_avatar'` acrescentado ao array,
      preservando **todas** as tabelas já listadas em `20260823110000_icon_asset.sql:95-126` (copie a
      lista de lá e acrescente uma entrada; não reescreva de memória).
- [x] Na mesma migration: `insert into storage.buckets` do bucket `orb-avatars` (público,
      `file_size_limit` 5242880, `allowed_mime_types array['image/png']`) com `on conflict (id) do
      nothing`, mais as quatro policies de `storage.objects` ancoradas em
      `(storage.foldername(name))[1] = auth.uid()::text` — molde `20260814010000_task_icon.sql:15-56`.
- [x] Criar `supabase/tests/orb_avatar/{00_stubs.sql,01_seed.sql,run.sh}` copiando a estrutura de
      `supabase/tests/icon_asset/` (Postgres 16 em Docker, stubs de `auth.users`/`auth.uid()`/
      `enforce_app_access`/`storage`, seed de dois usuários) e o controle negativo antes da migration
      (sem ela, `public.orb_avatar` não existe e `wipe_own_data` não a conhece).
- [x] Escrever `supabase/tests/orb_avatar/02_assert_schema.sql`: colunas e tipos, FK com `on delete
      cascade`, os dois índices (inclusive o parcial, conferindo `indpred`), RLS ligada e as quatro
      policies, a RPC existindo com `security definer`, o bucket com teto 5 MB e mime `image/png`, e
      `pg_get_functiondef(wipe_own_data)` contendo `orb_avatar`. O `run.sh` aplica a migration duas
      vezes e roda este arquivo depois de cada uma (prova de idempotência).
- [x] Escrever `supabase/tests/orb_avatar/03_assert_behavior.sql`: (a) duas linhas ativas do mesmo
      dono violam `orb_avatar_one_active_idx`; (b) `orb_avatar_set_active` troca a ativa e deixa
      exatamente uma; (c) chamar a RPC com o id de uma versão de **outro** dono levanta exceção e não
      muda nada; (d) zero ativas é estado válido; (e) `wipe_own_data` apaga só as linhas do dono.
- [x] Rodar `bash supabase/tests/orb_avatar/run.sh` e deixar passando (é esta a prova da migration —
      **não** rode `supabase db push` sem confirmar com o usuário: aplica no banco remoto).
- [x] Acrescentar `export interface OrbAvatar` em `src/types/orb.ts` (id, user_id, prompt, url,
      model, is_active, created_at), com comentário dizendo que espelha `public.orb_avatar`.
- [x] Criar `src/api/orbAvatars.ts` (irmão de `src/api/orbActions.ts`) com `ORB_AVATAR_BUCKET =
      "orb-avatars"`, `fetchOrbAvatars()` (filtra `user_id` explícito e ordena `created_at desc`,
      padrão de `src/api/tasks/iconAssets.ts:27-36`), `fetchActiveOrbAvatar()` (`.eq("is_active",
      true).maybeSingle()`), `setActiveOrbAvatar(id)` (`supabase.rpc("orb_avatar_set_active", {
      p_id: id })`) e `deleteOrbAvatar(avatar)` (remove o objeto do bucket pelo caminho derivado da
      URL pública e depois apaga a linha; se o remove falhar, segue e apaga a linha mesmo assim).
- [x] Escrever `src/api/__tests__/orbAvatars.test.ts` com o duplo de query builder de
      `src/api/__tests__/iconAssets.test.ts`: afirma tabela/filtros/ordem de `fetchOrbAvatars`, o
      nome e o argumento da RPC em `setActiveOrbAvatar`, e que `deleteOrbAvatar` chama
      `storage.remove` com o caminho `{userId}/{uuid}.png` antes do delete da linha.
- [x] Rodar `npm test -- src/api/__tests__/orbAvatars.test.ts`, `npm run lint` e `npm run build`.
- [x] **Aplicar a migration no banco remoto** — `supabase db push`, rodado em 28/09/2026 com
      confirmação do usuário (não há Supabase local neste projeto e o push escreve no banco
      compartilhado — `CLAUDE.md`, "Banco de dados"). O `--dry-run` listou só
      `20260924113000_orb_avatar.sql`; o push terminou em `Finished supabase db push.` sem erro,
      com os `NOTICE ... skipping` dos `drop ... if exists` que tornam a migration idempotente. A
      confirmação é `supabase migration list`, onde `20260924113000` passou a vir com `remote`
      preenchido. `public.orb_avatar`, `public.orb_avatar_set_active` e o bucket `orb-avatars`
      agora existem para o app — as 152, 153 e 154 têm onde gravar.

## Prompts

## Notas

- **`supabase db push` rodado em 28/09/2026**, com confirmação do usuário. A prova de que a
  migration faz o que diz continua sendo o harness em Postgres 16
  (`bash supabase/tests/orb_avatar/run.sh`); a prova de que ela *chegou ao banco remoto* é o
  `supabase migration list`, que passou a trazer `20260924113000` com `remote` preenchido.
- **A conferência objeto a objeto no banco remoto ficou para quem for seguir o `## Como testar`.**
  Um `supabase db dump --schema public` para grepar `orb_avatar` direto no remoto foi barrado pelo
  sandbox desta sessão (leitura de produção), então o que está registrado aqui é o estado que o CLI
  reporta depois de aplicar, não um `select` independente. Os passos 3 e 4 do `## Como testar` são
  exatamente essa conferência e continuam valendo como o roteiro manual da feature.
- **A lista do `wipe_own_data` veio de `20260823120000_link_icon_rule.sql:124-156`, não de
  `20260823110000_icon_asset.sql:95-126`** como dizia a tarefa. `link_icon_rule` é a redefinição
  **mais recente** da função e tem uma entrada a mais (`'link_icon_rule'`): copiar a lista da
  `icon_asset` teria apagado essa tabela do wipe em silêncio — exatamente o acidente que a tarefa
  queria evitar. `02_assert_schema.sql` confere as 31 entradas antigas uma a uma, mais
  `'orb_avatar'`, mais o `delete from event_invite`.
- **A integração com a linha mais nova também preserva `note_folder`.** Essa tabela foi adicionada
  depois da baseline citada acima; migration e harness a incluem explicitamente para que o wipe de
  conta não deixe pastas de notas órfãs.
- **A RPC confere o dono antes de desligar qualquer coisa.** O desenho dizia "desliga todas as
  linhas do dono e liga só a `p_id`"; nessa ordem, um `p_id` errado (ou de outro dono) apagaria a
  versão ativa do chamador antes de levantar a exceção. Aqui o `perform ... where id = p_id and
  user_id = uid` vem primeiro, e só depois as escritas — coberto por
  `03_assert_behavior.sql` (bloco `(c)`, com id alheio e id inexistente).
- **`orbAvatarStoragePath` ficou exportada.** O desenho pedia só "o caminho derivado da URL pública"
  dentro de `deleteOrbAvatar`; virou função exportada porque a 152 precisa do mesmo caminho para
  montar a URL depois do upload, e porque ela tem casos de borda próprios (query string, URL de
  outro bucket) que valem asserção direta.
- **Detalhe de quem for mexer em `03_assert_behavior.sql`:** os blocos que rodam com
  `set local role authenticated` **não enxergam** as linhas do outro dono (é a RLS funcionando).
  Afirmar "a versão de B continua ativa" de dentro desse papel passaria por cegueira, não por
  acerto — por isso cada bloco desses termina com um `reset role` antes da conferência do vizinho.
  Esse erro aconteceu de verdade na primeira rodada do teste.

## Como testar

1. **Pré-requisitos**
   - Docker rodando (o `run.sh` sobe um Postgres 16 descartável no container
     `orbyva-orb-avatar-pg` e o remove no fim). Nada toca o banco remoto.
   - `npm ci` feito (a suíte de `src/api` roda em Vitest, ambiente `node`).
   - **Só para a parte manual (3 e 4):** a migration aplicada no banco remoto — `supabase db push`,
     **confirmando antes com o usuário**, porque não há Supabase local neste projeto. Enquanto isso
     não for feito, `public.orb_avatar`, a RPC e o bucket `orb-avatars` não existem para o app, e
     os passos 3 e 4 devolvem `relation "public.orb_avatar" does not exist`.
   - Para exercitar RLS e o gate Pro de verdade: logado no app como um usuário com acesso (Pro ou
     trial). No SQL Editor / `psql` você entra como `postgres`, que **bypassa RLS e o gate** — ali
     os casos negativos do item 4 só valem se você fizer `set local role authenticated;` e
     `select set_config('request.jwt.claim.sub', '<seu uuid>', true);` antes.

2. **Verificação automatizada**
   - `bash supabase/tests/orb_avatar/run.sh` — termina com
     `OK: 20260924113000_orb_avatar.sql validada em Postgres 16.`. Pelo caminho imprime
     `OK (controle negativo)`, dois `OK: tabela, índices (inclusive o parcial), ...` (um por
     aplicação da migration — o segundo é a prova de idempotência) e os `OK (a)`…`OK (e)` do
     comportamento. Qualquer `FALHOU (...)` no meio é a assertiva que quebrou, dizendo o que
     quebrou. Leva ~40 s por causa do container.
   - `npm test -- src/api/__tests__/orbAvatars.test.ts` — `13 passed (13)`. São os testes da
     camada `src/api`: tabela/filtros/ordem de `fetchOrbAvatars`, `maybeSingle` em
     `fetchActiveOrbAvatar`, o nome e o argumento da RPC em `setActiveOrbAvatar`, o
     `storage.remove` **antes** do delete da linha em `deleteOrbAvatar`, e os casos de
     `orbAvatarStoragePath`.
   - `npm run lint` — `0 errors` (88 warnings é a linha de base do repositório, todos de
     `react-refresh/only-export-components` em arquivos que esta feature não toca).
   - `npm run build` — `tsc -b && vite build` sem erro (o tipo novo em `src/types/orb.ts` e
     `src/api/orbAvatars.ts` entram no build do app).

3. **Verificação manual, passo a passo** (via SQL no banco remoto, com o CLI do Supabase já
   autenticado e linkado — ainda não há tela; a tela é a feature 153)
   1. Descubra seu `user_id`: no app, `/account` mostra `ID: <uuid>` no cartão do perfil.
   2. Insira duas versões falsas:
      `insert into public.orb_avatar (user_id, prompt, url, model) values ('<uuid>', 'teste 1',
      'https://exemplo/1.png', 'teste'), ('<uuid>', 'teste 2', 'https://exemplo/2.png', 'teste');`
      → as duas linhas nascem com `is_active = false` (o default), e `select count(*) from
      public.orb_avatar where user_id = '<uuid>' and is_active` volta `0`. Zero ativas é estado
      válido: é nele que o app continua mostrando a esfera CSS.
   3. `select public.orb_avatar_set_active('<id da primeira>');` → devolve vazio (a função é
      `returns void`) e `select id, is_active from public.orb_avatar where user_id = '<uuid>';`
      mostra exatamente uma linha com `is_active = true`.
   4. Ative a segunda pela mesma RPC → a primeira volta a `false` e a segunda fica `true`; nunca
      duas ao mesmo tempo. Chamar de novo com o id da que já está ativa **não** dá erro: é no-op
      (é o clique duplo na galeria).
   5. Tente ligar a segunda na mão, sem a RPC:
      `update public.orb_avatar set is_active = true where id = '<id da primeira>';` →
      `duplicate key value violates unique constraint "orb_avatar_one_active_idx"`. É o índice
      parcial fazendo o trabalho — e é por isso que a troca é RPC, não dois updates do cliente.
   6. `select public.wipe_own_data();` **numa conta de teste** → `select count(*) from
      public.orb_avatar where user_id = '<uuid>'` volta `0` (e o resto dos seus dados também some:
      é o wipe de conta inteiro).

4. **Casos de borda e caminhos negativos**
   - Ativar versão de outro usuário: `select public.orb_avatar_set_active('<id de outro dono>')`
     → `ERROR: Versão da Orb <id> não encontrada`, e nada muda na tabela de ninguém — inclusive a
     sua versão ativa continua ativa.
   - Mesma coisa com um id que não existe em lugar nenhum: mesma exceção, e você não fica sem
     versão ativa.
   - Chamar a RPC sem sessão (`auth.uid()` nulo) → `ERROR: Não autenticado`.
   - Ler a lista de outro usuário autenticado como você (`set local role authenticated` +
     `set_config` do seu uuid) → `select * from public.orb_avatar where user_id = '<outro>'` volta
     vazio (RLS), não erro. Sem o `set local role`, você é `postgres` e vê tudo — não é bug.
   - Upload no bucket fora da sua pasta (`{outro-uuid}/x.png`) → recusado pela policy de storage
     (`orb_avatars_insert_own`).
   - Arquivo acima de 5 MB ou que não seja `image/png` → o bucket recusa o upload
     (`file_size_limit` 5242880, `allowed_mime_types` `{image/png}`).
   - Reaplicar a migration inteira → nenhum erro, nenhum índice/policy/bucket duplicado e nenhuma
     linha criada (o `run.sh` já aplica duas vezes e confere as duas).

5. **Sinais de que quebrou**
   - `run.sh` parando com `FALHOU (controle negativo)` = os stubs estão criando o que a migration
     deveria criar, e o teste não prova nada.
   - Duas versões com `is_active = true` para o mesmo dono = o índice parcial não entrou (confira
     com `\d public.orb_avatar`: tem de aparecer `orb_avatar_one_active_idx ... WHERE is_active`,
     e com `UNIQUE`).
   - `orb_avatar_set_active` devolvendo sucesso mas deixando zero ativas = os dois updates saíram
     de ordem, ou o `where` do segundo perdeu o `user_id`.
   - `wipe_own_data` rodando sem erro mas deixando linhas de `orb_avatar` = o array não foi
     atualizado; e se ele passou a deixar linhas de OUTRA tabela (`link_icon_rule`, `note`…), a
     função foi recriada com uma lista incompleta — confira a lista inteira contra
     `20260823120000_link_icon_rule.sql`.
   - `insert` na tabela devolvendo `new row violates row-level security policy` estando logado =
     policy de insert com escopo errado.
   - `deleteOrbAvatar` deixando o PNG no bucket = a URL não casou com
     `orbAvatarStoragePath` (bucket errado no meio da URL, ou caminho vazio).
