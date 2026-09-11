---
prompt: |
  Eu quero criar o app do orbyva, utilizando react native para subir na App Store e Play Store.

  Eu vou continuar utilizando esse backend mesmo, mas só ter outro front além do Web.

  Como posso fazer isso? Crio um outro repo para isso ou não?
---

# 098 — App nativo (Expo), mesmo backend, migração por módulo

## Contexto

O Orbyva hoje é um SPA Vite + um cliente fino de extensão Chrome, os dois no mesmo repo, falando
com o mesmo Supabase (Auth, Postgres + RLS, Storage, Edge Functions). O pedido é um **terceiro
cliente**: React Native nas lojas, sem backend novo.

A UI web (Radix/shadcn, Tailwind, Gantt, Excalidraw, CodeMirror) não atravessa para o nativo. O que
atravessa é o contrato: `src/types`, `src/domain`, o padrão de `src/api` e o projeto Supabase. O
desenvolvimento é incremental, na ordem dos grupos da sidebar, com uma fundação (Expo + auth +
shell) **antes** de qualquer tela de módulo.

## Decisões

- **Mesmo repositório, pasta `mobile/` com Expo** (EAS Build / EAS Submit). Espelha `extension/`:
  segundo cliente, `package.json` próprio, backend único. O Vite da raiz **não** mistura Metro,
  `react-native` nem scripts de loja.
  - **Descartado — repo `orbyva-mobile` separado**: um produto, um histórico, `docs/features`
    juntos. Isolar o git só adia o drift de tipos/API.
  - **Descartado — monorepo `apps/web` + `packages/domain` no dia 1**: migrar o SPA atual para
    workspaces não entrega tela nenhuma e arrisca o CI/Vercel. Extrair pacote compartilhado só
    quando importar `src/domain` / `src/types` do mobile começar a doer.
  - **Descartado — Capacitor / WebView do PWA**: a Apple rejeita “site embrulhado”; a UI atual é
    densa demais para telefone.
- **Mesmo projeto Supabase.** Anon key no app (EAS secrets / `expo-constants`), nunca service
  role. RLS por `user_id` continua sendo a tenancy. Sem API Nest/Firebase paralela.
- **Ordem de migração (grupos da `app-sidebar.tsx`)**, cada um só começa quando o anterior está
  verificável no simulador:
  1. Fundação (auth + shell) — não é grupo da sidebar, é pré-requisito
  2. **Finanças** — Dashboard, Transações, Recorrências, Orçamento, Categorias
  3. **Início** — `/home` (hub) e `/timeline`
  4. **Produtividade** — Tarefas, Projetos, Notas, Lista de Compras
  5. **Vida** — Hábitos, Saúde, Metas, Lugares, Viagens, Veículos
  6. **Conteúdo** — Cinema, Livros, Música, Links
- **Início vem depois de Finanças de propósito.** O hub web (`LifeDashboard`) já é puxado por
  saldo, orçamento, recorrências e alerta de ledger velho. A v1 nativa do Início acende com dados
  de Finanças de verdade; tiles dos módulos ainda não portados ficam visíveis mas **não navegam**
  (rótulo “Em breve”), em vez de abrir o site ou fingir um dashboard vazio. A timeline v1 só
  agrega o módulo `finance`.
  - **Descartado — portar o hub primeiro**: ficaria um Início oco ou um clone web que fala de
    hábitos/cinema sem tela nativa para ir.
  - **Descartado — clone 1:1 pixel a pixel**: cada módulo no nativo é paridade de **dados e ações
    centrais**, com UI nativa (listas, sheets, tabs). Gantt, canvas Excalidraw, editor CodeMirror,
    landing/marketing e `/ops` ficam no web.
- **Auth nativa não é o OAuth web.** Deep link `orbyva://auth/callback` + `expo-auth-session`.
  Google continua; **Sign in with Apple é obrigatório na App Store** se houver Google no iOS.
  Redirect URLs entram no dashboard do Supabase. Sessão persistida no SecureStore.
- **CORS das Edge Functions** (`supabase/functions/_shared/cors.ts`) hoje só libera `SITE_URL` e
  localhost. Chamada nativa (`functions.invoke`) precisa ser aceita quando não há `Origin` de
  browser — ajuste mínimo, sem abrir `*`.
- **Cliente Supabase no mobile não usa `import.meta.env`.** URL/anon key via env do Expo. A camada
  `src/api/finance/*` do web fica onde está; o mobile ganha wrappers próprios (ou importa domínio
  puro) até existir pacote compartilhado. Não refatorar o web só para “preparar” o nativo.
- **Chrome nativo:** hamburger + sidebar (grupos da `app-sidebar`). Alertas no
  canto superior direito do header (sino + badge). `+` em FAB no canto inferior
  direito: no submódulo (Transações, Recorrências) cria direto; no Início/
  Timeline abre o mix do web (transação, filme, hábito, lugar, viagem); no
  dashboard de Finanças abre as criações de finanças. Módulos sem tela nativa
  ficam “Em breve”. Escondido em conta, forms e orçamento.
  Sem barra inferior Início · Nova · Alertas — Início já está na sidebar.
  Tabs Finanças+Conta saíram. Módulos ainda sem tela nativa aparecem como
  “Em breve”. Início vira a rota inicial (hub enxuto) antes da fatia 2 completa.
- **Fora desta feature (não bloqueia o primeiro TestFlight de Finanças):** push notification
  (conta nova + tokens; a 063 já registrou que o PWA não tem push), billing in-app (StoreKit /
  Play Billing — o gate continua o Stripe web), Sign in with Apple *além* do mínimo da loja,
  offline-first completo.

## Tarefas

### 0 — Fundação

- [x] Scaffold Expo em `mobile/` (SDK atual, TypeScript, Expo Router): app.json / eas.json,
      `.gitignore` local, README curto de como rodar (`npx expo start`). A raiz do repo continua
      `npm run build` / `npm run lint` / `npm test` verdes — o mobile **não** entra nesses scripts
      ainda. Verificação: `cd mobile && npx tsc --noEmit` ✓; `npx expo export --platform android`
      ✓ (1338 modules); `npm run lint` da raiz ✓ (0 erros, `mobile/**` no ignore)
