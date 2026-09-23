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

### 11 — Polimento visual (paridade com o web)

- [x] Fundação: logo Orbyva + wordmark na sidebar expandida (não só o “O”). Verificação: `npx tsc --noEmit`
- [x] Dashboard de Finanças: cores nos KPIs; remover atalhos Transações/Recorrências/Orçamento/Categorias. Verificação: `npx tsc --noEmit`
- [x] Recorrências: destacar Receber/Pagar; trocar “Gerir”; parcelas mais claras. Verificação: `npx tsc --noEmit`
- [x] Orçamento: destacar Gasto e teto (sempre visíveis, com cor). Verificação: `npx tsc --noEmit`
- [x] Produtividade: tela Agenda (calendário mensal) na sidebar. Verificação: `npx tsc --noEmit`
- [x] Hábitos: heatmap no estilo do web (células pequenas, gap, legenda). Verificação: `npx tsc --noEmit`
- [x] Metas: cards mais claros; “Rotina” vira “Aportes mensais”. Verificação: `npx tsc --noEmit`
- [x] Viagens: form com deslocamento ida/volta; orçamento/status/notas em Opções avançadas. Verificação: `npx tsc --noEmit`
- [x] Cinema / Livros / Música: cards mais próximos do web (capa, nota, ação). Verificação: `npx tsc --noEmit`
- [x] Metro resolve `@/lib/auth-user` (alias não vaza pro `src/` do Vite). Verificação: `npx tsc --noEmit`
- [x] DateTimePicker: `onValueChange` / `onDismiss` no lugar de `onChange`. Verificação: `npx tsc --noEmit`
- [x] Dashboard de Finanças: KPI “Saldo previsto” no lugar de “Teto do mês”. Verificação: `npx tsc --noEmit`
- [x] Recorrências: cards de valor A receber / A pagar iguais ao web. Verificação: `npx tsc --noEmit`
- [x] Abas de 2 opções (Lista/Projeção etc.) centralizadas e com destaque. Verificação: `npx tsc --noEmit`
- [x] Filtros de conteúdo: menos chips, seletores compactos. Verificação: `npx tsc --noEmit`
- [x] Conteúdo: marcar lido/assistido/ouvido abre modal de avaliação. Verificação: `npx tsc --noEmit`
- [x] Tarefas e Metas: abas de 3 opções no mesmo segmento de Lista/Projeção. Verificação: `npx tsc --noEmit`

### 12 — Fechar o meio-termo (filtros, Agenda, Live, notas, forms)

UI nativa. Recap/share em canvas e push de episódio novo continuam no web.
Canvas nativo é desenho livre compatível com o JSON do Excalidraw (ver, rabiscar),
não o editor web completo.

- [x] Tarefas/Lugares/Saúde/Notas/Compras: filtros em seletor compacto, não pilha de chips. Verificação: `npx tsc --noEmit`
- [x] Agenda: visões Mês / Semana / Dia, com grade de horas. Verificação: `npx tsc --noEmit`
- [x] Live: timer start/pause/stop, histórico do dia, atalho na lista e widget. Verificação: `npx tsc --noEmit`
- [x] Notas: `[[wikilink]]` na prévia, bloco mermaid, nota-canvas (ver + desenhar). Verificação: `npx tsc --noEmit`
- [x] Forms: opinião (recomendaria), data da atividade e duração da tarefa visíveis. Verificação: `npx tsc --noEmit`

### 13 — Recap/share e aviso de episódio novo

UI nativa. Card Stories (9:16) + share do sistema, no mesmo papel do canvas web.
Push remoto (token + Edge) continua na tarefa 7 — aqui o “push de episódio”
é o aviso no app: toggle na série + sino.

- [x] Cinema / Livros / Música: recap/share no detalhe (assistido / lido / ouvido),
      com nota, recomendaria, opinião e episódios/faixas avaliados. Verificação:
      `npx tsc --noEmit`
- [x] Lugares: share no detalhe (card + foto opcional da galeria). Verificação:
      `npx tsc --noEmit`
- [x] Série: “Avisar novos” no detalhe + próximo episódio TMDB; o sino passa a
      listar o alerta. Verificação: `npx tsc --noEmit`

### 14 — Live, viagem, forms e nota quebrada

- [x] Live: dá para tirar o cronômetro da tela (dismiss) sem perder o timer
      em andamento. Verificação: `npx tsc --noEmit`
- [x] Viagem: escolher cidade fecha a lista e preenche o destino (como o web);
      deslocamento ida/volta é interruptor. Verificação: `npx tsc --noEmit`
- [x] Forms: ações (adicionar/remover/excluir) são botões, não texto solto.
      Verificação: `npx tsc --noEmit`
- [x] Entretenimento: nota aceita meia casa (ex.: 6,5), como no web.
      Verificação: `npx tsc --noEmit`

### 15 — Logo do share igual ao web

- [x] Card Stories usa o `logo.webp` do web (órbita + ORBYVA + slogan).
      Verificação: `npx tsc --noEmit`

### 16 — Share no modelo web + botões de form

O card nativo segue o canvas web (mark + wordmark + slogan), não o
`logo.webp` (fundo branco). Ações de form (salvar / adicionar / remover /
excluir) são `FormButton` em todos os cadastros.

- [x] Card Stories no mesmo modelo do web (header/footer de marca, pôster,
      pill, chip; sem placa branca). Verificação: `npx tsc --noEmit`
- [x] Todos os `*form*` nativos usam `FormButton` nas ações. Verificação:
      `npx tsc --noEmit`

### 17 — Botões no mesmo desenho do web

