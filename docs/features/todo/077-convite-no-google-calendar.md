---
prompt: |
  - enviar convite:
    - funcionalidade em que consigo criar um convite para alguém, se a pessoa já tiver conta, cria o evento na agenda dela, em caso de por exemplo ela ter conta no google também cria
---

# 077 — Convite escrito direto no Google Calendar

## Contexto

Segunda metade do prompt do convite: "em caso de por exemplo ela ter conta no google também cria".
A feature `076` entrega o convite por e-mail com anexo `.ics`, que já faz o evento entrar no Google
Calendar do convidado **com um clique dele**. Esta feature é o passo a mais: escrever no Google
Calendar **pela API**, sem clique.

Estado atual: login com Google existe e é **só identidade** —
`src/components/login-form.tsx:81-95` chama `signInWithOAuth({ provider: "google", options: {
redirectTo } })`, **sem `scopes`, sem `access_type: "offline"`, sem `prompt: "consent"`**.
`supabase/config.toml` não tem seção `[auth]` (providers são configurados no dashboard). Não existe
tabela de token, não existe `googleapis` no `package.json`, não existe nenhuma edge function de
calendário, e o `provider_token` que o Supabase devolve só vive na sessão logo após o sign-in — não
é persistido, e `provider_refresh_token` precisa ser habilitado à parte.

Ou seja: **tudo aqui é do zero**, e há um efeito colateral que atinge quem já usa o app — adicionar
escopo ao `signInWithOAuth` existente força re-consentimento de todos os usuários Google atuais.

## Decisões

- **⚠️ Esta feature precisa de confirmação do usuário antes de ser implementada.** Ela não é uma
  decisão de código: envolve criar projeto no Google Cloud, tela de consentimento, verificação do
  app pelo Google (escopo de Calendar é *sensitive scope*, exige revisão para sair do modo "testing"
  com limite de 100 usuários) e guarda de refresh tokens de terceiros. A `076` já satisfaz o prompt
  de forma útil sem nada disso. **Recomendação: só começar a `077` depois que a `076` estiver em
  `done/` e o usuário disser explicitamente que quer a integração via API.**
- **Autorização incremental, não escopo global.** O `signInWithOAuth` do login **não** ganha
  `scopes` — quem quer conectar o calendário faz isso em Configurações, num botão "Conectar Google
  Calendar" que chama `signInWithOAuth` com `scopes:
  "https://www.googleapis.com/auth/calendar.events"`, `access_type: "offline"`,
  `prompt: "consent"`. Assim ninguém que só quer entrar no app leva um pedido de acesso ao
  calendário na cara, e os usuários Google atuais não são re-consentidos à força.
  - **Descartado — pôr o escopo no login**: um clique a menos ao custo de pedir acesso ao calendário
    de todo mundo, inclusive de quem nunca vai usar convite. É o padrão que mais derruba conversão de
    login social.
- **Quem escreve no Google é o *anfitrião*, não o convidado.** O evento é criado no Google Calendar
  de quem convida, com o convidado no campo `attendees` e `sendUpdates: "all"` — aí **é o Google**
  que manda o convite para o e-mail do convidado e o coloca no calendário dele, com RSVP,
  lembretes e tudo. Isso resolve "em caso de ela ter conta no google também cria" **sem** precisar
  que o convidado conecte nada nem tenha conta no Orbyva.
  - **Descartado — pedir o token do convidado**: exigiria que ele instalasse/autorizasse o app antes
    de aceitar, que é o oposto de um convite.
- **Tabela nova `google_oauth_token`** (`user_id` PK, `refresh_token` cifrado, `scope`,
  `expires_at`, `created_at`, `updated_at`), com RLS por `user_id` e **sem policy de select para
  `authenticated`** — o refresh token nunca sai para o cliente. Quem lê é a edge function com
  `service_role`, mesmo desenho do `protect_profiles_billing()` de `20240101000300_billing.sql`.
  Incluir em `wipe_own_data()` e anexar `trg_enforce_app_access`.
- **Edge function `google-calendar-sync`**: recebe `{ invite_id }`, valida o JWT do anfitrião, lê o
  refresh token com `service_role`, troca por access token, faz `POST
  /calendar/v3/calendars/primary/events` e grava o `google_event_id` no `event_invite`. Erros de
  token (revogado, escopo removido) devolvem um código próprio para a UI dizer "reconecte sua conta
  Google" em vez de "erro".
- **A integração é sempre opcional e degradável**: sem conta Google conectada, o convite continua
  saindo por e-mail com `.ics` (feature `076`). Nenhum caminho de convite pode passar a **depender**
  do Google.
- **Revogação e desconexão são de primeira classe**: botão "Desconectar" que chama
  `https://oauth2.googleapis.com/revoke` e apaga a linha do token — sem isso o app fica guardando
  credencial de terceiro sem porta de saída.