- [x] Cliente Supabase no mobile (URL + anon key via extra do Expo) + tela de login (e-mail mágico
      e/ou Google) com deep link registrado no Supabase. Sem sessão válida, nada do app autenticado
      monta. Verificação: bundle Android inclui login/SecureStore; **login real no simulador
      ainda é do usuário** (Redirect URLs no dashboard — ver Notas)
- [x] Sign in with Apple no iOS (capacidade `usesAppleSignIn` + plugin `expo-apple-authentication`
      + `signInWithIdToken`). Verificação: botão só monta se `isAvailableAsync()`; **provider
      Apple no Supabase + App ID ainda são passo do dashboard** (ver Notas)
- [x] CORS das Edge Functions: request nativa (sem Origin de `orbyva.app`) não toma 403. Ajuste em
      `supabase/functions/_shared/cors.ts` + nota de que **precisa de deploy da function** (e
      confirmação do usuário antes de qualquer `supabase db push` — aqui não há migration).
      Verificação: a tab Finanças chama `home-bundle` após o login. **Deploy das functions
      aguarda um sim** — o código no repo ainda não está no ar
- [x] Shell autenticado: tab Finanças (placeholder) + tab Conta (e-mail, plano read-only, sair).
      Sem marketing, sem `/ops`. Verificação: `signOut` + `secureStoreAdapter.removeItem` da
      `AUTH_STORAGE_KEY`; gate `Redirect` se não houver sessão
- [x] Chrome nativo: hamburger + sidebar (grupos da `app-sidebar`, “Em breve”
      nos módulos ainda sem tela), sino de alertas no header direito, FAB `+`
      no canto inferior direito. Sem barra inferior. Lista de transações no
      padrão `MobileStackList` (ícone, descrição, categoria · subcategoria,
      badge de natureza, valor, data, editar/excluir). Verificação:
      `npx tsc --noEmit` ✓
- [x] Tema claro/escuro explícito como no web (`light` default, persistido, não segue o
      sistema). Toggle em Conta e na sidebar. Verificação: `npx tsc --noEmit` ✓

### 1 — Finanças

- [x] Dashboard de Finanças nativo: KPIs do mês (saldo / despesa / teto), alertas de recorrência
      vencida, donut ou lista por tipo. Reusar regras de `src/domain/finance` (copiar ou importar
      o arquivo puro — sem puxar React DOM). Verificação: `npx tsc --noEmit` ✓; mesmos RPCs do
      web (`get_value_by_nature_for_month`, `get_value_by_type_for_month`,
      `vw_monthly_budget_summary`). **Conferência visual na mesma conta ainda depende do login
      no simulador**
- [x] Dashboard: toque no donut (fatia/legenda) mostra categoria + valor e filtra o extrato do
      mês (data, subcategoria, descrição, valor), no padrão do web. Toque no gráfico de linha
      mostra receita/despesa do mês. Verificação: `npx tsc --noEmit` ✓
- [x] Transações: lista paginada do mês, criar / editar / excluir, categoria + subcategoria, valor.
      Toast/erro amigável no padrão do web (`getErrorMessage`). Verificação: `npx tsc --noEmit` ✓;
      CRUD visível no web na hora; RLS: outra conta não vê
- [x] Recorrências: lista, marcar/desfazer pagamento (`paid_at`), criar conta/parcela. Projeção
      (aba do web) pode ser só leitura na v1. Verificação: `npx tsc --noEmit` ✓
- [x] Orçamento mensal: planejado vs gasto do mês corrente, alerta de estouro. Duplicar mês fica
      para um prompt seguinte se doer. Verificação: `npx tsc --noEmit` ✓
- [x] Categorias: listar / criar categoria e subcategoria (cor + nome). Arrastar
      subcategoria para outra categoria (igual ao board do web). Sem edição/exclusão
      e sem drag-and-drop de reordenar categorias. Verificação: `cd mobile && npx tsc --noEmit` ✓
- [x] Linha em `docs/stack.md`: “cliente nativo: Expo em `mobile/`, mesmo Supabase”. README da
      raiz: um parágrafo apontando `mobile/README.md`. Verificação: `npm run build` e `npm run lint`
      da raiz intactos

### 2 — Início

- [x] Hub nativo (`/home`): saudação, hero de saldo/orçamento (já existentes em Finanças), alertas
      de recorrência, grade de módulos. Tiles de grupos ainda não portados: “Em breve”, sem navegação.
      Verificação: saldo do hub = dashboard de Finanças; tile Finanças abre o módulo nativo.
      `npx tsc --noEmit` ✓
- [x] Timeline nativa filtrada a `module === "finance"` até os outros grupos existirem. Verificação:
      lançamento/recorrência recente aparece; item de hábito/cinema **não** aparece ainda.
      `npx tsc --noEmit` ✓
- [x] Tab Início passa a ser a tab inicial pós-login (Finanças continua acessível). Verificação:
      cold start autenticado cai no hub (`Redirect` → `/(app)/home`, `initialRouteName="home"`)

### 3 — Produtividade

- [x] Tarefas v1: lista (hoje / atrasadas / inbox), concluir, criar com título + prazo. Sem Gantt,
      sem Kanban, sem Live widget flutuante nesta fatia. Verificação: `cd mobile && npx tsc --noEmit` ✓;
      **concluir no app some da lista web depende do login no simulador**
- [x] Projetos v1: lista + detalhe com as tarefas do projeto (visão lista). Verificação:
      `npx tsc --noEmit` ✓; filtro por projeto na lista de tarefas
- [x] Notas v1: lista + abrir/editar markdown simples (TextInput / WebView de preview). Sem canvas
      Excalidraw, sem mermaid/wikilinks. Verificação: `npx tsc --noEmit` ✓
- [x] Lista de compras v1: itens, check, adicionar. Verificação: `npx tsc --noEmit` ✓
- [x] Hub/Timeline passam a incluir produtividade (tarefas do dia, atrasadas). Tiles deixam de ser
      “Em breve”. Verificação: hub mostra contagem de atrasadas; `npx tsc --noEmit` ✓

### 3b — Produtividade, segundo passo (ações do dia a dia)

- [x] Tarefas: abrir para editar (título, prazo, descrição) e excluir; seção de concluídas recentes
      com desfazer. Sem recorrência, subtarefas, Gantt. Verificação: `cd mobile && npx tsc --noEmit` ✓
- [x] Projetos: criar e editar (nome, cor). Sem kanban, eventos, arquivar. Verificação:
      `npx tsc --noEmit` ✓
