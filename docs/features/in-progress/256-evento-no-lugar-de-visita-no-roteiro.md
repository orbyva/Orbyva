---
prompt: |-
  crie implemente e faça o push das seguintes features, no need for planning:
  - poder adicionar assets direto na criação de um evento
  - poder personalizar os tipos do evento, adicionando um ícone (da biblioteca de ícones gerais do
  orbyva)

  ao invéw de visita, troque por 'Evento' pode ser tanto uma visita a um lugar, museu, ou também
  pode ser tipo um concerto, um encontro, algo assim
commits:
pr:
---

# 256 — "Evento" no lugar de "visita" no roteiro

## Contexto

Uma linha do roteiro de viagem tem dois tipos: **deslocamento** (`category = 'transport'`) e tudo o
mais, que a interface inteira chama de **visita** — "Adicionar visita", "Visita adicionada!",
"Excluir esta visita?", "2 de 5 visitas concluídas".

O nome está estreito demais para o que a linha guarda. "Visita" descreve bem ir a um museu ou a um
restaurante, e descreve mal um concerto, um jantar com alguém, um encontro marcado, uma peça — todos
já cabem na mesma linha hoje (o tipo `other` existe), só não cabem no nome. **Evento** é o termo que
cobre os dois: uma visita a um lugar é um evento; um show também.

A troca é de **vocabulário de interface**, não de modelo. Nenhuma coluna, tipo ou função muda de
nome — e essa é a decisão principal desta feature.

## Decisões

- **Só o texto que o usuário lê muda.** `visit_status`, `place_visit_id`, `TripVisitStatus`,
  `sortVisitsForDay`, `summarizeDayVisits`, `onMoveVisit`, `setItineraryVisitStatus` e as rotas de
  API continuam com os nomes que têm. Renomear o modelo junto transformaria uma troca de rótulo num
  diff que atravessa banco, API, domínio, web e mobile — risco alto, ganho zero para quem usa. O
  vocabulário interno fica sendo o legado explicado, não a interface.
- **"Deslocamento" não muda.** Evento e deslocamento continuam sendo os dois tipos de linha; o
  pedido troca o nome de um, não funde os dois.
- **O módulo Lugares fica fora.** Lá "Para visitar"/"Visitado" é o **status** de um lugar
  (`place_visit`), um conceito diferente que por acaso usa a mesma palavra. Trocar aquilo por
  "evento" quebraria o sentido ("Para eventar"?).
- **Mobile entra junto.** `mobile/` tem as mesmas frases no roteiro ("Nova visita", "Adicionar
  visita", "Nenhuma visita neste dia", "Excluir esta visita?"). Deixar o app nativo dizendo "visita"
  enquanto a web diz "evento" criaria a divergência que a feature existe para tirar — e aqui o custo
  é o mesmo: trocar string.
- **Concordância de gênero vai junto.** "Visita adicionada" → "Evento adicionado"; "Todas as visitas
  foram concluídas" → "Todos os eventos foram concluídos". Trocar só o substantivo deixaria o texto
  errado em português.

## Tarefas

- [x] Web — `TripEditActivityDialog.tsx`: títulos "Adicionar/Editar visita" → "Adicionar/Editar
      evento"
- [x] Web — `TripDetail.tsx`: toasts e validações ("Informe o título do evento", "Horário conflita
      com evento", "Evento adicionado!", "Evento atualizado!", "Erro ao mover evento")
- [x] Web — `TripItineraryTab.tsx`: botão "Adicionar evento", vazio do dia, diálogo de horário
      definido, confirmação de exclusão, `aria-label` do progresso do dia e o de reabrir
- [x] Web — `ItineraryNextRoutePanel.tsx` e as mensagens de conflito de
      `domain/travel/interDayTransfers.ts`
- [x] Mobile — `app/(app)/travel/[id].tsx` e `components/travel/TripItineraryComposer.tsx`
- [x] Teste de componente travando o vocabulário novo no roteiro (`TripItineraryTab`): o botão de
      adicionar, o vazio do dia e a confirmação de exclusão dizem "evento", e "Deslocamento"
      continua intacto no card de transporte
- [x] Verificação: `npx tsc --noEmit -p tsconfig.app.json`, `npx eslint` nos arquivos tocados,
      `npx vitest run` nos testes de viagem

## Prompts

- 2026-10-06 — "crie implemente e faça o push das seguintes features, no need for planning: … ao
  invéw de visita, troque por 'Evento' pode ser tanto uma visita a um lugar, museu, ou também pode
  ser tipo um concerto, um encontro, algo assim"

## Notas

- **Os comentários de documentação que descreviam o conceito para quem lê a interface foram junto**
  (`ACTIVITY_CATEGORY_LABELS`, `TripItineraryActivity.activity_time`, o cabeçalho do
  `TripActivityAssetsDialog`), porque a 258 passa a chamar aquele conjunto de "tipos de evento" e
  dois nomes para a mesma coisa no mesmo arquivo é como a divergência começa. Os **identificadores**
  continuam intactos, como a decisão diz.
- **Concordância conferida caso a caso.** O diálogo de mover ganhou "está marcado", "movê-lo" e
  "ordená-lo"; o painel de rota virou "Todos os eventos … foram concluídos ou pulados". Um
  `sed s/visita/evento/` teria deixado meia dúzia de frases erradas.
- **`mobile/` não tem `node_modules` nesta máquina**, então `npm run typecheck` do app nativo não
  foi executado. As cinco mudanças lá são literais de string dentro de JSX que já existia — nenhuma
  troca de identificador, nenhuma mudança de forma.
- O teste novo trava as duas metades: o vocabulário novo **e** a permanência de "Deslocamento". Só a
  primeira passaria com um replace global.

## Como testar

1. **Pré-requisitos** — nenhum de banco: a feature não tem migration. Uma viagem com pelo menos um
   dia de roteiro, um evento e um deslocamento.
2. **Verificação automatizada**
   - `npx vitest run src/pages/admin/travel` — passa, incluindo o teste novo de vocabulário.
   - `npx tsc --noEmit -p tsconfig.app.json` — sem erro.
3. **Verificação manual**
   1. `/travel/<id>` → aba Roteiro. O botão no fim do dia diz **Adicionar evento**; o diálogo que
      ele abre se chama **Adicionar evento**.
   2. Salvar → o toast diz "Evento adicionado!". Editar e salvar → "Evento atualizado!".
   3. Salvar sem título → "Informe o título do evento".
   4. Menu `...` → Excluir → a confirmação diz "Excluir este evento?".
   5. Dia com mais de uma linha: o leitor de tela lê "Progresso do dia: 1 de 3 eventos concluídos".
   6. O card de deslocamento continua dizendo **Deslocamento**, e o módulo **Lugares** continua com
      "Para visitar"/"Visitado".
   7. Mobile (`mobile/`): roteiro da viagem → "Adicionar evento", "Nenhum evento neste dia",
      "Excluir este evento?".
4. **Sinais de que quebrou**
   - Qualquer tela dizendo "visita" no roteiro: sobrou string.
   - "Para visitar" virou "Para eventar" em Lugares: a troca passou do escopo.
   - Erro de tipo citando `visit_status`/`onMoveVisit`: alguém renomeou o modelo, que esta feature
     decidiu não tocar.