Detalhe e cadastro: botão preenchido (primário), outline (fundo da superfície)
e perigo em outline vermelho — não texto solto.

- [x] Cinema / livros / música / lugares / notas: ações do detalhe iguais ao
      web. Verificação: `npx tsc --noEmit`

### 18 — Filtros, forms, hub, extrato, agenda e vida no modelo web

- [x] Filtros recolhidos mais visíveis; opção selecionada (filtro e form)
      em azul; forms com Classificação / Detalhes. Verificação:
      `npx tsc --noEmit`
- [x] Hub: pontos de atenção navegam ao submódulo; ícones nos módulos;
      timeline com atividades recentes e agendados. Verificação:
      `npx tsc --noEmit`
- [x] Finanças: extrato paginado; valores do mês clicado no gráfico de
      linhas em destaque. Verificação: `npx tsc --noEmit`
- [x] Agenda com ícones do web e detalhe só ao tocar o dia; exclusão da
      nota fora do rodapé. Verificação: `npx tsc --noEmit`
- [x] Lugares, viagens e veículos: fluxo de adicionar/editar (e visões
      da frota) iguais ao web. Verificação: `npx tsc --noEmit`

### 19 — Share nativo no mesmo card do web

O card Stories é 1080×1920, iguais ao canvas web (header/footer de
marca, pôster, pill, chip, mosaico). O preview é a PNG capturada, não
uma miniatura esticada.

- [x] Cinema / livros / música / lugares / mês / viagem: card de share
      no modelo web. Verificação: `npx tsc --noEmit`

### 20 — Card de share cinematográfico + mark real

Fundo da 1ª foto (capa visível, blur leve, vinheta). Mark da 2ª foto
(`logo-mark-sky.png`), no web e no nativo.

- [x] Web + nativo: fundo da 1ª foto + mark da 2ª. Verificação:
      `npx tsc --noEmit` ✓
- [x] Nativo captura o mesmo modelo do canvas web (expo-image, mark,
      episódios, ViewShot opaco). Verificação: `npx tsc --noEmit` ✓

### 21 — Notas: lixeira, contexto recolhível e vínculo direto

- [x] Lista: excluir vira lixeira, fora do texto do card. Verificação:
      `npx tsc --noEmit`
- [x] Editor: projeto e vínculos recolhíveis; vincular escolhe o item
      direto, sem marcar tipo e depois confirmar. Verificação:
      `npx tsc --noEmit`

### 22 — Lugares: share com até 4 fotos e interruptor de opinião

- [x] Share de lugar aceita até 4 fotos, mosaico igual ao web.
      Verificação: `npx tsc --noEmit`
- [x] “Exibir opinião” usa o mesmo interruptor do form de viagens.
      Verificação: `npx tsc --noEmit`

### 23 — Chip selecionado em azul em todos os forms

- [x] Chips de escolha (medição, forms, filtros extras) usam o mesmo
      destaque azul do `ChoiceChip`. Verificação: `npx tsc --noEmit`

### 24 — Cadastro novo abre em sheet, como transação

- [x] Forms de criar/editar sobem por cima da lista (não tela
      empilhada). `formSheet` no iOS some ao focar o teclado —
      os forms usam `modal` + slide de baixo. Verificação:
      `npx tsc --noEmit`

### 25 — Viagens: paradas, estimar ida/volta, resumo e roteiro

Formulário sem Destino (destino sai das paradas). Estimar ida/volta
pela rota a partir da saída ou da chegada. Resumo com ícones
(editar/compartilhar, clima/mala, convites e prazos — essas duas
saem da ChipBar). Roteiro mais perto do web, com visita de verdade
(`place_visit_id`), não só nota.

- [x] Form: remove Destino; destino deriva das paradas; estimar
      ida/volta via Google Routes. Verificação: `npx tsc --noEmit` ✓
- [x] Resumo: ícones de editar/compartilhar; clima e mala com
      ícones; convites e prazos nesta aba (fora da ChipBar).
      Verificação: `npx tsc --noEmit` ✓
- [x] Roteiro: adicionar visita (catálogo + `createPlace`) e
      deslocamento; UI mais próxima do web. Verificação:
      `npx tsc --noEmit` ✓
- [x] Roteiro: cada dia tem Adicionar visita (não Nota como
      atividade). Verificação: `npx tsc --noEmit` ✓
- [x] Roteiro: sort_order da visita cabe em integer (não
      `Date.now()`). Verificação: `npx tsc --noEmit` ✓

### 26 — Conteúdo: status no segmento da Saúde

Cinema, livros, música e links usam o mesmo seletor de
classificação da Saúde (trilho + azul no ativo), não chips soltos.

- [x] ChipBar de até 4 opções (Para assistir / Assistindo / …)
      vira o segmento da Saúde. Verificação: `npx tsc --noEmit` ✓

### 27 — Roteiro: nota da visita, deslocamento, ordem e conclusão; lixeira em lugares

Nota só na visita (sem “Anotação do dia”). Deslocamento com o
destaque do web. Reordenar não deixa horário invertido. Visita
marca concluída (`visit_status`). Lista de lugares tem lixeira
(inclui Para visitar).

- [x] Roteiro: remove anotação do dia; nota fica na visita.
      Destaque de deslocamento; ordem respeita horário; marcar
      visita concluída. Verificação: `npx tsc --noEmit` ✓
- [x] Lugares: lixeira na lista para excluir (Para visitar).
      Verificação: `npx tsc --noEmit` ✓

### 28 — Links: ícone da origem e ações em ícone