- **Depende de `076`** (o `event_invite`, o `google_event_id` e o botão de convidar). Se a `076` não
  estiver em `done/`, parar e reportar o bloqueio em vez de reimplementar pedaços dela aqui.
- **Fora de escopo**: sincronização nos dois sentidos (ler o Google Calendar e trazer eventos para a
  agenda do Orbyva), atualização/cancelamento propagados (o `google_event_id` é gravado justamente
  para isso ser possível depois), e qualquer outro provedor (Apple, Outlook).

## Tarefas

- [ ] **Confirmar com o usuário** que quer a integração via API do Google (e não só o `.ics` da
      `076`), e que topa criar projeto no Google Cloud + passar pela verificação do escopo sensível.
      Sem esse "sim", parar aqui e reportar — não começar a implementação
- [ ] Confirmar que `docs/features/done/076-enviar-convite-para-um-evento.md` está em `done/`; se não
      estiver, parar e reportar o bloqueio
- [ ] Escrever em `## Notas` o passo a passo que **o usuário** precisa executar fora do repo: criar o
      projeto no Google Cloud, habilitar a Calendar API, configurar a tela de consentimento,
      cadastrar o redirect URI do Supabase e guardar `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` nos
      secrets das edge functions
- [ ] `supabase/migrations/<timestamp>_google_oauth_token.sql`: tabela, RLS sem select para
      `authenticated`, `trg_enforce_app_access`, entrada em `wipe_own_data()`.
      **Não rodar `supabase db push`.**
- [ ] `supabase/migrations/<timestamp>_event_invite_google_event_id.sql`: coluna `google_event_id
      text` em `event_invite` + `comment on column`. **Não rodar `supabase db push`.**
- [ ] Harness `supabase/tests/google_oauth_token/run.sh` (molde de `supabase/tests/task_is_quick/`):
      aplica as duas migrations duas vezes e prova que um `authenticated` **não** consegue ler
      `google_oauth_token` nem do próprio usuário, que `service_role` consegue, e que
      `wipe_own_data` apaga a linha. Verificação: `bash supabase/tests/google_oauth_token/run.sh`
- [ ] `src/api/googleCalendar.ts`: `connectGoogleCalendar()` (`signInWithOAuth` com escopo,
      `access_type: "offline"`, `prompt: "consent"`, `redirectTo` de volta para Configurações),
      `isGoogleCalendarConnected()`, `disconnectGoogleCalendar()`. Verificação: `npm run build && npm run lint`
- [ ] Callback de conexão: a tela de retorno lê `provider_refresh_token` da sessão e o envia para uma
      edge function `google-oauth-store` que persiste com `service_role` — o token **não** pode ser
      gravado pelo cliente. Verificação: `npm run build && npm run lint`
- [ ] `supabase/functions/google-oauth-store/index.ts` + registro em `supabase/config.toml`.
      Verificação: `deno check`
- [ ] `supabase/functions/google-calendar-sync/index.ts`: refresh do access token, `POST` do evento
      com `attendees` + `sendUpdates: "all"`, gravação do `google_event_id`, e um código de erro
      próprio para token revogado/escopo ausente. Verificação: `deno check`
- [ ] `src/domain/events/googleEvent.ts`: função pura que converte um `ProjectEvent` + e-mail do
      convidado no corpo JSON da Calendar API (fuso, `dateTime` vs `date`, `ends_at` ausente).
      Verificação: `npm run build`