- [x] Notas: autosave ao editar e excluir. Sem canvas/preview. Verificação: `npx tsc --noEmit` ✓
- [x] Compras: escolher ou criar categoria ao adicionar. Sem quantidade/projeto/virar tarefa.
      Verificação: `npx tsc --noEmit` ✓

### 3c — Tarefas, o que ainda faltava no dia a dia

- [x] Projeto no formulário (escolher / trocar / sem projeto). Verificação: `npx tsc --noEmit` ✓
- [x] Busca na lista de tarefas. Verificação: `npx tsc --noEmit` ✓
- [x] Prioridade no form e na lista. Verificação: `npx tsc --noEmit` ✓
- [x] Horário do prazo. Verificação: `npx tsc --noEmit` ✓
- [x] Subtarefas (adicionar / concluir / excluir). Verificação: `npx tsc --noEmit` ✓
- [x] Recorrência simples (diária / semanal / mensal) + materializar ocorrências até hoje no
      `fetchTasks`. Sem vínculo financeiro, sem medicação, sem Gantt. Verificação:
      `npx tsc --noEmit` ✓

### 3d — Produtividade, paridade com o web

UI nativa (listas, chips, sheets). Não é clone pixel a pixel. Fora de propósito nesta fatia:
Excalidraw, Gantt SVG, timer Live, convite de evento, doses/consultas (Vida), regras de ícone de
link.

- [x] Tarefas: caixas da agenda do web; visões Lista / Kanban / Concluídas; status; tags; intervalo
      e término da recorrência; links externos; excluir série. Verificação: `npx tsc --noEmit` ✓
- [x] Projetos: status, excluir, agrupar por status, eventos, abas no detalhe
      (lista / kanban / compras / notas). Verificação: `npx tsc --noEmit` ✓
- [x] Notas: projeto, filtro, prévia markdown simples, excluir na lista. Canvas continua só no web.
      Verificação: `npx tsc --noEmit` ✓
- [x] Compras: editar/excluir item, quantidade/unidade, categoria (editar/excluir + projeto),
      filtro por projeto, virar tarefa. Verificação: `npx tsc --noEmit` ✓
- [x] Prévia markdown das notas: texto quebra certo, títulos na escala do editor, área com scroll.
      Verificação: `npx tsc --noEmit` ✓
- [x] Subtarefas: editar título no form, abrir o form da própria subtarefa (lista e form).
      Verificação: `npx tsc --noEmit` ✓
- [x] Kanban: arrastar tarefa entre A fazer / Fazendo / Feito (`setTaskStatusApi`).
      Verificação: `npx tsc --noEmit` ✓

### 3e — Front nativo (linguagem visual, forms, chrome)

- [x] Tokens: tipografia (título 22 / valor 28 / corpo 16 / meta 13), card único, ChipBar
      em scroll horizontal, toast + haptic no lugar do erro vermelho cru. Verificação:
      `npx tsc --noEmit` ✓
- [x] Hub só com módulos que navegam; sidebar e FAB sem “Em breve”. Verificação:
      `npx tsc --noEmit` ✓
- [x] Forms longos (tarefa, compra, recorrência): essenciais visíveis, resto em seção
      recolhida. Verificação: `npx tsc --noEmit` ✓
- [x] Kanban em colunas horizontais. Listas usam o card do sistema. Verificação:
      `npx tsc --noEmit` ✓

### 3f — Performance nativa

- [x] Início sem fetch de Vida/Conteúdo; hub não materializa série de tarefas.
      Listas não piscam spinner ao voltar. Card sem sombra iOS pesada.
      Verificação: `npx tsc --noEmit` ✓

### 3g — Subtarefa: prazo e prioridade visíveis

- [x] Lista e kanban mostram prazo e prioridade da subtarefa. Verificação: `npx tsc --noEmit`
- [x] Form da mãe: editar prazo/prioridade na linha; form da subtarefa com prazo
      (não além da mãe) e prioridade visível. Verificação: `npx tsc --noEmit`

### 4 — Vida

- [x] Hábitos: check-in do dia + faixa da semana. Verificação: `npx tsc --noEmit` ✓
- [x] Saúde v1: próxima dose / marcar tomada; lista de tratamentos. Consultas e métricas corporais
      se couberem sem inflar; senão ficam para prompt seguinte. Verificação: `npx tsc --noEmit` ✓
- [x] Metas: lista + progresso. Verificação: `npx tsc --noEmit` ✓
- [x] Lugares / Viagens / Veículos v1: listas + detalhe read-mostly; criar lugar ou viagem completa
      pode ficar na fatia seguinte se o form web for grande demais. Verificação: `npx tsc --noEmit` ✓
- [x] Hub/Timeline passam a incluir vida. Verificação: hábitos de hoje no hub são acionáveis;
      `npx tsc --noEmit` ✓

### 4b — Vida, paridade do dia a dia

UI nativa. Sem clone pixel, sem clima/share-card/autocomplete Google, sem lançar
despesa no ledger de Finanças (fica `transaction_id` nulo). Push de lembrete continua
fora (063/098). Convite de viagem gera link (`orbyva.app/travel/invite/…`).

- [x] Hábitos: visão mês (heatmap), insights, vínculo com meta, `is_health`.
      Verificação: `npx tsc --noEmit` ✓
- [x] Saúde: CRUD de tratamento (materializa doses), consulta, métricas, lembretes.
      Verificação: `npx tsc --noEmit` ✓
- [x] Lugares: criar / editar / excluir / marcar visita.
      Verificação: `npx tsc --noEmit` ✓
- [x] Viagens: criar / editar / excluir, paradas, roteiro, checklist, gastos, convite.
      Verificação: `npx tsc --noEmit` ✓
- [x] Veículos: CRUD do carro, manutenção, abastecimento, documentos.
      Verificação: `npx tsc --noEmit` ✓

### 4c — Vida, paridade visual e de ações

UI nativa, mesmas ações do web no dia a dia. Sem clima/share-card/autocomplete
Google, sem rateio de gasto. Push continua fora.

- [x] Saúde: “medicação” (não tratamento); seções com ícone/cor; hábitos de
      saúde do dia. Verificação: `npx tsc --noEmit` ✓
- [x] Metas financeiras: destinar valor, rotina em Recorrências, sincronizar
      do ledger. Verificação: `npx tsc --noEmit` ✓