Ícone conforme o conteúdo (Instagram, YouTube, favicon do
domínio — igual ao web). Abrir, favoritar e marcar como visto
viram ícones, não texto.

- [x] Lista de links: ícone da origem + ações em ícone.
      Verificação: `npx tsc --noEmit` ✓
- [x] FAB “Adicionar link” abre o form (âncora no índice para o
      formSheet não montar sozinho). Verificação: `npx tsc --noEmit` ✓
- [x] FormSheet de link mostra os campos (altura do conteúdo não
      pode ser 0). Verificação: `npx tsc --noEmit` ✓
- [x] Focar campo no form de link não apaga o conteúdo (teclado
      no formSheet). Verificação: `npx tsc --noEmit` ✓
- [x] Lista de links: lixeira no card para excluir.
      Verificação: `npx tsc --noEmit` ✓

### 29 — Live: lixeira no registro

Histórico do timer com lixeira visível, igual nas listas de
notas/links — não só no long press.

- [x] Live: lixeira em cada registro de tempo.
      Verificação: `npx tsc --noEmit` ✓

### 30 — Chrome: fechar à esquerda, sidebar mais estreita; Cinema: surpresa, avaliação e episódios

Fechar de formulário/sheet sempre à esquerda (Cancel iOS). Sidebar
mais estreita. Cinema: surpreenda-me visível; avaliar com capa,
data e observação; temporada com seta; nomenclatura clara.

- [x] Fechar do form/sheet à esquerda; sidebar mais estreita.
      Verificação: `npx tsc --noEmit` ✓
- [x] Cinema: surpreenda-me, avaliação com capa/data/nota,
      temporada expansível e nomenclatura. Verificação: `npx tsc --noEmit` ✓

### 31 — Cinema: avaliar e comentar episódio

Cada episódio da série tem nota e comentário, igual no web.

- [x] Detalhe da série: expandir episódio para nota e comentário.
      Verificação: `npx tsc --noEmit` ✓
- [x] Episódios no estilo do web (T1/T2, card, check).
      Verificação: `npx tsc --noEmit` ✓

### 32 — Cinema: progresso na capa do card

Série em Assistindo mostra na capa o mesmo indicador do web
(`110/140 eps · 82%` + barra).

- [x] Card de cinema: progresso na capa (eps e %).
      Verificação: `npx tsc --noEmit` ✓

### 33 — Viagens: roteiro, prazos, gastos e FAB

Arrastar visita pela alça (regra de horário). Parada no título do
dia. Prazos em aba. Sem checklist. Excluir e gastos visíveis.
Sem `+` dentro da viagem.

- [x] Roteiro: arraste, parada no dia, prazos, gastos, excluir, FAB.
      Verificação: `npx tsc --noEmit` ✓

### 34 — Conteúdo e compras: marcar e excluir na lista

Cinema: “Marcar como Assistido” + lixeira. O mesmo em livros e
música. Lista de compras com lixeira no item.

- [x] Cards de cinema/livros/música e itens da lista de compras.
      Verificação: `npx tsc --noEmit` ✓

### 35 — Viagens: deslocamentos seguem a hospedagem dos dias seguintes

Passeio no meio da viagem (ex.: Alto Paraíso → São Jorge no mesmo dia)
volta para a cidade em que o roteiro continua, não para o ponto de
origem. Origem só entra no último dia, se for o último local.

- [x] Planejar trechos pelas paradas: hospedagem do dia, passeio
      ida/volta, retorno à origem só no encerramento. Verificação:
      `npx vitest run src/domain/travel/__tests__/itineraryTransfers.test.ts` ✓
      e `npx tsc --noEmit` (web + mobile) ✓.

### 36 — Arraste: fantasma no roteiro e pouso nos 3

Roteiro com o mesmo fantasma de categorias/kanban. Nos três, o item
entra no destino com mola.

- [x] Fantasma no roteiro; entering + layout em roteiro, categorias e
      kanban. Verificação: `npx tsc --noEmit` ✓

### 37 — Polimento mobile: chrome, login, densidade e copy

Feedback de uso no telefone: Timeline sobra; abertura de tela/sidebar/
modal demora no toque; login parece web; teclado cobre forms/notas;
listas (recorrências/orçamento/notas) perdem área útil; labels
ambíguas (Desfazer, Criar, Link); Live em tarefa de saúde; nota sem
PDF.

- [x] Timeline fora da sidebar e das rotas no mobile e no web (hub
      continua com atividades recentes). Verificação: `npx tsc --noEmit`
      (mobile) ✓; vitest sidebar ✓; navegação sem `/timeline`
- [x] Abertura mais rápida: sidebar/modal/stack respondem no toque
      (abrir UI primeiro; trabalho pesado depois; animações curtas).
      Verificação: `npx tsc --noEmit` ✓
- [x] Ícone de editar (`pencil-outline`) trocado por um mais legível
      nas listas. Verificação: `npx tsc --noEmit` ✓
- [x] Teclado: forms e editor de nota sobem/scrollam o campo focado
      (KeyboardAvoiding + scrollIntoView / inset). Verificação:
      `npx tsc --noEmit` ✓
- [x] Login nativo: logo + wordmark Orbyva; sem texto de Redirect URL
      do Supabase; CTA “Enviar link mágico” evidente; sem “Sem cartão
      no início”; botão Google mais claro. Verificação: `npx tsc --noEmit` ✓
- [x] Recorrências: pago → “Desfazer pagamento” (receber → “Desfazer
      recebimento”); chrome recolhido por padrão / mais área de lista.
      Verificação: `npx tsc --noEmit` ✓
