---
prompt: |
  - enviar convite:
    - funcionalidade em que consigo criar um convite para alguém, se a pessoa já tiver conta, cria o evento na agenda dela, em caso de por exemplo ela ter conta no google também cria
---

# 076 — Enviar convite para um evento da agenda

## Contexto

Hoje o módulo de Produtividade é **estritamente de um usuário só**: a `done/001` decidiu isso por
escrito ("RLS estritamente por `user_id` — sem convites/colaboração, igual Finanças/Hábitos/Metas").
Esta feature reverte essa decisão para os eventos de agenda; a reversão precisa estar registrada.

O que já existe e é a base pronta: **o módulo de Viagens tem um sistema de convite completo e
funcionando**, e ele é o molde a copiar quase literalmente —
`supabase/migrations/20240101000900_shared_trips.sql` (`trip_invite` com `token`/`email`/`status`/
`expires_at`/`accepted_by`, `trip_member`, e os helpers `security definer` `is_trip_member`/
`is_trip_owner` que as policies de RLS consultam), `20240101001000_shared_trips_invite_fix.sql`
(a RPC `accept_trip_invite`, que trava a linha `for update`, confere status/expiração e casa
`auth.jwt() ->> 'email'` com `invite.email`), `20240101001200_security_hardening.sql:76-116`
(`get_trip_invite_by_token`, que deixa um autenticado não-membro pré-visualizar o convite sem
policy permissiva), a edge function `supabase/functions/trip-invite-email/` (Resend + o template
`_shared/emailHtml.ts`), `src/api/tripMembers.ts:90-230` (criar/listar/revogar/aceitar, com
fallback quando a RPC não existe), `src/components/TripMembersDialog.tsx:82-140` (a UI: campo de
e-mail, copiar link, toasts) e a página `src/pages/admin/travel/TripInviteAccept.tsx` na rota
`travel/invite/:token`.

O que **não** existe: nenhum diretório de usuários (`public.profiles` é só billing — `plan`,
`stripe_*` — sem e-mail, nome ou avatar, e sem policy de UPDATE para `authenticated`), então **não
há como o cliente resolver e-mail → user_id**. O jeito do `trip_invite` é justamente não resolver:
guarda um token opaco, manda o link por e-mail e só descobre quem é a pessoa **na hora do aceite**.

Do lado do evento: `project_event`
(`supabase/migrations/20260806130000_project_notes_status_events.sql:22-37`) é uma tabela fina —
`user_id`, `project_id` **not null**, `title`, `starts_at`, `ends_at`, `created_at`. Sem status, sem
descrição, sem recorrência. A API (`src/api/tasks/projectEvents.ts`) tem `fetch`/`create`/`delete` e
**não tem `updateProjectEvent`**. Os eventos são geridos dentro de `ProjectFormDialog.tsx:56`
(feature `done/065`) e desenhados como chips na agenda (`AgendaGrid.tsx`, `AgendaHourGrid.tsx`).

Google Calendar é feature separada (`077`): identidade Google já existe
(`src/components/login-form.tsx:81-95`, `signInWithOAuth` **sem `scopes`**), mas escrever no
calendário exige escopo novo, `access_type: 'offline'`, armazenamento de refresh token e re-consent
de todo mundo que já entra com Google — nada disso existe.

## Decisões