- [x] Lugares: só Para visitar / Visitados; busca, tipo, ícones. Verificação:
      `npx tsc --noEmit` ✓
- [x] Viagens: cards com countdown, checklist, orçamento; filtros Ativas /
      Concluídas. Verificação: `npx tsc --noEmit` ✓
- [x] Veículos: ícones, alertas, consumo, abas no detalhe, editar km.
      Verificação: `npx tsc --noEmit` ✓

### 5 — Conteúdo

- [x] Cinema / Livros / Música / Links v1: listas por status + mudar status. Busca de catálogo
      (TMDB / Google Books / Spotify via Edge) na criação, se o CORS/invoke da fundação já
      estiver ok; senão cadastro manual e busca na fatia seguinte. Verificação: filme marcado
      “assistido” no app some de “para assistir” no web
- [x] Hub/Timeline incluem conteúdo (ex. último filme). Nenhum tile “Em breve”
      restante dos cinco grupos. Verificação: grade do hub navega para os
      cinco grupos nativos

### 5b — Conteúdo, paridade do dia a dia

UI nativa. Sem share-card / recap canvas / push de episódio novo.

- [x] Cinema: insights, filtros (tipo/gênero/nota/favorito), detalhe, episódios
      de série (TMDB se a chave existir). Verificação: `npx tsc --noEmit` ✓
- [x] Livros: insights, filtros, detalhe, marca-página, notas de leitura.
      Verificação: `npx tsc --noEmit` ✓
- [x] Música: insights, filtros, detalhe, notas por faixa (Spotify se o
      invoke responder). Verificação: `npx tsc --noEmit` ✓
- [x] Links: filtro por tipo, tags, favorito. Verificação: `npx tsc --noEmit` ✓

### 6 — Lojas (depois dos módulos, ou após Finanças se quiser TestFlight cedo)

- [ ] EAS: perfil `preview` (TestFlight / Play internal) e `production`. Ícones / splash /
      bundle id (`app.orbyva` ou o que o usuário confirmar). **Não submeter às lojas sem o
      usuário pedir.** Verificação: `eas build --profile preview` gera artefato iOS e Android

### 7 — Início e conta, paridade do web

UI nativa. Sem IAP/Stripe no app (plano só leitura + link orbyva.app/account).
Sem offline-first. Push remoto (token + Edge) **não entra sem sim** para migration
e deploy.

- [x] Sino: recorrência, orçamento, tarefas atrasadas, metas, veículos/documentos,
      episódio novo (TMDB); dispensar e restaurar. Verificação: `npx tsc --noEmit` ✓
- [x] Busca global no chrome (transações, cinema, livros, música, lugares, viagens,
      metas, hábitos, veículos, notas). Verificação: `npx tsc --noEmit` ✓
- [x] Timeline: filtro por módulo + hábitos do dia, lugares visitados, veículos.
      Verificação: `npx tsc --noEmit` ✓
- [x] Cartão do mês no Início (share nativo). Verificação: `npx tsc --noEmit` ✓
- [x] Conta: nome/avatar, Termos/Privacidade, ver plano. Verificação: `npx tsc --noEmit` ✓
- [x] Exportar CSV, limpar dados, excluir conta. Verificação: `npx tsc --noEmit` ✓
- [x] Preferências de alerta (quais kinds o sino mostra). Verificação: `npx tsc --noEmit` ✓
- [x] Convite de amigos (link/share). Verificação: `npx tsc --noEmit` ✓
- [x] Onboarding (tour + categorias padrão), checklist 1ª tx, guias de módulo,
      refazer tour. Verificação: `npx tsc --noEmit` ✓
- [ ] Push nativo (expo-notifications + token). **Só com confirmação** de migration
      e deploy de Edge. Sem o sim, permanece `[ ]`

### 8 — Finanças, paridade do web

UI nativa. Sem reordenar categorias (o web também não tem).

- [x] Orçamento: criar / editar / excluir teto; sugerir pelos 3 meses; duplicar
      mês; aplicar nos 12 meses. Verificação: `npx tsc --noEmit`
- [x] Categorias: editar e excluir categoria e subcategoria. Verificação:
      `npx tsc --noEmit`
- [x] Recorrência: editar, arquivar, reativar, excluir, renovar fixa.
      Verificação: `npx tsc --noEmit`
- [x] Projeção de recorrências (mês a mês) + simular compra parcelada.
      Verificação: `npx tsc --noEmit`
- [x] Projeção: toque na barra (ou na linha) foca o mês e filtra a lista.
      Verificação: `npx tsc --noEmit`
- [x] Projeção: toque no mês sem recarregar; haptic + fade no card.
      Verificação: `npx tsc --noEmit`
- [x] Cabeçalhos fixos (orçamento, transações, recorrências, categorias)
      recolhíveis. Verificação: `npx tsc --noEmit`

### 9 — Vida, paridade do web

UI nativa. Push de lembrete continua na tarefa de push (migration). Sem IAP.

- [x] Lugares: autocomplete Google, visita no extrato, histórico.
      Verificação: `npx tsc --noEmit`
- [x] Veículos: editar manutenção / abastecimento / documento; lançar no
      ledger. Verificação: `npx tsc --noEmit`
- [x] Viagens: gasto (editar, pessoal/conjunto, pagador), rateio, extrato.
      Verificação: `npx tsc --noEmit`
- [x] Viagens: aceitar convite, membros (sair / remover).
      Verificação: `npx tsc --noEmit`
- [x] Viagens: prazos, editar roteiro (atividade / nota do dia).
      Verificação: `npx tsc --noEmit`
- [x] Viagens: clima + mala, rotas entre paradas, cartão para compartilhar.
      Verificação: `npx tsc --noEmit`
- [x] Lugares/viagens: busca Google com “perto de mim” (`expo-location`).
      Sem GPS a busca continua. Verificação: `npx tsc --noEmit`

### 10 — Produtividade, o que ainda faltava no dia a dia

UI nativa. Sem Gantt, Excalidraw, timer Live, Eisenhower, grade da semana,
biblioteca de ícone, regras regex de link.

- [x] Tarefa ↔ compra ↔ parcela financeira (concluir/reabrir nos dois lados).
      Verificação: `npx tsc --noEmit`
- [x] Links externos: preservar comentário; abrir na lista.
      Verificação: `npx tsc --noEmit`