- [x] Orçamento: mais área de lista (chrome recolhido / menos padding
      fixo). Verificação: `npx tsc --noEmit` ✓
- [x] Tarefas: sem Live em `is_medication` / `is_consultation` /
      `medication_id`. Verificação: `npx tsc --noEmit` ✓
- [x] Notas: exportar PDF (print/share) + editor/lista com mais área
      útil. Verificação: `npx tsc --noEmit` ✓
- [x] Compras: “Link” vira ícone `open-outline` (como Conteúdo); alerta
      “Criar” deixa explícito que cria tarefa. Verificação:
      `npx tsc --noEmit` ✓

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
- 2026-09-14 — Fundação
  - Colocar logo do Orbyva ao expandir a Sidebar. Hoje aparece apenas o "O". Deixe igual ao web, com a escrita q a logo

  Dashboard Financeiro
  - Coloque cores nos card do Dashboard financeiro e tire os botões que aparecem acima dos cards.

  Recorrências
  - Dê mais destaque ao Receber e a Pagar
  - Escolha outra palavra ao invés de "Gerir"
  - Melhore o ver parcelas ali, deixe mais bonito
  Orçamento
  - Dê mais destaque ao Gasto e teto

  Produtividade
  - Falta a agenda

  Hábitos
  - Coloque um gráfico de heat map mais parecido com o Web

  Metas
  - Melhore essa tela
  - Troque a palabra "Rotina" para ficar mais claro para o usuário

  Viagem
  - Deixar o formulário mais parecido com o Web, adicinando o Deslocamento de ida e volta e deixar a parte de orçamento e tal dentro de Opções avançadas, do mesmo modelo do Web

  Entretenimento
  - No módulos de Livros, Cinema e música melhorar aquele card
- 2026-09-14 — WARN  DateTimePicker: `onChange` is deprecated. Use `onValueChange`, `onDismiss`, and `onNeutralButtonPress` instead.
  iOS Bundling failed … Unable to resolve "@/lib/auth-user" from "src/api/habits/habits.ts"
- 2026-09-14 — Dashboard Finanças
  - Dashboard troque o card de teto do mês por Saldo Previsto
  Recorrências
  - Vc não deu o destaque para o valor a receber e a pagar que te pedi
- 2026-09-14 — Ficou bom. Agora quero uns ajustes visuais.
  - Em abas que tem apenas 2 botões para mudar, exemplo lista e projeção, deixe centralizado e dê um destaque
  - Os filtros estão meio feios, sei lá, está muito simples, muito botão para filtrar principalmente nos de conteúdo
  - Em conteúdo quando marcar como já lido, já assistido etc está indo direto, é para ir para a modal de avaliação
- 2026-09-14 — Faça o mesmo do Projeção el lista para Tarefas, onde tem Lista, Kanban e Concluídas
  Metas também onde tem, Todas, Ativas e Concluídas
- 2026-09-14 — Tarefas — Lista/Kanban/Agenda funcionam; filtros ainda são pilha de chips; não tem visão de semana/hora nem Live.
  Notas — edita e prévia markdown; sem wikilink, mermaid, canvas.
  Conteúdo — lista, nota e modal de avaliar; recap/share e push de episódio novo continuam no web.
  Lugares / Saúde / filtros — o mesmo padrão que o conteúdo tinha antes: muitos botões, menos densidade que o site.
  Forms — o essencial está; opinião, data e campos raros às vezes somem ou ficam mais simples.

  Implemente isso. Vamos fechar esse meio-termo
- 2026-09-14 — Conteúdo — Implemente o  recap/share e push de episódio novo
  Lugares também implemente o share.
- 2026-09-14 — Live
  - Depois que dou play em uma tarefa, não consigo tirar o crônometro da tela

  Viagens
  - Quando clico na cidade, não fecha a lista de pesquisa e não pega o destino igual no Web
  - No incluir deslocamento, coloque aquele interruptor de on e of ao invés de só a escrita
  Geral
  - Em todos os forms, os botões estão meio pobres, nem parece que são botões clicáveis, veja na imagem:

  Entretenimento
  - Não consigo dar uma nota quebrada, tipo 6,5.
- 2026-09-14 — Use a imagem que tem na versão web para o share
- 2026-09-14 — Faça isso em todos os forms que tenham botões para ficar um negócio melhor. 
O que eu digo do share pra vc pegar do web. É o modelo do card de compartilhamento. Olha aí como é. Quero desse jeito.
- 2026-09-14 — ta bem esquisito mano. Cara, pega só o mesmo design que ta no web e coloca no App. Olha aí como os botões estão
- 2026-09-15 — Geral
  - Dê um destaque na parte de filtros quando está recolhido. As vezes passa despercebido.
  - Na opção selecionada de filtro, form, deixe azul
  - Nos forms coloque aquela separaçãozinha do Web de classificação e detalhes
  Início
  - Dashboard
    - Ao clicar nos itens de ponto de atenção, redirecione para o submódulo de referência
    - Coloque ícones na parte de módulos
    -
    - Deixe o timeline igual do web, mostrando as últimas atividades de cada módulo e os agendados, como os hábtios, parcelas etc
  Finanças
  - Dashboard
    - Pagine a parte dos extratos
    - Dê mais destaque nos valores quando clicar em mês específico do gráfico de linhas
  Produtividade
  - Agenda
    - Coloque os ícones igual no web, abra o detalhe apenas quando eu clicar no dia
  - Notas
    - Coloque o botão de exclusão em outro local
  Vida
  - Lugares
    - Deixe o fluxo de adicionar/editar visita e tal igual ao web
  - Viagens
    - Deixe o fluxo de adicionar e editar igual ao web
  - Veículos
    - Deixe o fluxo de adicionar e editar igual ao web e as visões também