- **Reversão explícita da decisão da `done/001` — só para eventos.** A `001` decidiu, por escrito,
  "RLS estritamente por `user_id` — sem convites/colaboração, igual Finanças/Hábitos/Metas". Esta
  feature reverte isso **exclusivamente para `project_event`**, e mesmo assim sem afrouxar uma única
  policy: `project_event` continua `user_id = auth.uid()` nas 4 policies, e o convidado recebe uma
  **cópia própria** do evento na conta dele (linha nova, `user_id` = ele). Não existe leitura
  cruzada, não existe `is_event_member`, e tarefa/projeto/subtarefa/tempo seguem estritamente
  monousuário. O que muda de fato é: (a) uma tabela nova `event_invite`, cujas policies são por
  `created_by`; (b) duas RPCs `security definer` que são o único caminho pelo qual um usuário toca
  em algo criado por outro. O motivo da reversão é o prompt da feature ("criar um convite para
  alguém... cria o evento na agenda dela"): sem convite, o módulo não atende ao pedido. O
  apontamento recíproco está em `docs/features/done/001-nucleo-tarefas-projetos.md`, seção Notas.
- **Escopo v1: convidar alguém para um `project_event`.** É o que o prompt pede ("cria o evento na
  agenda dela"). Convidar para uma *tarefa* fica de fora — tarefa tem status, prioridade, subtarefa,
  recorrência e sincronizações (compras, recorrência financeira); compartilhar isso é um produto
  inteiro, não um convite.
- **Identidade do convidado é resolvida no aceite, não no envio** — igual `trip_invite`. Quem
  convida digita um e-mail; a gente cria a linha de convite com token, manda o link e pronto. Quando
  a pessoa abre o link:
  - **já logada com esse e-mail** → um clique em "Aceitar" e o evento aparece na agenda dela;
  - **logada com outro e-mail** → a tela diz para qual e-mail o convite foi feito, sem aceitar;
  - **sem conta** → cai no fluxo de login/cadastro que já existe e volta pro link do convite.
  - **Descartado — resolver e-mail → user_id no envio e escrever direto na agenda do outro**: exigiria
    uma RPC `security definer` nova consultando `auth.users`, e faria o app escrever na conta de
    terceiro sem nenhum consentimento. "Se a pessoa já tiver conta, cria o evento na agenda dela"
    continua verdade — só que a um clique de distância, não silenciosamente.
- **Tabela nova `event_invite`**, espelhando `trip_invite`: `id`, `event_id` (FK `project_event`,
  `on delete cascade`), `email text` (nullable, para o modo "só link"), `token text unique`,
  `created_by`, `status check ('pending'|'accepted'|'revoked'|'expired')`, `expires_at` (14 dias,
  como Viagens), `accepted_by`, `accepted_event_id` (o evento criado do lado do convidado — é o que
  permite propagar cancelamento depois), `email_sent_at`, `created_at`.
- **O evento do convidado é uma cópia própria, não um acesso compartilhado.** Aceitar cria um
  `project_event` na conta dele. Simples, sem policy de leitura cruzada, e a agenda dele já mostra
  tudo sem uma linha de código nova (`fetchProjectEvents` já busca todos os eventos do usuário sem
  filtro de projeto).
  - **Descartado — `event_attendee` com RLS cruzada por helper `is_event_attendee`**: é o desenho
    "certo" a longo prazo (permite o anfitrião ver quem aceitou e propagar edição), mas exige mexer
    nas policies de `project_event` e nos consumidores da agenda. Fica para quando houver pedido de
    "ver quem confirmou". Registrado aqui de propósito.
- **`project_event.project_id` passa a ser nullable.** É `not null` hoje, e o convidado não tem
  projeto nenhum do anfitrião. Migration de `alter column ... drop not null` + fallback de cor na
  agenda (hoje a cor vem do projeto). A alternativa — criar um projeto "Convites" na conta do
  convidado — foi descartada por poluir a lista de projetos dele sem ele pedir.
- **Reaproveitar o stack de e-mail que existe**: edge function nova `event-invite-email` copiada de
  `trip-invite-email` (Resend via `_shared/resend.ts`, template `_shared/emailHtml.ts`, verificação
  de que `invite.created_by === user.id`, carimbo de `email_sent_at`), com `verify_jwt` em
  `supabase/config.toml` no mesmo padrão. Se o e-mail falhar, o convite **continua válido** e a UI
  oferece "copiar link" — é o fallback que `TripMembersDialog` já usa.
- **A RPC de aceite é `security definer`, obrigatoriamente.** O trigger `trg_enforce_app_access`
  dispara em `insert/update/delete` e derruba com `42501` quem está fora do trial/Pro
  (`20260723120000_app_access_enforce.sql`), então um convidado com trial vencido não conseguiria
  aceitar por `INSERT` direto. `accept_trip_invite` já resolve assim; copiar a estrutura (lock
  `for update`, checar status/expiração, casar `auth.jwt() ->> 'email'`, marcar `accepted`).
- **Obrigações de boilerplate de tabela nova, que já derrubaram feature antes**: incluir
  `event_invite` no array de `wipe_own_data()` (cópia mais recente em
  `20260816220000_reminder_preference.sql`) e anexar o `trg_enforce_app_access` no bloco `do $$`
  idempotente (molde em `20260806130000_project_notes_status_events.sql:118-133`).
- **Sem `supabase db push`** — migrations escritas e validadas em Postgres 16 descartável, aplicação
  fica como tarefa "Aguarda o usuário", como nas features `061`/`070`/`071`/`073`.
- **Anexo `.ics` no e-mail do convite** (`text/calendar`), gerado por função pura. É o que faz
  "também cria no Google" funcionar hoje sem OAuth nenhum: o convidado clica no anexo e o evento
  entra no Google/Apple/Outlook Calendar dele. A integração via API do Google é a `077` e é
  opcional em cima disto.
- **Onde fica o botão**: ao lado de cada evento em `ProjectFormDialog.tsx` (onde eventos já são
  criados/apagados, feature `065`) e no popover/dialog do chip de evento da agenda.

## Tarefas

- [x] Registrar em `## Decisões` desta feature (e num apontamento em
      `docs/features/done/001-nucleo-tarefas-projetos.md`, seção Notas) que a decisão "sem
      convites/colaboração" do módulo de Produtividade está sendo revertida **só para eventos**, e
      por quê. Verificação: leitura
- [x] `supabase/migrations/20260820110000_project_event_project_optional.sql`:
      `alter table public.project_event alter column project_id drop not null` +
      `comment on column` explicando que evento sem projeto = evento recebido por convite.
      **Não rodar `supabase db push`.**
- [x] `supabase/migrations/20260820120000_event_invite.sql`: tabela `event_invite` com as colunas
      decididas, índices (`token` unique, `event_id`), as 4 policies de RLS por `user_id`/`created_by`,
      o `trg_enforce_app_access` e a inclusão em `wipe_own_data()`. **Não rodar `supabase db push`.**
- [x] `supabase/migrations/20260820130000_event_invite_rpcs.sql`: `get_event_invite_by_token(token)` e
      `accept_event_invite(token)`, ambas `security definer stable`/`volatile`, `grant execute to
      authenticated`, copiando a estrutura de `accept_trip_invite` (lock `for update`, status,
      expiração, casamento de e-mail pelo JWT, criação do `project_event` do convidado com
      `project_id = null`, `accepted_by`/`accepted_event_id`/`status = 'accepted'`).
      **Não rodar `supabase db push`.**
- [x] Harness `supabase/tests/event_invite/run.sh` (molde de `supabase/tests/task_is_quick/`):
      Postgres 16 descartável, aplica as três migrations **duas vezes**. Verificação: `bash supabase/tests/event_invite/run.sh`
- [x] Asserções do harness: aceitar cria o evento do convidado; aceitar duas vezes é no-op (não gera
      dois eventos); convite expirado/revogado não aceita; e-mail diferente do JWT não aceita; RLS
      impede um terceiro de ler o convite; convidado com `has_app_access()` falso **consegue** aceitar
      (é o ponto do `security definer`); `wipe_own_data` leva os convites do dono. Verificação: o mesmo `run.sh`
- [x] `src/types/events.ts` (ou estender `src/types/tasks.ts`): `EventInvite`, `EventInviteStatus`,
      `EventInviteCreateRequest`; `ProjectEvent.project_id` vira `string | null`. Verificação:
      `npx tsc -p tsconfig.app.json --noEmit`
- [x] Corrigir os consumidores que assumem `project_id` não-nulo (agenda: cor do chip vinda do
      projeto, agrupamento por projeto, `ProjectDetail`) com um fallback neutro para evento sem
      projeto. Verificação: `npm run build` + teste na agenda de que um evento sem projeto renderiza
- [x] `src/api/tasks/eventInvites.ts`: `createEventInvite(eventId, email?)` (token aleatório, 14 dias
      de validade, `functions.invoke("event-invite-email")` best-effort), `listEventInvites(eventId)`,
      `revokeEventInvite(id)`, `getEventInviteByToken(token)`, `acceptEventInvite(token)` — no molde
      de `src/api/tripMembers.ts:90-230`, inclusive o fallback gracioso quando a RPC não existe (banco
      ainda sem a migration). Verificação: `npm run build && npm run lint`
- [x] `src/api/__tests__/eventInvites.test.ts` (Supabase falso): criar gera token e chama a função de
      e-mail sem quebrar quando ela falha; revogar muda o status; aceitar propaga o erro da RPC como
      mensagem amigável; banco sem a RPC devolve o fallback em vez de estourar. Verificação: `npm test src/api`
- [x] `src/domain/events/ics.ts`: `buildEventIcs({ uid, title, startsAt, endsAt, organizerEmail,
      attendeeEmail, url })` puro, devolvendo o VCALENDAR/VEVENT como string. Verificação: `npm run build`
- [x] Testar `buildEventIcs`: dobra de linha em 75 octetos, escape de `,`/`;`/`\n` no `SUMMARY`,
      `DTSTART`/`DTEND` em UTC (`...Z`), evento sem `ends_at` (usa `DURATION` ou +1h — decidir e
      travar por teste), acentos em UTF-8. Verificação: `npm test src/domain/events`
- [x] `supabase/functions/event-invite-email/index.ts`: cópia de `trip-invite-email` — autenticada,
      corpo `{ invite_id }`, confere `created_by === user.id`, monta
      `${siteUrl}/events/invite/${token}`, usa `emailShell`, anexa o `.ics` (`content_type:
      "text/calendar"`), envia por Resend e carimba `email_sent_at`. Registrar em
      `supabase/config.toml` no mesmo padrão dos outros. Verificação: `deno check` / `npm run lint`
- [x] `src/pages/admin/tasks/EventInviteAccept.tsx` + rota `events/invite/:token` em
      `src/routes.tsx`, no molde de `TripInviteAccept.tsx`: pré-visualização do evento, botão
      "Aceitar", e os três estados de identidade (logado com o e-mail certo / logado com outro /
      deslogado). Verificação: `npm run build && npm run lint`
- [x] Estados de erro/vazio/carregamento da página de aceite, como tarefa própria: token inexistente,
      convite expirado, convite revogado, convite já aceito por outra pessoa, e o skeleton enquanto
      busca — cada um com texto próprio, não um "erro" genérico. Verificação:
      `src/pages/admin/tasks/__tests__/EventInviteAccept.test.tsx`
- [x] `EventInviteDialog.tsx` (`src/pages/admin/tasks/`): campo de e-mail (`type="email"`,
      `autocomplete="email"`, label acima, validação no blur com mensagem afirmativa), botão
      "Enviar convite", botão "Copiar link" e a lista dos convites já enviados com status e ação de
      revogar — no molde de `TripMembersDialog.tsx:82-140`. Verificação: `npm run build && npm run lint`
- [x] Testes de `EventInviteDialog`: e-mail inválido não envia e mostra o que corrigir; envio com
      sucesso mostra o convite na lista como "pendente"; falha do e-mail ainda cria o convite e
      destaca "copiar link"; revogar tira o convite da lista. Verificação: `npm test src/pages/admin/tasks`
- [x] Ligar o botão "Convidar" em `ProjectFormDialog.tsx` (ao lado de cada evento) e no chip de
      evento da agenda (`AgendaGrid.tsx`). Verificação: `npm run build && npm run lint` + teste de
      que o dialog abre pelos dois caminhos
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`
      (+ `npm run check:bundle`), com a contagem registrada em `## Notas`
- [x] Verificação do pedido literal, por teste: criar um convite para um e-mail, aceitar como um
      segundo usuário e provar que (a) o evento aparece na agenda dele e (b) o e-mail enviado carrega
      o `.ics` que o Google/Apple Calendar entende
- [x] **Migrations aplicadas pelo usuário** (2026-08-23): o usuário rodou `supabase db push` e
      confirmou que as três migrations desta feature (`20260820110000_project_event_project_optional`,
      `20260820120000_event_invite`, `20260820130000_event_invite_rpcs`) estão no banco remoto.
      `project_event.project_id` é nullable, a tabela `event_invite` existe com RLS e as duas RPCs
      `security definer` estão publicadas.
      **A conferência SQL pós-push NÃO foi executada por esta sessão** (lê o banco remoto) — ficou
      em `## Notas` como pendência do usuário, na versão post-hoc: os números "antes" nunca foram
      anotados, então a comparação `count(*) from project_event` antes × depois **não é mais
      executável**. A migration só afrouxa um `not null` e cria tabela nova, sem tocar em linha
      existente, então o buraco é pequeno — mas fica registrado em vez de escondido.
- [ ] **Aguarda o usuário — publicar a função de e-mail (o `db push` NÃO cobre isto).**
      `supabase db push` aplica migrations e só. A Edge Function `event-invite-email` continua **não
      publicada**, e sem ela o convite é criado mas **nenhum e-mail sai** — o usuário só tem o
      fallback "copiar link", e o anexo `.ics`, que é o que cumpre a terceira perna do `prompt:`
      ("em caso de por exemplo ela ter conta no google também cria"), nunca chega a ninguém. Por
      isso esta feature **não** foi para `done/`.
      ```bash
      supabase functions deploy event-invite-email
      # segredos que a função usa (os mesmos de trip-invite-email):
      #   RESEND_API_KEY, RESEND_FROM, SITE_URL
      supabase secrets list     # conferir que os três já existem antes de testar
      ```
      Depois disso, o **teste ponta a ponta com duas contas de verdade** descrito no fim desta
      tarefa é o que fecha a feature — ele é o único passo que a suíte não cobre, porque envolve
      caixa de entrada real.

      **Conferência SQL pós-push (pendência do usuário, não executada por esta sessão):**
      ```sql
      -- o "antes" nunca foi anotado; o que se pode afirmar é que a migration não podia
      -- apagar evento (ela só faz `drop not null`). Proxy: nenhum evento ficou apontando
      -- para projeto inexistente. Tem de dar 0.
      select count(*) from public.project_event e
       where e.project_id is not null
         and not exists (select 1 from public.project p where p.id = e.project_id);
      select is_nullable from information_schema.columns
       where table_schema='public' and table_name='project_event' and column_name='project_id';  -- YES
      select relrowsecurity from pg_class where oid='public.event_invite'::regclass;             -- true
      select count(*) from pg_policies
       where schemaname='public' and tablename='event_invite';                                   -- 4
      select proname, prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and proname in ('get_event_invite_by_token','accept_event_invite');                     -- 2, ambas t
      select pg_get_functiondef(oid) like '%event_invite%' from pg_proc
       where proname='wipe_own_data';                                                            -- t
      ```

      **Teste ponta a ponta, com duas contas de verdade** (é o único passo que a suíte não cobre,
      porque envolve caixa de entrada real): convidar a conta B a partir de um evento da conta A,
      conferir que o e-mail chegou com o anexo `convite.ics`, abrir o anexo (o evento tem de entrar
      no Google/Apple Calendar), e então aceitar pelo link — o evento aparece na agenda da conta B
      com `project_id` nulo, e o convite fica `accepted` na conta A.

## Prompts

- 2026-08-31 — `db push` parou em `project_event` ausente, verbatim:

```
ERROR: relation "public.project_event" does not exist (SQLSTATE 42P01)
At statement: 0
alter table public.project_event
```

## Notas

- **`db push` 2026-08-31: a tabela `project_event` não existia neste remoto.** A 006
  (`20260806130000`) já estava no histórico (como a coluna `project.notes`: o arquivo local cresceu
  depois do apply), então o `create table` nunca rodou de novo. A 076 (`20260820110000`) fazia só
  `alter column drop not null` e quebrou com 42P01. A migration falhou e **não** entrou no
  histórico: o arquivo passou a criar a tabela se faltar (`project_id` já nullable), depois o
  `drop not null` (no-op se já era), RLS e o trigger. `wipe_own_data` **não** foi reescrito aqui —
  as migrations já aplicadas neste push (notas, compras, medicação…) já listam `project_event` e o
  loop ignora relação ausente.


- **A premissa "a RPC é `security definer` para atravessar o gate Pro" estava errada, e medir isso
  desenterrou um bug real e maior.** `trg_enforce_app_access` chama `has_app_access()`, que decide
  por `auth.uid()` — e `auth.uid()` continua sendo o do convidado dentro da RPC. `security definer`
  não muda isso. Medido em `supabase/tests/event_invite/05_assert_accept.sql`: com o gate
  funcionando, o `insert` direto **e** a RPC caem os dois com `42501`.
  O que hoje deixa qualquer um aceitar é outra coisa: `has_app_access()` e `enforce_app_access()`
  são `security definer` com dono `postgres`, então o `public.is_db_admin()` que ambas consultam vê
  `current_user = 'postgres'` e devolve `true` **para todo mundo**
  (`20260723120000_app_access_enforce.sql`). Ou seja, **o gate de trial/Pro é inerte no banco
  inteiro** — não só para convites. Isso é um bug de monetização pré-existente, fora do escopo da
  076, e consertá-lo é decisão do usuário (passaria a cobrar de quem hoje escreve de graça). Está
  congelado nos dois sentidos pelo harness: (1) hoje o convidado fora do trial aceita; (2) com
  `is_db_admin` consertado, os dois caminhos são barrados — quem for consertar o gate lê ali que
  precisa decidir se aceitar convite é escrita paga.
  O motivo **real** e suficiente de as duas RPCs serem `security definer` continua de pé e está
  testado: sob a RLS normal (`user_id = auth.uid()`) o convidado não consegue nem ler o
  `project_event` que vai copiar, nem o `event_invite` que o menciona.
- `wipe_own_data` estava perdendo `reminder_preference`: a `20260816220000_reminder_preference.sql`
  incluiu a tabela na lista e a `20260816230000_medication.sql`, escrita em paralelo, reescreveu a
  função a partir de uma cópia mais velha e deixou cair. A versão da `20260820120000_event_invite.sql`
  devolve a tabela para a lista. Assertado em `03_assert_schema.sql`.
- `event_invite` não tem coluna `user_id` (a de dono é `created_by`, como em `trip_invite`), então
  não cabe no loop por array de `wipe_own_data` — vai num `delete` explícito antes do loop.
- Convidar o mesmo e-mail duas vezes para o mesmo evento é barrado no banco pelo índice parcial
  `event_invite_pending_email_idx` (`where status = 'pending' and email is not null`), e a API trata
  a violação como "reenviar o convite que já existe" em vez de erro. Revogar libera reconvidar o
  mesmo e-mail. E, mesmo que dois tokens válidos cheguem à mesma pessoa (link + e-mail), o aceite
  reaproveita a cópia que ela já tem em vez de duplicar o evento na agenda dela.
- Marcar um convite vencido como `expired` dentro de `accept_event_invite` não persiste: o
  `raise exception` logo depois desfaz o `update` da mesma subtransação. É o mesmo comportamento de
  `accept_trip_invite` e não tem efeito de segurança (a checagem de `expires_at` roda a cada
  tentativa), então ficou como está — anotado para não parecer bug quando alguém for ler o status.
- **Verificação final (20/08/2026)**: `npx tsc -p tsconfig.app.json --noEmit` limpo, `npm run build`
  ok, `npm run lint` com 0 erros (80 warnings de `react-refresh/only-export-components`,
  pré-existentes), `npm run check:bundle` "Bundle budget OK" (teto de rota 160 KB gzip mantido),
  e `npm test` em **195 arquivos / 1990 testes / 0 falhas** — a baseline era 185/1866, ou seja
  +10 arquivos e +124 testes, todos desta feature. O único "Errors 1" do relatório é o erro
  pós-teardown já conhecido e intermitente (Radix focus-scope + fake timers em
  `HealthDashboard.reminders.test.tsx`), não relacionado.
  `bash supabase/tests/event_invite/run.sh` passa com controle negativo.
- **Duas regressões reais encontradas pela suíte e corrigidas**: `ProjectFormDialog.test.tsx` e
  `ProjectDetail.edit-project.test.tsx` achavam o botão de excluir evento por posição
  (`eventRow.querySelector("button")`), e o botão de convidar passou a ser o primeiro da linha. O
  conserto foi dar `aria-label` ao botão de excluir (`Excluir <título>`) e mirar por rótulo nos dois
  testes — a assertiva de comportamento continua a mesma, e a linha ficou mais acessível.
- **Desvio de rota, de propósito**: `travel/invite/:token` é protegida, mas
  `/events/invite/:token` é **pública**. O link de convite chega por e-mail para alguém que pode não
  ter sessão; sob `ProtectedRoute` o redirect para `/login` engoliria o token. A tela trata o estado
  deslogado e manda para `/login?next=<link do convite>`. Isso exigiu `?next=` no login
  (`src/lib/nextPath.ts` + `login-form.tsx` + `LoginEntry` em `routes.tsx`), saneado contra open
  redirect (`//evil.com`, `/\evil.com`, `https://…`, caractere de controle) e coberto em
  `src/lib/__tests__/nextPath.test.ts`.
- **`event-invite-email` não entra em `supabase/config.toml`**: lá só moram as funções que precisam
  de `verify_jwt = false` (webhook do Stripe, crons). `trip-invite-email` também não está lá — o
  padrão para função chamada pelo app autenticado é o default (`verify_jwt` ligado), e a função
  ainda confere `created_by === user.id` por cima.
- **Dois espelhos front ↔ Edge** (`_shared/ics.ts` e `_shared/inviteEmail.ts`), no mesmo arranjo de
  `mapsQuotaRules.ts` — Deno não importa o front. Como espelho manual sempre diverge,
  `src/domain/events/__tests__/ics.mirror.test.ts` compara os arquivos caractere a caractere e
  falha se alguém corrigir um e esquecer o outro. Toda a lógica de "este convite vira e-mail?" e
  "o que vai no e-mail" (inclusive o anexo `.ics`) mora nos espelhos, testada; o `index.ts` da Edge
  ficou só com I/O.
- `sendResendEmail` (`_shared/resend.ts`) ganhou `attachments` opcional. A chave só é enviada quando
  há anexo — a API do Resend rejeita `attachments: []`.

### Rastreabilidade do `prompt:` (checagem de satisfação, 20/08/2026)

O pedido original tem três partes. Para cada uma, o artefato que prova:

1. **"consigo criar um convite para alguém"**
   - `src/api/__tests__/eventInvites.test.ts` — "grava o convite com token aleatório, 14 dias de
     validade e status pendente" e "dois convites seguidos usam tokens diferentes" (22 testes).
   - `src/pages/admin/tasks/__tests__/EventInviteDialog.test.tsx` — "envio com sucesso mostra o
     convite na lista como pendente" (15 testes).
   - `src/pages/admin/tasks/__tests__/EventInviteEntryPoints.test.tsx` — o botão existe e abre o
     dialog **pelos dois caminhos** (ProjectFormDialog e chip da agenda).
   - `supabase/tests/event_invite/04_assert_rls.sql` — em Postgres 16 real: o anfitrião cria e lê os
     próprios convites; terceiro não lê, não revoga, não apaga, não convida para evento alheio nem
     forja `created_by`.

2. **"se a pessoa já tiver conta, cria o evento na agenda dela"**
   - `supabase/tests/event_invite/05_assert_accept.sql` — aceitar cria a linha em `project_event` do
     convidado com `project_id` nulo, título e horário copiados; aceitar duas vezes devolve o mesmo
     evento; segundo convite para o mesmo evento não duplica; expirado/revogado/e-mail errado/token
     inexistente não passam; autoconvite barrado.
   - `src/domain/events/__tests__/pedido-literal.test.tsx`, bloco (a) — a cópia sem projeto é
     **desenhada** na agenda do convidado, mesmo com ele não tendo projeto nenhum.
   - `src/pages/admin/tasks/__tests__/EventInviteAccept.test.tsx` — o clique em "Aceitar" chama
     `acceptEventInvite` e leva para a agenda; os três estados de identidade (e-mail certo, outro
     e-mail, deslogado) e os cinco de erro têm texto próprio (16 testes).
   - `src/pages/admin/tasks/__tests__/AgendaGrid.invite-event.test.tsx` — evento sem projeto
     renderiza com cor neutra e rótulo "Recebido por convite", sem link para projeto inexistente.

3. **"em caso de por exemplo ela ter conta no google também cria"**
   - `src/domain/events/__tests__/pedido-literal.test.tsx`, bloco (b) — o anexo que a Edge Function
     manda (`buildInviteEmailPayload`, a mesma função que `index.ts` chama) decodifica num VCALENDAR
     completo com `SUMMARY`/`DTSTART`/`DTEND`/`UID`, `content_type: text/calendar`, e **nenhuma linha
     acima de 75 octetos** — que é o que faz o Google aceitar o arquivo.
   - `src/domain/events/__tests__/ics.test.ts` — RFC 5545 travada: dobra por octeto (não caractere),
     escape de `,`/`;`/`\`/quebra de linha, UTC com `Z`, `DURATION:PT1H` quando não há `ends_at`,
     acentos em UTF-8 (21 testes).
   - Escopo: a integração via API do Google (OAuth, escopo de calendário, refresh token) **não** está
     aqui — é a feature `077`, como decidido. O que a 076 entrega é o `.ics`, que resolve o caso do
     prompt com um clique e sem re-consent de ninguém.

**O que ainda não está confirmado, e por quê**: que o e-mail de fato chega numa caixa de entrada
real e que o Google importa o anexo. Isso depende de `supabase functions deploy` +
`RESEND_API_KEY`/`SITE_URL` no projeto remoto, e disparar e-mail de verdade não é coisa que a suíte
deva fazer. Está escrito como passo do usuário na última tarefa, com roteiro. Por isso a feature
**não** foi movida para `done/`.

### Estado em 2026-08-23 — migrations aplicadas, função de e-mail ainda não

O usuário rodou `supabase db push` e confirmou. As **três migrations desta feature estão no banco
remoto**; a tarefa correspondente foi marcada e reescrita para dizer exatamente isso.

**A feature continua em `in-progress/`, e isto é decisão consciente, não esquecimento.** A tarefa
original juntava duas coisas num item só: "aplicar as três migrations **e publicar a função de
e-mail**". `supabase db push` faz a primeira e não faz a segunda — ele aplica migrations, não
publica Edge Function. Como o usuário confirmou o push e nada além dele, a tarefa foi **partida em
duas**: a metade das migrations foi marcada `[x]`, e `supabase functions deploy event-invite-email`
(mais os segredos `RESEND_API_KEY`/`RESEND_FROM`/`SITE_URL`) virou um `- [ ]` próprio.

Por que isso impede o `done/` em vez de virar só uma nota: sem a função publicada, `createEventInvite`
grava o convite e a chamada de e-mail falha em silêncio (é best-effort de propósito). O convite
continua válido pelo "copiar link" — a perna 1 e a perna 2 do `prompt:` funcionam —, mas **nenhum
e-mail sai**, e com ele não sai o anexo `.ics`. O `.ics` é justamente o que esta feature entrega
para cumprir a terceira perna do pedido ("em caso de por exemplo ela ter conta no google também
cria"), como está escrito nas Decisões. Um terço do prompt-mãe depende de um passo que ninguém
executou, então o item 8 do `CLAUDE.md` não passa e o arquivo fica onde está.

O código, esse, está inteiro e verificado: 195 arquivos / 1990 testes / 0 falhas na rodada da
feature, o harness `supabase/tests/event_invite/run.sh` passando com controle negativo, e a
rastreabilidade das três pernas do prompt logo acima. O que falta é deploy e uma caixa de entrada
real — nada de implementação.