- [x] Lista: filtro hoje / prioridade; status rápido no card.
      Verificação: `npx tsc --noEmit`
- [x] Recorrência: contagem de ocorrências + mensal por dia da semana.
      Verificação: `npx tsc --noEmit`
- [x] Notas: vínculos (tarefa / projeto / meta) + toolbar markdown + share.
      Verificação: `npx tsc --noEmit`
- [x] Tags: cor, editar, excluir. Compras: aviso de exclusão em cascata;
      abrir fornecedor/tarefa; item na categoria. Verificação: `npx tsc --noEmit`

## Prompts

- 2026-09-10 — Eu quero criar o app do orbyva, utilizando react native para subir na App Store e Play Store. Eu vou continuar utilizando esse backend mesmo, mas só ter outro front além do Web. Como posso fazer isso? Crio um outro repo para isso ou não?
- 2026-09-10 — Eu queria ir fazendo o desenvolvimento incremental. Ir migrando por módulos na seguinte ordem: Finanças, Início, Produtividade, Vida e conteúdo.
- 2026-09-10 — Quando logo com google ele parece redirecionar para a web. Acho que esqueci de configurar algo
- 2026-09-10 — /Users/pedroynk/Downloads/ScreenRecording_09-10-2026 14-27-05_1.MP4 Está ainda indo para orbyva.app
- 2026-09-10 — Nos gráficos, Quando clicar, mostre o valor e o nome da categoria. Na parte que mostra o valor da categoria, o que acha de criar tipo uma tabelinha como se fosse um extrato mais detalhado igual no web? E quando clicar no gráfico filtrar
- 2026-09-10 — Cara, gostei. Ta funcionando. Mas é o seguinte: Eu acho que o rodapé ali poderia ficar igual no web na versão mobile e continuar aquela sidebar ali para ver os outros módulos e tudo mais. Eu acho que a tabela de transações poderia ficar mais igual a versão web também
- 2026-09-10 — Ordene as transações da registrada mais recente até a mais antiga. Coloque o datepicker na parte de criar uma transação. Essa escolha de data ta ruim demais
- 2026-09-10 — Eu to pensando em tirar esse botão do início aí e colocar os alertas lá no campo superior direito e esse + ficar no canto inferior direito. O que acha?
- 2026-09-10 — Quando eu clico na sidebar em uma página que já estou. É como se fosse para ela novamente e aparece o botão de voltar para onde eu estava. Ta meio estranho
- 2026-09-10 — Termine de fazer a aba de início
- 2026-09-10 — Veja: Início — Card está cortando; Falta resumo do dia; Aparecendo coisas que já paguei; Pontos de atenção; Notificação não estão aparecendo no sino; Botão de voltar do lado da sidebar ta estranho, não ficou bacana. Transações — Esse datepicker com 2 datas ta estranho, deixe apenas a segunda, já que a primeira se eu clicar não acontece nada. Fundação — Sidebar ta feinha
- 2026-09-10 — O card azul ainda está cortando o Saldo do mês
- 2026-09-10 — Fundação: Implemente o modo claro e modo escuro que é o que já existe. Transações: Aplique a lógica da categoria igual no web. Aplique os ícones nas transações igual no web também
- 2026-09-10 — Não ta dando para criar a categoria caso ela não exista igual no web nas transacoes
- 2026-09-10 — Ficou ótimo. Agora vamos seguir para os próximos passos
- 2026-09-10 — Quando abro a sidebar a primeira vez ela fica assim, meio zoada, cortando informações
- 2026-09-10 — To pensando em um negócio. Com esse + aí, ele crie de acordo com o submódulo que ele vai estar. Tipo, se ele tiver no transações, clicando no + já cria uma transação etc. Assim fica menos botão na tela
- 2026-09-10 — Nas páginas iniciais de Dashboard de início deixa como estava antes que podia criar transação, filme etc. Igual ao web. No dashboard de finanças coloque todas as opções de finanças para criar. Em orçamento não está aparecendo o orçamento das subcategorias
- 2026-09-10 — Boa! Vamos seguir para os próximos passos agora
- 2026-09-10 — Eu gostaria que tivesse aquela de mover a categoria pelo dragdrop igual no web
- 2026-09-10 — não ta funcionando apra mover , o app trava
- 2026-09-10 — ERROR [ReferenceError: Property 'StyleSheet' doesn't exist] ... GestureHandlerRootView ... Adjacent JSX elements ... GestureDetector must be used as a descendant of GestureHandlerRootView
- 2026-09-10 — Boa. Vamos prosseguir no plano.
- 2026-09-10 — Engorda a produtividade. Vamos seguir assim mesmo, nos babysteps, faz o v1 e dps vamos ajustando
- 2026-09-10 — Escolher ou trocar o projeto no formulário (hoje só herda se você cria pelo detalhe do projeto)
  Busca
  Prioridade
  Horário do prazo (só a data)
  Subtarefas
  Recorrência (o app nem materializa a próxima ocorrência; isso continua só no web)

  Pq não aplicou isso ainda?
- 2026-09-10 — Não ta adando pra ver as subtask
- 2026-09-10 — Faça tudo para deixar o módulo de produtividade do app igual ao do web
- 2026-09-10 — A prévia das notas fica zoada. Não consigo ajustar as substasks
- 2026-09-10 — No kanban possibilite o usuário arrastar a task
- 2026-09-10 — Aplique essas mudanças em tudo
- 2026-09-10 — To achando meio lento
- 2026-09-11 — Mas em produtividade não aparece as coisas de subatask, tipo, não dá pra colcoar prazo, não aparece a prioridade quando coloco. Seria interessante aparecer
- 2026-09-11 — Boa! Agora vamos para o módulo de vida
- 2026-09-11 — Pode fazer tudo o que faltou de Vida.
- 2026-09-11 — Saúde
  - Troque o termo tratamento para medicação
  - Deixe os grupos de tratamentos, lembretes e etc com uma separação mais evidente, coloque uma corzinha tal sei lá. Veja o que é melhor
  - Deixe mais parecido com web com os ícones

  Metas
  - Não ta dando pra fazer aquilo do web né, de destinar valor a meta, criar uma rotina etc.

  Lugares
  - Não faz sentidos ter o todos, ou já foi visitado ou não.
  - Deixe mais parecido com web com os ícones, filtros, buscas etc.

  Viagens
  - Tb deixe mais parecido com o web

  Veículos
  - Tb deixe mais parecido com o Web.

  Eu to achando q ta mt simples e to sentindo o web mais completo, eu acho que o app tem que mantes as mesmas funcionalidades. Sei que a parte de Produtividade realmente é complexo, mas as outras dá para fazer
- 2026-09-11 — Faça a parte de conteúdo
- 2026-09-11 — Passe para o que resta em conteúdo
- 2026-09-11 — Pq a API não ta pegand ainda? Era para estar no app, está no .env
- 2026-09-11 — Faça um levantamento dessas coisas do que faz sentido ter e o que não faz com ✅ e ❌
- 2026-09-11 — Onboarding / tour / guias de módulo

Acho que isso faz sentido, eu posso conhecer, mas novos usuário não. Entende?
- 2026-09-11 — Certo. Vamos aplicar. Vamos por módulos. Na ordem que vc mandou.
Inicie a implementação
- 2026-09-11 — Vamos para finanças
- 2026-09-11 — Vamos para Vida então
- 2026-09-11 — Pq isso não está no app? Seria bom, não?
- 2026-09-11 — Vamos para o que falta em produtividade agorea
- 2026-09-11 — ERROR [Error: Uncaught (in promise, id: 0) Error: Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".]
- 2026-09-11 — Permita que o gráfico de projeção seja clicável para filtrar
- 2026-09-11 — Toda vez dá um novo reload. Tem como ajustar isso? Ter um efeitinho bacana ao invés do reload
- 2026-09-11 — Ficou muito bom! Acho que esses cabeçalhos que ficam fixos do filtro e tal pode ter a opção de recolher. Para não ocupar mt espaço na tela. Principalmente a de orçamento

## Notas

- Fundação está na lista porque sem ela Finanças não tem onde morar; não é um sexto grupo de
  produto. Login cai numa tab Finanças até o grupo Início existir.
- “Migrar módulo” aqui não significa reescrever cada feature `done/` daquele grupo. A v1 de cada
  grupo é a navegação da sidebar + o CRUD/ações do dia a dia. Gantt, canvas, projeção rica,
  board de categorias com drag, roteiro de viagem completo e stories/share cards entram só se um
  prompt futuro pedir.
- Push nativo (o motivo mais forte de ter app além do PWA) ficou de fora de propósito: depende de
  tabela de device token + mudança de Edge. Cabe numa feature própria quando a fatia Finanças
  estiver usável.
- `supabase db push` não deve ser necessário nesta feature até aparecer tabela de push/token;
  mudanças de CORS são **deploy de function**, e só com confirmação.
- 2026-09-10 — Fundação no repo (Expo SDK 57, pasta `mobile/`). `npx tsc --noEmit` e
  `npx expo export --platform android` verdes. Login no simulador **não** foi exercido nesta
  sessão. Para o Google/magic link funcionarem, o dashboard do Supabase precisa das Redirect
  URLs `orbyva://auth/callback` e `exp://…/--/auth/callback`. Apple exige o provider ligado
  no Supabase. E-mail+senha não precisa disso. CORS: código em
  `supabase/functions/_shared/cors.ts` (header `x-orbyva-client: mobile` + Origin ausente);
  **não houve deploy**.
- 2026-09-10 — Dashboard de Finanças nativo na tab (KPIs + teto + lista por categoria +
  alertas de recorrência). Domain copiado para `mobile/src/domain/finance` e
  `mobile/src/domain/recurring`. Sem CRUD de transação ainda.
- 2026-09-10 — Google no Expo Go “abre o site” quando a Redirect URL (`exp://…` ou
  `orbyva://…`) não está no dashboard: o Supabase cai no Site URL (`orbyva.app`).
  Gravação 14:27: Google → supabase.co → orbyva.app (hub logado no Safari interno).
  Troca: OAuth passa a usar `orbyva://auth/callback` fixo (o ASWebAuthenticationSession
  intercepta o scheme; `exp://IP/--/…` saiu do fluxo). Allowlist: `orbyva://**`.
- 2026-09-10 — Dashboard nativo tinha só lista por categoria (a tarefa permitia
  “donut ou lista”). O web tem donut + linha Recharts; no app isso não atravessa.
  Donut e linha em SVG (`react-native-svg`), mesmos RPCs/views do web.
- 2026-09-10 — Donut: toque na fatia/legenda mostra categoria + valor no
  centro e filtra o extrato do mês (toggle igual ao web). Linha: toque no
  mês mostra receita/despesa. Extrato com data, subcategoria, descrição e
  valor (`fetchMonthLedger`).
- 2026-09-10 — CRUD de transações no stack de Finanças (`/finance/transactions`
  + modal `/finance/form`). Lista paginada do mês, busca, filtro por natureza,
  criar/editar/excluir com categoria + subcategoria. Sem vínculo de viagem
  (módulo Vida ainda não existe no app). `npx tsc --noEmit` ✓.
- 2026-09-10 — Chrome igual ao web no telefone: tabs Finanças+Conta saíram.
  Hamburger abre a sidebar (mesmos grupos; o que não tem tela nativa fica
  “Em breve”). Rodapé Início · Nova · Alertas. Lista de transações no
  padrão da lista mobile do web. Hub inicial enxuto em `/home`.
- 2026-09-10 — Barra inferior saiu: Início já está no hamburger; alertas
  passaram para o header direito (sino + badge); `+` virou FAB no canto
  inferior direito, no padrão do desktop (`AlertsBell` + `QuickAddExpenseFab`).
- 2026-09-10 — Sidebar fazia `push` da rota atual e empilhava a mesma tela
  (aparecia Voltar). Agora fecha se já está nela; senão `navigate`.
- 2026-09-10 — Início v1: hub com hero de saldo/receita/despesa/orçamento,
  alertas de recorrência, próximos 7 dias e grade de módulos (só Finanças
  navega). Timeline só `finance` (parcelas + lançamentos). Login autenticado
  já caía em `/home`. `npx tsc --noEmit` ✓.
- 2026-09-10 — Hub: card com padding extra (clip do radius); resumo do dia;
  próximos 7 dias só parcela em aberto; pontos de atenção + sino com
  orçamento ≥80%/estouro; header só hamburger; datepicker iOS sem data
  duplicada; sidebar com ícones e badge “em breve”.
- 2026-09-10 — Saldo do mês no hero: `ThemedText` default trazia lineHeight
  24 com fonte 28; o overflow do card cortava o valor. Line-height explícito.
- 2026-09-10 — Tema nativo igual ao web: claro/escuro explícito (default
  `light`, SecureStore `orbyva.theme`), não segue o sistema. Form de
  transação usa `ClassSearchPicker` (busca + mais usadas + Trocar + criar
  inline: nova categoria ou subcategoria em categoria existente). Listas
  usam `TypeIcon` a partir de `lucide_icon` da categoria.
- 2026-09-10 — Recorrências v1: lista do mês (busca, a pagar/receber, em
  aberto/pagas/atrasadas), marcar/desfazer parcela (grava `paid_at` +
  lançamento), criar mensal fixa ou parcelada Nx. Sem aba de projeção,
  editar, arquivar ou renovar nesta fatia.
- 2026-09-10 — Orçamento v1: mês com teto vs gasto (mesma view do web),
  alerta de estouro. Sem criar/editar/duplicar mês no app ainda.
- 2026-09-10 — Sidebar na 1ª abertura: `SafeAreaView` no `Modal` vinha com
  inset 0 (texto sob o relógio) e largura `%` instável. Padding com insets
  da tela + largura em px.
- 2026-09-10 — FAB `+` deixa de abrir sheet: vai direto ao create da rota
  (`primaryCreateForPath`). Saíram os CTAs Nova na lista de transações, na
  de recorrências e no dashboard de Finanças. Orçamento e Conta sem FAB.
- 2026-09-10 — FAB: Início/Timeline voltam ao mix do web (sheet); dashboard
  de Finanças lista transação, recorrência e orçamento. Submódulo ainda
  cria direto. Orçamento nativo agrupa categoria + subcategorias (a v1
  só listava tetos sem `class_id`).
- 2026-09-10 — Categorias v1: lista por natureza (busca + filtro), criar
  categoria (nome/natureza/cor) e subcategoria na lista. Sem drag, edição
  ou ícone no form (ícone default `tag`). `docs/stack.md` + README da raiz
  apontam o Expo em `mobile/`.
- 2026-09-10 — Categorias: drag da subcategoria (punho) para outro card de
  categoria chama `updateClassApi({ type_id })`, igual ao web.
- 2026-09-10 — Drag travava: `setState` + `measureInWindow` a cada frame.
  Posição do cartão fantasma ficou no Reanimated; o hit-test só roda no
  soltar. `GestureHandlerRootView` na raiz e na tela de categorias (stack
  nativo não herda o provider sozinho).
- 2026-09-10 — Produtividade v1: Tarefas (atrasadas/hoje/inbox, concluir,
  criar título+prazo), Projetos (lista + detalhe + filtro na lista),
  Notas (markdown TextInput; canvas só alerta “no web”), Compras (check
  + adicionar sem categoria). Hub mostra atrasadas; timeline inclui
  tarefas com prazo. Sem Gantt/Kanban/Excalidraw/wikilinks. Fetch de
  tarefas **não** materializa recorrência/doses — isso continua no web.
- 2026-09-10 — Produtividade 3b: editar/excluir tarefa + concluídas com
  desfazer; criar/editar projeto (nome/cor); nota com autosave ~800ms e
  excluir; item de compra com categoria existente ou nova. Sem
  recorrência, kanban, canvas, quantidade. `npx tsc --noEmit` ✓.
- 2026-09-10 — Tarefas 3c: o 3b cortou projeto no form, busca, prioridade,
  horário, subtarefas e recorrência de propósito (baby-step). O usuário
  perguntou por que não entrou — agora entra. `fetchTasks` materializa
  ocorrências simples até hoje (igual ao web, sem parcelas financeiras
  nem doses). `npx tsc --noEmit` ✓.
- 2026-09-10 — Subtarefas não apareciam na lista: `openTopLevelTasks`
  esconde `parent_task_id`. Agora aninha debaixo do pai (check + título)
  e o form busca filhos por `parent_task_id`, não via o fetch geral.
- 2026-09-10 — Produtividade 3d: paridade de ações/dados com o web, UI
  nativa (chips, listas, sheets). Tarefas ganham agenda de 6 caixas,
  Lista/Kanban/Concluídas, status, tags, intervalo/término/dias da
  semana, links e excluir série. Projetos: status, excluir, kanban por
  status, eventos, abas lista/kanban/compras/notas. Notas: projeto,
  filtro, prévia markdown simples, excluir na lista. Compras: CRUD do
  item (qtd/unidade/link), categoria com projeto, filtro e virar
  tarefa. Continua só no web: Excalidraw, Gantt SVG, timer Live,
  convite de evento, doses/consultas. `npx tsc --noEmit` ✓.
- 2026-09-10 — Prévia das notas: títulos `subtitle` (32px) e `ThemedText`
  aninhado faziam o texto não wrapar. Agora é `Text` com escala do
  editor, listas com `flex:1` e scroll. Subtarefas: toque na lista
  abria o pai; agora abre a própria. No form o título é editável e
  “Abrir” vai ao form completo. `npx tsc --noEmit` ✓.
- 2026-09-10 — Kanban nativo: segurar o punho da tarefa e soltar em
  outra coluna (A fazer / Fazendo / Feito) chama `setTaskStatusApi`.
  Fantasma no Reanimated; hit-test só na solta, igual categorias.
  Vale na lista de tarefas e no detalhe do projeto. `npx tsc --noEmit` ✓.
- 2026-09-10 — Front nativo (3e): escala de tipo 22/28/16/13, `Card`+sombra,
  ChipBar em scroll, toast (`expo-haptics`) nas mutações, Banner no load.
  Hub/sidebar/FAB e resumo do dia só com o que navega. Forms de tarefa,
  compra e recorrência com seções recolhidas. Kanban em colunas horizontais
  com snap. `npx tsc --noEmit` ✓.
- 2026-09-10 — Lentidão: o Início buscava hábitos/filme/viagem (já escondidos)
  e `fetchTasks` materializava série (write) a cada foco. Listas piscavam
  spinner ao voltar. Cards com sombra iOS (radius 16) em cada linha. Agora
  hub lite, reload silencioso, card só com borda, ChipBar sem haptic, kanban
  sem GestureHandlerRootView extra. `npx tsc --noEmit` ✓.
- 2026-09-11 — Subtarefa no app: lista/kanban mostram prazo e prioridade;
  no form da mãe a linha edita os dois; o form da filha limita o prazo ao
  da mãe e esconde recorrência/subtarefas aninhadas. `npx tsc --noEmit` ✓.
- 2026-09-11 — Vida v1 nativa: hábitos (check-in + faixa Seg–Dom + CRUD simples),
  saúde (próxima dose/marcar tomada, consulta, tratamentos), metas (lista +
  barra de progresso), lugares/viagens/veículos (lista + detalhe). Hub checka
  hábito do dia; timeline inclui dose, meta e viagem. Sem heatmap, sem criar
  tratamento/lugar/viagem/carro (forms grandes ficam no web). `npx tsc --noEmit` ✓.
- 2026-09-11 — Vida 4b: paridade do dia a dia. Hábitos ganham mês/insights/meta/`is_health`.
  Saúde cria tratamento (materializa doses), consulta, métricas e preferência de
  lembrete (sem push). Lugares/viagens/veículos passam a criar e editar. Ficam no
  web: autocomplete Google, clima, cartão de share, rateio de gasto e lançamento
  no ledger (`transaction_id` nulo). Convite de viagem gera link `orbyva.app`.
  `npx tsc --noEmit` ✓.
- 2026-09-11 — Vida 4c: Saúde usa “medicação” e seções com ícone/cor; hábitos
  de saúde do dia. Metas financeiras destinam valor e criam rotina no ledger
  (diferente de gasto de viagem/carro, que continua sem lançamento). Lugares
  só Para visitar / Visitados, com busca e ícone de tipo. Viagens e veículos
  ganham cards/abas mais próximos do web. Sem clima, share-card, autocomplete
  Google, rateio ou push. `npx tsc --noEmit` ✓.
- 2026-09-11 — Conteúdo v1 nativo: Cinema/Livros/Música/Links com lista por status,
  cadastro (catálogo TMDB/Google Books/Spotify-Edge quando a chave/invoke
  responde; senão na mão) e mudança de status. Hub mostra último filme;
  timeline inclui assistido/lido/ouvido. Grade do hub sem “Em breve”. Sem
  episódios TMDB, tags de link, heatmap ou share-card. `npx tsc --noEmit` ✓.
- 2026-09-11 — Conteúdo 5b: detalhe nativo, insights, filtros, favorito e
  recomendar. Séries marcam episódio/temporada (TMDB). Livros têm notas de
  leitura. Álbuns Spotify ciclam nota por faixa. Links ganham tipo, tag e
  favorito. Share-card e push de episódio novo ficam no web. `npx tsc --noEmit` ✓.
- 2026-09-11 — Catálogo TMDB/Books no app não lia o `.env` da raiz (`VITE_*`).
  Expo só enxergava `mobile/.env` e nomes `EXPO_PUBLIC_*`. `app.config.ts`
  reaproveita as chaves do web e copia para `extra`; `mobile/.env` também
  recebeu os nomes Expo. Sem restart do Metro a busca continua “indisponível”.
  `npx tsc --noEmit` ✓.
- 2026-09-11 — Início e conta (fatia 7): sino com metas/veículos/episódios,
  dispensar, busca global, timeline com filtro + hábitos/lugares/carros,
  cartão do mês (Share nativo, sem canvas), conta com perfil/termos/export/
  wipe/delete/prefs/convite, onboarding e guias. Quem já tem transação não
  vê o tour. Push remoto continua `[ ]` até sim de migration. `npx tsc --noEmit` ✓.
- 2026-09-11 — Finanças paridade: teto criar/editar/excluir, duplicar mês,
  sugestões 3 meses, replicar 12 meses; categorias editar/excluir; recorrência
  editar/arquivar/reativar/excluir/renovar; aba de projeção com barras e
  simular parcela (não grava). Sem reordenar categorias. `npx tsc --noEmit` ✓.
- 2026-09-11 — Vida paridade do web: lugares com Google + visita no extrato +
  histórico; veículos editam manutenção/abastecimento/documento e lançam no
  ledger; viagens com gasto pessoal/conjunto, pagador, rateio, extrato, convite
  (colar token / `orbyva://travel/invite/:token`), membros, prazos, roteiro
  editável, clima+mala, rotas DRIVE entre paradas e share do resumo. Sem
  IAP. `npx tsc --noEmit` ✓.
- 2026-09-11 — Busca de lugares no app pede GPS (`expo-location`) igual ao web:
  prioriza perto de você; se recusar, a busca segue sem viés. Destino/parada
  de viagem não pedem (cidade não é “perto de mim”). No Expo Go já funciona;
  build nativo já gerado precisa rebuild por causa do módulo. `npx tsc --noEmit` ✓.
- 2026-09-11 — Produtividade, o que ainda faltava: concluir/reabrir sincroniza
  item de compra e parcela financeira; links guardam comentário e abrem na
  lista; filtro hoje/prioridade e status no long-press; recorrência com N
  ocorrências e mensal por dia da semana; notas com vínculo tarefa/projeto/meta,
  toolbar markdown e share; tags com cor/editar/excluir; compras avisam cascade,
  abrem fornecedor/tarefa e criam item na categoria. Sem Gantt, Excalidraw,
  timer, Eisenhower, grade da semana. `npx tsc --noEmit` ✓.
- 2026-09-11 — SecureStore recusava `orbyva_onboarding_v1:` (o `:`). Adapter
  sanitiza a chave no native; prefixo do onboarding passou a `_`. Falha do
  store no tour não vira uncaught. `npx tsc --noEmit` ✓.
- 2026-09-11 — Projeção: toque na barra (ou na linha do mês) foca aquele
  mês, destaca o valor e aplica o mesmo filtro na aba Lista.
  `npx tsc --noEmit` ✓.
- 2026-09-11 — Toque na projeção não troca mais a janela nem mostra spinner:
  só destaca o mês, haptic e fade no card. Fetch do ledger fica em
  background e acumula cache. `npx tsc --noEmit` ✓.
- 2026-09-11 — Cabeçalhos sticky de Finanças recolhem: mês / aba ficam
  visíveis; KPIs, busca e chips vão para `CollapsibleChrome` (orçamento
  começa fechado, com gasto/teto e estouros no hint). Na projeção o
  toggle some. `npx tsc --noEmit` ✓.