- 2026-09-15 — O share do mobile e do web está diferente. O do Web está perfeito. Já o do mobile ta paia demais. Deixe o do mobile igual ao do web
- 2026-09-15 — Cara, eu tava vendo o card como estava antes e agora no web e está diferente. Pq alterou?

Veja como está agora e como estava antes. A primeira é de agora, a segunda é de antes.

Deixe igual estava antes e altere o logo do orbyva que está feio
- 2026-09-15 — No mobile estava igual antes. Só com a logo do orbyva meio zoada ainda.
Faça o seguinte: Deixe igual está no mobile para os 2, mas, coloque a logo do orbyva que está no share do web que está melhor
- 2026-09-15 — Mantenha igual a primeira, mas com a logo do orbyva da segunda foto no mobile e no web.
- 2026-09-15 — Ainda está diferente no mobile. Já o web, está perfeito. Use exatamente o mesmo modelo do Web.
- 2026-09-15 — No mobile oculte mais uns 4 episódios no banner pra ficar menos apertado. Mas só isso. Faça mais nada
- 2026-09-15 — Nessa tela de notas, coloque o excluir em outro local e o represente por uma lixeira
- Ao clicar em uma nota, permita que as informações de Projeto, Vinculos possa ser recolhido, para que não atrapalhe na hora de redigir a nota.
- Melhore essa parte de vínculos que aparece de Vincular tarefa, vincular projeto, Vincular meta. Porque o usuário tem que marcar um pra depois clicar no botão pra vincular, ta meio estranho
- 2026-09-15 — Lugares
- O share deve permitir adicionar até 4 fotos. Igual ao Web
- O exibir opinião ali coloque o interruptor igual ao que tem no form de viagens
- 2026-09-15 — Geral
- Ali perceba que está marcado, mas coloque o destaque em azul. Faça isso em todos os casos desse tipo
- 2026-09-15 — Aqui quando clica para cadastrar novo, entra em uma tela que pega a tela toda do celular, faça que abra o formulário da mesma forma que abre o de transações

- 2026-09-15 — `formSheet` no iOS (SDK 57) some o conteúdo ao focar
  um TextInput: o native redimensiona o sheet e a altura cai a 0.
  Os cadastros usam `modal` + `slide_from_bottom` no lugar.
- 2026-09-15 — Corrija a lógica de geração dos deslocamentos do roteiro da viagem.
  Considere este cenário: O local de partida da viagem é Valparaíso.
  No dia 17/09, estarei em Alto Paraíso e farei um passeio em São Jorge,
  e irei e voltarei no mesmo dia. Após o passeio, retornarei para Alto
  Paraíso, pois no dia 18/09 ainda permanecerei em Alto Paraíso. O
  roteiro do dia 17/09 deve apresentar Alto Paraíso → São Jorge e
  São Jorge → Alto Paraíso, não São Jorge → Valparaíso. O deslocamento
  de volta para o local de origem só deve ser gerado quando realmente
  for o encerramento da viagem.

- 2026-09-23 — Features mobile:
  - Geral
    - Retirar essa parte de Timeline, meio nada haver (este ponto pode retirar do web também)
    - A troca de tela ta meio demorada, para abrir sidebar tb, abrir uma modal tb
    - Troque o lápis da edição, coloque um melhorzinho
    - Em vários momentos, o teclado atrapalha a utilização, cadastro de algo ou escrever uma nota.
  - Tela de Login:
    - Melhorar tela de login, deixar mais parecido com mobile
    - Requisitos mínimos: Ter a logo e forma de escrita que tem em todo o app
    - Tirar esse No supabase...
    - Deixar mais evidente esse: "Enviar link mágico"
    - Tirar esse "Sem cartão no início"
    - Melhore esse botão de entrar com google
  - Recorrências
    - Quando está pago fica o botão como "Desfazer", deixe mais claro, coloque como: "Desfazer pagamento"
    - Otimize essa tela para ter mais espaço ali para ver os itens
  - Orçamento
    - Otimize essa tela para ter mais espaço ali para ver os itens
  - Tarefas
    - Quando for uma coisa advinda de saúde, não tem pq ter o live ali
  - Nota
    - Coloque a função de exportar pdf e otimize essa tela para ter mais espaço ali para ver a nota e tal
  - Lista de compras
    - Ao invés de ter a palavra "Link" ali, coloque o ícone igual de conteúdo
    - No "criar" especifique mais, já que vai criar uma tarefa
  (clarificação: ao clicar, demora um pouco pra abrir)

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
- 2026-09-14 — Polimento visual nativo: logo+wordmark na sidebar; KPIs
  coloridos no dashboard (sem atalhos); Recorrências com Pagar/Receber
  em destaque, “Opções” no lugar de “Gerir” e parcelas com badge;
  Gasto/teto sempre visíveis no orçamento; Agenda mensal em Produtividade;
  heatmap de hábitos no estilo web; Metas com “Aportes mensais”; form de
  viagem com ida/volta e opções avançadas; cards de cinema/livros/música
  com capa maior e nota. `npx tsc --noEmit` ✓.
