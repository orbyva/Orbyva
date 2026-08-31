# 017 — Live: widget de acesso rápido, histórico completo e registros por tarefa

## Contexto
O módulo Live (`/tasks/live`) já existe e funciona: start/stop de timer via `useActiveTimer`
(contexto global montado em `AdminLayout`) e API em `src/api/tasks/timeEntries.ts`, gravando em
`task_time_entry` (schema já tem `started_at`/`ended_at`, um timer rodando por usuário). A página
hoje mostra só um seletor de tarefa + start/stop e uma lista "Hoje" agrupada por tarefa.

Falta: (1) um widget fora da página Live, visível nas telas do módulo Produtividade, mostrando a
tarefa em andamento com tempo decorrido e ação de parar; (2) uma versão mobile desse widget; (3)
na própria página Live, histórico completo dos registros (não só hoje), filtrável por projeto e
por tarefa; (4) no dialog de edição de cada tarefa, os registros de tempo daquela tarefa.

## Decisões
- Timer continua só start/stop, sem pausa real (schema `started_at`/`ended_at` não muda).
- Widget lateral só aparece dentro do módulo Produtividade (tasks/projects/agenda/live), não em
  outras áreas do app (ex: financeiro).
- Widget mostra a tarefa em andamento; se não houver timer rodando, mostra a última tarefa
  interagida (registro mais recente do usuário) como atalho de acesso rápido para reiniciar.
- Mobile: variação compacta do mesmo widget — layout exato (barra fixa, sheet, etc.) a definir na
  implementação.
- Página Live passa a listar o histórico completo dos registros, com filtro por projeto e por
  tarefa (a visão "Hoje" vira um filtro de data padrão, não a única visão).
- Dialog de edição de tarefa (`openEdit` em `TaskList.tsx`) ganha uma seção "Registros de tempo"
  com os `task_time_entry` daquela tarefa (data, duração, projeto).

## Tarefas
- [x] Estender `src/api/tasks/timeEntries.ts`: buscar "última tarefa interagida" do usuário e
      listar todos os registros com filtro por projeto/tarefa (não só "hoje").
- [x] Criar componente `LiveWidget` (desktop) consumindo `useActiveTimer`: tarefa rodando (ou
      última interagida), tempo decorrido em tempo real, botão Parar; renderizado só nas telas do
      módulo Produtividade.
- [x] Criar variação mobile do `LiveWidget` (compacta).
- [x] Atualizar `Live.tsx`: trocar a lista fixa "Hoje" por histórico completo com filtros por
      projeto e por tarefa.
- [x] Adicionar seção "Registros de tempo" no dialog de edição de tarefa, listando as entradas
      daquela tarefa específica.
- [x] Verificar (`npm run build`, `npm run lint`) e testar manualmente: start/stop refletindo em
      tempo real no widget, filtros da página Live, registros aparecendo no dialog da tarefa.

## Notas
- **`LiveWidget` é um componente só, responsivo, não dois** — as duas tarefas do plano ("desktop" e
  "variação mobile compacta") viraram uma tarefa de implementação só: classes Tailwind
  `md:`/padrão fazem o pill flutuar no canto inferior direito no desktop e virar uma barra acima da
  navegação inferior no mobile, mesmo estado/lógica de dados. Duplicar o componente só pra trocar
  posicionamento seria reimplementar a mesma busca de dados duas vezes — mesmo princípio já usado
  em `MobileBottomNav`/`AdminLayout` (responsivo via classe, não componente irmão).
- **Bug real encontrado e corrigido na verificação manual**: a posição inicial do widget
  (`bottom-4 right-4` no desktop) ficava embaixo do `QuickAddExpenseFab` (botão "+" global,
  `bottom-6 right-6`, 56px) — o botão de play/parar do widget ficava coberto pelo "+", inclicável.
  Corrigido subindo o widget pra `bottom-24 right-6` no desktop, acima do FAB.
- **`Live.tsx` trocou o resumo "Hoje" (somado por tarefa) por uma lista de entradas individuais
  agrupadas por dia** — decisão não estava explícita no plano original, mas "histórico completo,
  filtrável" pede ver sessões individuais (horário de início/fim), não só o total do dia; manter as
  duas visualizações (resumo por tarefa E lista por entrada) seria complexidade duplicada sem pedido
  claro do usuário para isso.
- Seção "Registros de tempo" foi adicionada só em `TaskList.tsx` (`openEdit`), como o plano
  especificava — o dialog de edição de `ProjectDetail.tsx` (cópia duplicada por decisão da feature
  002) não ganhou a seção nesta rodada. Avaliar com o usuário se vale espelhar lá também.
- Verificado ao vivo (Chrome MCP, sessão ngrok do usuário): iniciar/parar pelo widget reflete em
  tempo real no ícone inline da tarefa (`TaskListRow`) e na página `/tasks/live`; alternar
  Hoje/Tudo e os filtros de projeto/tarefa em Live funcionam; "Registros de tempo" no dialog de
  edição mostra as entradas reais da tarefa. Não testei o layout mobile visualmente nesta sessão —
  `resize_window` do Chrome MCP não reduziu o viewport de fato (a página continuou renderizando o
  layout desktop); o CSS responsivo segue o mesmo padrão já em produção de `MobileBottomNav`/
  `QuickAddExpenseFab` (`md:hidden`/`hidden md:flex`), então o risco é baixo, mas fica como
  verificação pendente com um dispositivo real ou emulador de verdade.
