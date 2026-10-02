---
prompt: |-
  E faça isso no mobile:
  [...]
  - Convites de evento. A web cria, reenvia, revoga e aceita convites (EventInviteDialog.tsx e a rota
    /events/invite/:token). O mobile não tem nada disso.
---

# 200 — Convites de evento no mobile

## Contexto
- Web:
  - `EventInviteDialog` cria convite por e-mail ou só por link, lista os convites do evento, copia o
    link, reenvia (edge function `event-invite-email`) e revoga os pendentes.
  - A rota `/events/invite/:token` mostra a prévia (RPC `get_event_invite_by_token`) e aceita
    (RPC `accept_event_invite`), conferindo se o e-mail logado é o do convite.
- Mobile: não tinha tipos, API nem tela de convite de evento.

## Decisões
- Regras puras em `mobile/src/domain/tasks/eventInvites.ts`: validação/normalização do e-mail, URLs
  (`https://orbyva.app/events/invite/<token>` para compartilhar, `orbyva://tasks/event-invite/<token>`
  dentro do app), `parseEventInviteToken` (aceita o link web, o link do app ou o código cru) e
  `eventInviteState`, que decide o que a tela de aceite mostra (pronto, outro e-mail, já aceito por
  mim, erro).
- API em `mobile/src/api/tasks/eventInvites.ts`, igual à web: convite pendente repetido para o mesmo
  e-mail vira reenvio; sem a tabela no banco, a lista volta vazia em vez de quebrar a tela.
- Telas:
  - `tasks/event-invites` ("Convidar"), aberta pelo botão "Convidar" nos eventos do modal do dia da
    agenda e nos próximos eventos da tela do projeto.
  - `tasks/event-invite/[token]` ("Convite"), aberta pelo link do app ou colando o link no campo
    "Recebeu um convite de evento? Cole o link" no fim da agenda. Aceitar leva para a agenda.

## Tarefas
- [x] Tipos `EventInvite`, `EventInviteStatus`, `EventInvitePreview` em `types/tasks.ts`.
- [x] `domain/tasks/eventInvites.ts` + `domain/tasks/__tests__/eventInvites.test.ts` (4 testes).
- [x] `api/tasks/eventInvites.ts` + `api/__tests__/eventInvites.test.ts` (7 testes, banco falso que
  aplica os filtros): reenvio no lugar de duplicata, lista vazia sem schema, revogar só pendente,
  reenviar limpa `email_sent_at` e chama a edge function, aceite repassa erro da RPC.
- [x] Telas `tasks/event-invites.tsx` e `tasks/event-invite/[token].tsx`, registradas em
  `tasks/_layout.tsx`.
- [x] Pontos de entrada em `tasks/agenda.tsx` (botão no modal do dia + campo de colar link) e
  `tasks/projects/[id].tsx`.
- [x] `npx tsc --noEmit` e `npx vitest run` no `mobile/` (90 testes).

## Como testar
1. `cd mobile && npx vitest run src/api/__tests__/eventInvites.test.ts src/domain/tasks/__tests__/eventInvites.test.ts`
   roda 11 testes.
2. No app, abra a Agenda, toque num dia com evento e em "Convidar". Envie para um e-mail: o convite
   aparece como pendente. "Reenviar" e "Revogar" mudam o estado; "Copiar link" copia
   `https://orbyva.app/events/invite/…`.
3. Logado com a conta convidada, cole esse link no campo do fim da Agenda e toque em "Abrir": a tela
   "Convite" mostra o evento; "Aceitar" leva para a agenda. Colar um texto qualquer mostra erro.
4. Logado com outra conta, o mesmo link avisa que o convite é para outro e-mail.