- 2026-09-14 — Metro no `mobile/` herdava o `@/*` do `tsconfig.json` da raiz
  (Vite `src/`). O bundle iOS falhava em `@/lib/auth-user` ao abrir hábitos.
  `metro.config.js` trava o alias em `mobile/src` e não observa o src do web.
  DateField/TimeField passaram para `onValueChange`/`onDismiss`. No caminho:
  vírgula faltando em `AppSidebar` (`brandLockup`) e cast do fallback do
  roteiro em `travel.ts`. `npx tsc --noEmit` e `npx expo export --platform ios` ✓.
- 2026-09-14 — Dashboard nativo: “Teto do mês” vira “Saldo previsto”
  (realizado + parcelas em aberto, igual ao web). Recorrências ganham os
  dois cards de valor A receber / A pagar, sempre visíveis. `npx tsc --noEmit` ✓.
- 2026-09-14 — ChipBar de 2 opções vira segmento centralizado (azul no ativo).
  Cinema/Livros/Música/Links compactam tipo/gênero/nota/ordem em seletores.
  Marcar assistido/lido/ouvido abre modal de nota 1–10 + recomendaria.
  `npx tsc --noEmit` ✓.
- 2026-09-14 — Segmento centralizado também em 3 opções: Tarefas
  (Lista / Kanban / Concluídas) e Metas (Todas / Ativas / Concluídas).
  `npx tsc --noEmit` ✓.
- 2026-09-14 — Meio-termo nativo: filtros compactos (tarefas, lugares,
  saúde em Hoje/Cuidados/Mais, notas, compras); Agenda Mês/Semana/Dia
  com grade de horas; Live (tela, widget, atalho na lista); notas com
  `[[wikilink]]`, mermaid e canvas de desenho livre; forms com
  recomendaria, data da atividade e duração da tarefa. Recap/share e
  push de episódio novo continuam no web. `npx tsc --noEmit` ✓.
- 2026-09-14 — Recap/share nativo: card Stories (ViewShot 1080×1920) em
  cinema/livros/música (assistido/lido/ouvido) e lugares (foto opcional).
  Série ganha “Avisar novos” + próximo episódio; o sino usa o mesmo
  `notify_new_episodes` do web. Push remoto OS continua na tarefa 7.
  `npx tsc --noEmit` ✓.
- 2026-09-14 — Live: X tira o cronômetro da tela (timer segue em Live).
  Viagem: pick de cidade fecha a lista e preenche destino (`selectedLabel`).
  Deslocamento ida/volta vira Switch. Forms: `FormButton` em
  adicionar/remover/excluir. Nota de conteúdo aceita meia casa. `npx tsc --noEmit` ✓.
- 2026-09-14 — Share nativo usa o `logo.webp` do web no rodapé do card
  (lockup órbita + ORBYVA + slogan). Cabeçalho ganha wordmark como no canvas.
  `npx tsc --noEmit` ✓.
- 2026-09-14 — Share nativo copiou o modelo do canvas web (não o logo.webp):
  mark vetorial + ORBYVA + slogan com ÓRBITA em sky. Forms: `FormButton`
  em salvar/adicionar/remover/excluir de todos os cadastros. `npx tsc --noEmit` ✓.
- 2026-09-14 — Botões no detalhe (cinema/livros/música/lugares/notas) no
  mesmo desenho do web: primário preenchido, outline na superfície, perigo
  em borda vermelha. Favorito vira coração no título. `npx tsc --noEmit` ✓.
- 2026-09-15 — Filtros recolhidos viram pill azul com ícone; opção ativa
  no picker fica primária. Forms de finanças/lugares/viagens/veículos
  ganham Classificação/Detalhes. Hub: alerta navega no `href`, módulos
  com ícone, timeline com agendados + atividades (hábitos, parcelas,
  marcos). Extrato paginado; mês do gráfico em card grande. Agenda só
  abre o dia; ícones de tarefa; lixeira da nota no header. Lugares:
  visita no detalhe. Frota: Cronograma/Manutenções/Abastecimentos/
  Documentos. `npx tsc --noEmit` ✓.
- 2026-09-15 — Share nativo passou a desenhar o card em 1080×1920 (o
  mesmo canvas do web) e capturar 1:1. A miniatura 270×480 esticada
  saiu: preview é a PNG gerada. Mês e viagem também geram o card de
  imagem, não só texto. `href` da timeline ganhou `/finance/recurring`
  (já era usado no collect). `npx tsc --noEmit` ✓.
- 2026-09-15 — O card de share do web tinha mudado de cara porque o
  kit passou a pintar um wash cyan (opacity 0.48) + blur 48px em cima
  do pôster — a arte sumia e virava um degradê sky. O mark também
  deixou de ser o `logo-mark-sky.png` (fundo transparente) e virou um
  O+órbita vetorial tosco, porque o `logo-mark.webp` tem fundo branco.
  Restaurado: capa visível no fundo + mark real. `npx tsc --noEmit` ✓
  (web `tsc -b` e mobile).
- 2026-09-15 — Fundo do share voltou ao do mobile (blur 48 + wash sky +
  vinheta) nos dois. O web não usa mais `brightness()` no canvas, que
  era o que apagava o pôster. Mark continua o `logo-mark-sky.png`.
  `npx tsc --noEmit` ✓.
- 2026-09-15 — Share: fundo da 1ª foto (capa visível, blur 10, vinheta
  sem wash cyan) + mark da 2ª (`logo-mark-sky.png`) no web e no
  nativo. `npx tsc --noEmit` ✓.
- 2026-09-15 — Nativo passou a capturar o card opaco (ViewShot não
  pegava o blur com opacity 0.02), com `expo-image` no fundo/mark e a
  mesma regra de episódios do canvas. `npx tsc --noEmit` ✓.