- [ ] Testar `googleEvent.ts`: evento com hora, evento sem `ends_at`, fuso local correto, título com
      acento/emoji, convidado sem e-mail (convite "só link" → sem `attendees`).
      Verificação: `npm test src/domain/events`
- [ ] Seção "Google Calendar" em Configurações: estado desconectado (botão "Conectar"), conectado
      (e-mail da conta + "Desconectar"), e o estado "reconecte" quando a última sincronização deu
      token inválido. Verificação: `npm run build && npm run lint` + teste dos três estados
- [ ] `EventInviteDialog` (feature `076`) ganha, **só quando há conta conectada**, o checkbox "criar
      também no Google Calendar" (ligado por padrão) e mostra o resultado por convite (criado /
      falhou / não conectado). Verificação: `npm test src/pages/admin/tasks`
- [ ] Estados de erro de primeira classe, como tarefa própria: Google fora do ar / cota estourada
      (o convite do Orbyva **não** pode falhar junto), token revogado pelo usuário no lado do Google,
      escopo negado na tela de consentimento, e conexão iniciada mas abandonada no meio.
      Verificação: testes em `src/api/__tests__/googleCalendar.test.ts`
- [ ] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`
      (+ `npm run check:bundle`), com a contagem registrada em `## Notas`
- [ ] **Aguarda o usuário**: aplicar as duas migrations (`supabase db push`), cadastrar os secrets do
      Google e fazer o teste ponta a ponta com duas contas reais (uma convidando, uma recebendo)

## Prompts

## Notas

- 2026-09-18 — **A esteira perguntou e a resposta foi "espera".** A `/pipeline` levou a pergunta ao
  usuário (seguir com a API do Google, ou arquivar por ora e medir depois que o `.ics` da 076
  estiver de pé) com a segunda como recomendada, e o minuto de timeout passou sem resposta. Vale a
  recomendada: a 077 **fica em `todo/`, parada**, até que (a) a 076 esteja publicada e testada de
  ponta a ponta e (b) o usuário diga se o clique único do `.ics` já resolve o pedido original. Não é
  descarte — é sequenciamento: implementar OAuth do Google antes de saber se ele é necessário é o
  tipo de trabalho que fica pronto e não serve para nada.
- 2026-09-18 — **Implementação não iniciada: as duas primeiras tarefas são portões que não abriram.**
  Uma sessão da esteira pegou esta feature e parou antes de escrever qualquer código, exatamente como
  as tarefas 1 e 2 mandam. Nada foi implementado, nenhuma migration foi criada e o arquivo continua em
  `todo/`.
  - **Portão 1 — confirmação do usuário (não obtida).** A tarefa 1 exige um "sim" explícito de que se
    quer a integração via API do Google, com tudo que ela arrasta: projeto no Google Cloud, tela de
    consentimento, verificação do app pelo Google (`calendar.events` é *sensitive scope* — sem revisão
    o app fica em "testing", limitado a 100 usuários) e guarda de refresh token de terceiro no nosso
    banco. Nenhuma dessas é decisão de código.
  - **Portão 2 — a `076` não está em `done/` (verificado).**
    `docs/features/in-progress/076-enviar-convite-para-um-evento.md` ainda tem uma `- [ ]`: publicar a
    Edge Function `event-invite-email` (`supabase functions deploy event-invite-email`). Enquanto ela
    não sobe, o convite é criado mas **nenhum e-mail sai** — e é justamente o anexo `.ics` desse
    e-mail que já cumpre "em caso de ela ter conta no google também cria" com um clique do convidado.
    Vale medir o valor real da `077` **depois** que esse caminho estiver de pé: pode ser que o `.ics`
    já resolva o prompt e a integração via API deixe de valer o custo de verificação do Google.
  - Ordem correta para destravar: publicar a `event-invite-email` → fazer o teste ponta a ponta da
    `076` com duas contas reais → mover a `076` para `done/` → só então perguntar ao usuário se ainda
    quer a `077`.