- 2026-09-15 — Lista de notas: lixeira no canto do card. Editor: projeto
  e vínculos recolhidos por padrão. Vincular abre um sheet; escolher o
  item já cria o vínculo. `npx tsc --noEmit` ✓.
- 2026-09-15 — Share de lugares: até 4 fotos (mosaico + galeria múltipla)
  e “Exibir opinião” com o mesmo Switch do form de viagens.
  `npx tsc --noEmit` ✓.
- 2026-09-15 — Chip selecionado (Peso, tipos, status, tags, favoritos
  etc.) passou a usar o azul do `ChoiceChip` em vez do cinza.
  `npx tsc --noEmit` ✓.
- 2026-09-15 — Cadastro novo (hábito, transação e os outros forms) abre
  em sheet por cima da lista, com puxador e Fechar — não ocupa a tela
  inteira. `npx tsc --noEmit` ✓.
- 2026-09-15 — Viagens
  - Não tem aquela funcionalidade de estimar ida/volta pelo horário de saída ou de chegada ao destino
  - No formulário não tem pq ter esse campo de destino, já que os destinos serão colocados na parte de paradas
    - Resumo
      - Melhore o front dessa aba, para as funções de Editar e compartilhar, coloque ícones para isso e coloque em outro lugar
      - Clima e mala, melhore também colocando ícones etc deixando mais agradável a visulização
      - Coloque as partes que falam de Convites e prazo nessa parte, representando também por ícones e retire daquela navegação na parte superior da tela
    - Roteiro
      - Também melhore o front e adicione coisas que não tem no mobile ainda deixando mais parecido com o Web que está completinho
      - Não consigo adicionar uma visita, apenas uma nota (?)
  Form sem Destino (destino sai das paradas); estimar ida/volta pela
  rota; Resumo com ícones (editar/compartilhar, clima/mala, prazos e
  convites fora da ChipBar); Roteiro com visita (`place_visit_id`) e
  deslocamento. `npx tsc --noEmit` ✓.
- 2026-09-15 — Na parte de conteúdo onde tem ali aquelas classificações de Para assistir, Assistindo, Assistido e abandonei coloque igual está na parte de saúde, com o mesmo visual. Faça isso para todos de conteúdo que tem navegações desse tipo
  Cinema, livros, música e links usam o mesmo trilho da Saúde (azul
  no ativo). `npx tsc --noEmit` ✓.
- 2026-09-15 — Em viagens na parte de roteiro ainda está aquilo de Nota. Tem que ser para adicionar visita
  Cada dia do roteiro tem Adicionar visita (+ deslocamento), sem
  criar atividade-nota. `npx tsc --noEmit` ✓.
- 2026-09-15 — Fui cadastrar uma visita e deu isso
  (`value "1789485917915" is out of range for type integer`)
  sort_order da visita/checklist deixa de usar `Date.now()`.
  `npx tsc --noEmit` ✓.
- 2026-09-15 — Permita adicionar uma nota só na visita, igual no web, não no dia todo
  Dê destaque no deslocamento igual no Web
  Não permita ordenar uma visita na qual os horários saiam de ordem. Exemplo, se eu tenho um deslocamento que é 14:00 -> 17:00 e tenho uma visita 17:30, não permita colocar essa visita de 17:30 acima do do deslocamento. Funciona assim no Web.
  Eu não consigo marcar uma visita como concluída igual no web
  Lugares
  - Não consigo excluir um lugar que está "Para Visitar", coloque uma lixeirinha do lado para que permita o usuário excluir
  Roteiro: nota só na visita; deslocamento com destaque sky; ordem
  pelo horário; visita concluída no ícone. Lista de lugares com
  lixeira. `npx tsc --noEmit` ✓.
- 2026-09-15 — Conteúdo
  - Links
    - Coloque o ícone dependendo do link do conteúdo, igual ao web. Se é um vídeo do instagram, aparece o ícone do instagram
    - Coloque as interações de abrir, favoritar e marcar como visto como ícones
  Ícone da origem (Instagram/YouTube/favicon) e ações em ícone.
  `npx tsc --noEmit` ✓.
- 2026-09-15 — Quando clico em adicionar link não abre o form
  O + carrega a lista por baixo do sheet (`withAnchor`) para o
  formSheet aparecer. `npx tsc --noEmit` ✓.
- 2026-09-15 — Está assim
  Sheet abria vazio: o conteúdo do formSheet media 0. Agora a
  altura é a da janela. `npx tsc --noEmit` ✓.
- 2026-09-15 — Quando clico em algum campo do formulário volta a ficar assim do jeito que te mandei
  formSheet no iOS zera o conteúdo ao abrir o teclado. Cadastros
  passam a `modal` + slide de baixo. `npx tsc --noEmit` ✓.
- 2026-09-15 — Coloque a lixeira no link caso eu queira excluir, para que fique mais fácil
  Lixeira no card da lista, com confirmação. `npx tsc --noEmit` ✓.
- 2026-09-15 — Do live tb
  Lixeira no histórico do Live, com o mesmo confirmDelete do long press. `npx tsc --noEmit` ✓.
- 2026-09-15 — Geral
  - Há casos em que o botão de fechar do form é do lado esquerdo (Transações) e outros casos é do lado direito (Cinema quando clica em já assistido), padronize da maneira que o especialista UI/UX achar melhor
  - Diminua a largura da sidebar
  Conteúdo
  - Ontem tem o surpreenda-me, deixe esse botão mais bonito
  - Quando clico em marcar como assistido, aparece o formulário para avaliar, mas falta a data assistida e o campo de observação e deixe o formulário mais bonito, ta muito genérico, deixe parecido com o web, onde aparece a capa do filme nome etc.
  - Nas séries de controle de episódio tem que clicar na temporada, mas quem é novo não vai conseguir descobrir isso, coloque tipo uma setinha para expandir e recolher
  - Deixe mais claro também o marcar como assistido do episódio
  - Melhore as nomenclaturas. Está como Marcar temporada, Marcar assistido, melhore isso
  Fechar à esquerda (HIG). Sidebar ~268px. Avaliação com capa/data/nota.
  Temporada com chevron. `npx tsc --noEmit` ✓.
- 2026-09-15 — No cinema não consigo avaliar o episódio nem comentar ele
  Episódio expande para nota e comentário, igual no web. `npx tsc --noEmit` ✓.
- 2026-09-15 — Não é válido deixar nesse mesmo estilo no mobile?
  Episódios no layout do web: chips T1/T2, card com check, nota e comentário. `npx tsc --noEmit` ✓.
- 2026-09-15 — Coloque esse indicador de progresso na capa igual ao web no card
  Capa do card com `110/140 eps · 82%`, % no canto e barra. `npx tsc --noEmit` ✓.
- 2026-09-15 — Viagens
  - Permita arrastar pela alça os lugares do roteiro de um dia para o outro ou ordenar pelo dia, mas com aquela regra do horário
  - Coloque o botão de excluir viagem mais a vista
  - Deixa os prazos em uma abinha separada mesmo, melhor.
  - Na parte de roteiro, coloque a parada que está naquele dia, igual no web que está no anexo
  - Tire essa parte de checklist
  - Deixe o botão de Gastos mais bonito
  - Quando to dentro de uma viagem, não faz sentido existir o botão +
  Alça no roteiro (dia ou ordem, horário manda). Prazos em aba. Dia com
  parada (`Dia 3 · São Jorge`). Sem checklist. Excluir no resumo. Gastos
  com CTA. Sem `+` dentro da viagem. `npx tsc --noEmit` ✓.
- 2026-09-15 — Entretenime
  - Trocar o Já assisti para Marcar como Assistido e coloque a lixeira para poder excluir o filme. Faça o mesmo para livros e música

  Produtividade
  - Lista de compras coloque a lixeira para poder excluir o item
  Lista: “Marcar como Assistido/Lido/Ouvido” + lixeira no card.
  Compras: lixeira no item. `npx tsc --noEmit` ✓.
- 2026-09-15 — Corrija a lógica de geração dos deslocamentos do roteiro da viagem.
  Considere este cenário: O local de partida da viagem é Valparaíso.
  No dia 17/09, estarei em Alto Paraíso e farei um passeio em São Jorge,
  e irei e voltarei no mesmo dia. Após o passeio, retornarei para Alto
  Paraíso, pois no dia 18/09 ainda permanecerei em Alto Paraíso. O
  roteiro do dia 17/09 deve apresentar Alto Paraíso → São Jorge e
  São Jorge → Alto Paraíso, não São Jorge → Valparaíso. O deslocamento
  de volta para o local de origem só deve ser gerado quando realmente
  for o encerramento da viagem.
  Trechos saem das paradas + hospedagem do dia; origem só no último dia.
  `npx vitest run src/domain/travel/__tests__/itineraryTransfers.test.ts` e
  `npx tsc --noEmit` (web + mobile) ✓.
- 2026-09-15 — Coloque uma animação de arraste de roteiro. Igual ao de categorias e kanban. 
  E nesses 3 que possam arrastar, coloque a animação do item entrando no local para que foi arrastado para ficar bonitinho
  Roteiro com fantasma (long-press + segue o dedo). Destino com mola
  no roteiro, categorias e kanban. `npx tsc --noEmit` ✓.
- 2026-09-23 — Features mobile:
  - Geral
    - Retirar essa parte de Timeline, meio nada haver (este ponto pode retirar do web também)
    - A troca de tela ta meio demorada, para abrir sidebar tb, abrir uma modal tb
    - Troque o lápis da edição, coloque um melhorzinho
    - Em vários momentos, o teclado atrapalha a utilização, cadastro de algo ou escrever uma nota.
  - Tela de Login:
    - Melhorar tela de login, deixar mais parecido com mobile
    - Requisitos mínimos: Ter a logo e forma de escrita que tem em todo o app
    - Tirar esse No supabase...
    - Deixar mais evidente esse: "Enviar link mágico"
    - Tirar esse "Sem cartão no início"
    - Melhore esse botão de entrar com google
  - Recorrências
    - Quando está pago fica o botão como "Desfazer", deixe mais claro, coloque como: "Desfazer pagamento"
    - Otimize essa tela para ter mais espaço ali para ver os itens
  - Orçamento
    - Otimize essa tela para ter mais espaço ali para ver os itens
  - Tarefas
    - Quando for uma coisa advinda de saúde, não tem pq ter o live ali
  - Nota
    - Coloque a função de exportar pdf e otimize essa tela para ter mais espaço ali para ver a nota e tal
  - Lista de compras
    - Ao invés de ter a palavra "Link" ali, coloque o ícone igual de conteúdo
    - No "criar" especifique mais, já que vai criar uma tarefa
  (clarificação: ao clicar, demora um pouco pra abrir)
  Fatia 37: Timeline fora (mobile+web); chrome abre sem fade;
  stack/forms mais rápidos; login com marca; teclado com offset;
  densidade em recorrências/orçamento/notas; PDF; copy e Live.
  `npx tsc --noEmit` (mobile) ✓; vitest sidebar ✓; `npm run lint` ✓.
