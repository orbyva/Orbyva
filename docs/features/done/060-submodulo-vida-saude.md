---
prompt: |
  - SUB-MÓDULO DE VIDA.SAÚDE
    - CONTROLAR MEDICAMENTOS
    - CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)
    - E PROGRESSO NO CUIDADO COM O PRÓPRIO CORPO
      - CONTROLE DE NOTIFICAÇÕES PARA ALIMENTAÇÃO
      - CONTROLE DE NOTIFICAÇÕES PARA INGESTÃO DE ÁGUA
      - TUDO NO FUTURO VAI DAR UMA PUSH NOTIFICATION PARA O USUÁRIO
---

# 060 — Sub-módulo Vida > Saúde: registro no hub e dashboard base

## Contexto
O módulo "Vida" já existe (`src/pages/admin/life/`), mas Saúde não é um sub-módulo registrado. Medicações já funcionam hoje como tarefas com flag `is_medication` (feature 049). Esta feature cria o ponto de entrada — registro no grid do hub, cor de módulo, rota e dashboard — para que as features 061 a 064 tenham onde pendurar suas telas. Sozinha ela já entrega valor: um Health Dashboard que mostra a próxima dose de medicação a partir do que a 049 já grava.

## Decisões
- **Saúde é um hub de primeiro nível dentro de Vida**, com rota própria `/life/health`, e não uma aba/fragment de `LifeDashboard`. Motivo: é o padrão dos outros módulos (Finanças, Hábitos) e permite deep-link direto para as sub-telas de 061-064.
- **Cor do módulo: rose-500 = `hsl(350 89% 60%)`** (equivalente exato de `#f43f5e`, o `rose-500` do Tailwind). Todos os pontos de uso — `moduleColors`, CSS var `--health`, `MODULE_DOT` e as classes `tone` — usam esse mesmo valor. Descartado verde/emerald: já é a cor de `goals` em `MODULE_DOT`.
- **`loadHealthSummary` retorna nesta feature apenas `nextMedicationDose: Task | null`.** Consultas e métricas corporais ainda não têm tabela nem tipo; os campos correspondentes são adicionados ao tipo pelas features que os preenchem (061 e 063). Motivo: TS é strict e não se escreve `any` para reservar espaço — campo sem tipo real é campo que não deve existir ainda.
- **Sem migration nesta feature.** A próxima dose sai de `task` com `is_medication = true`, que já existe desde a migration `20260816120000_task_medication.sql`.
- **Dados de saúde são sensíveis**: toda tabela criada pelas features 061-064 deste sub-módulo terá RLS por `user_id`, sem exceção. Fica registrado aqui porque é a decisão que vale para o sub-módulo inteiro.

## Tarefas
- [x] Criar `src/types/health.ts` com `HealthSummary = { nextMedicationDose: Task | null }` (importando `Task` de `src/types/tasks.ts`)
- [x] Adicionar `health: "hsl(350 89% 60%)"` a `moduleColors` em `src/lib/design-tokens.ts`
- [x] Adicionar a CSS var `--health: 350 89% 60%` em `src/index.css`, nos blocos light e dark (seguindo como `--car`/`--travel`/`--cinema` são declaradas)
- [x] Adicionar `health: "bg-[hsl(var(--health))]"` ao mapa `MODULE_DOT` em `src/pages/admin/life/hubMeta.ts`
- [x] Adicionar a entrada de Saúde ao array `HOME_MODULES` em `src/pages/admin/life/hubMeta.ts`: `{ label: "Saúde", subtitle: "Medicações e consultas", href: "/life/health", icon: HeartPulse, tone: "bg-[hsl(var(--health))]/10 text-[hsl(var(--health))]" }` — importar `HeartPulse` de `lucide-react`
- [x] Criar `src/api/health.ts` com `loadHealthSummary(): Promise<HealthSummary>` — busca em `task` a próxima ocorrência com `is_medication = true`, `status = 'todo'` e `due_date >= hoje`, ordenada por `due_date`/`due_time`, `limit 1`
- [x] Criar `src/pages/admin/life/HealthDashboard.tsx` usando `PageShell`, com a seção "Próxima dose" (ou `EmptyState` com CTA "Cadastrar medicação" quando não houver nenhuma) e `TableLoadingSkeleton` durante o carregamento; erros de fetch via `useToast` + `getErrorMessage`
- [x] Registrar a rota `/life/health` → `<HealthDashboard />` em `src/routes.tsx`
- [x] `npm run build`
- [x] `npm run lint`
- [x] Cobertura da consulta: `src/api/__tests__/health.test.ts` — Supabase falso que **executa** os filtros em memória, provando escopo por `user_id`, `is_medication`/`status`/`due_date >= hoje`, ordem `due_date` → `due_time` (nulo por último) e `limit 1`
- [x] Cobertura da tela: `src/pages/admin/life/__tests__/HealthDashboard.flow.test.tsx` — backend falso em memória: estado vazio com CTA, dose com data e hora, escolha da dose mais próxima, cadastro pelo CTA gravando `is_medication` e recarregando a tela, erro de fetch virando toast
- [x] Cobertura do registro no hub e da cor: `src/pages/admin/life/__tests__/health-navigation.test.tsx` — card "Saúde" renderizado do `HOME_MODULES` apontando para `/life/health` (depois de Hábitos), classes de cor do card, `moduleColors.health`/`MODULE_DOT.health` e `--health` declarada com o mesmo valor nos blocos light e dark do `src/index.css`

## Prompts
- 2026-08-16 — "- SUB-MÓDULO DE VIDA.SAÚDE
  - CONTROLAR MEDICAMENTOS
  - CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)
  - E PROGRESSO NO CUIDADO COM O PRÓPRIO CORPO
    - CONTROLE DE NOTIFICAÇÕES PARA ALIMENTAÇÃO
    - CONTROLE DE NOTIFICAÇÕES PARA INGESTÃO DE ÁGUA
    - TUDO NO FUTURO VAI DAR UMA PUSH NOTIFICATION PARA O USUÁRIO"

## Notas
- **Recorte do prompt-mãe que esta feature cumpre**: nenhum item funcional isolado — ela cria o sub-módulo "VIDA.SAÚDE" em si, que é o guarda-chuva dos quatro itens. Os itens são cumpridos por: medicamentos → 064 (sobre a base da 049), consultas → 061, água/alimentação → 062, progresso corporal e lembretes → 063.
- Ordem de implementação do sub-módulo: **060 → 061 → 062 → 063 → 064**. A 064 vem por último por ser a de maior custo (migration com backfill de dados existentes); as demais não dependem dela.
- `HOME_MODULES` é um `as const` — a ordem do array é a ordem de renderização no grid. Saúde entra após Hábitos.
- Confirmar o nome do ícone em `lucide-react` antes de usar: a intenção é `HeartPulse`; se não existir na versão instalada, usar `Heart`.
- `HealthSummary` cresce nas features seguintes: 061 acrescenta `nextConsultation`, 063 acrescenta `latestMetric` e `reminderPreferences`. Cada uma adiciona seu campo junto com o tipo que o descreve — nunca antes.
- A tarefa de "verificação manual no navegador" foi trocada por três tarefas de cobertura
  automatizada (consulta, tela e registro no hub/cor). Motivo: a skill `next` proíbe Chrome neste
  fluxo, e ela mesma manda tratar "só dá pra confirmar no navegador" como falta de cobertura. O
  teste do `index.css` lendo os dois blocos de tema é o substituto do "alternar light/dark".
- O CTA "Cadastrar medicação" reaproveita o `MedicationQuickCreateDialog` da 049 em vez de mandar o
  usuário para `/tasks` — nada da 049 foi alterado, só importado. O mesmo botão aparece no header
  quando já existe uma dose (aí o `EmptyState` some), para não repetir dois botões iguais na tela.
- `--health-foreground` não foi criada: nada usa fundo sólido de saúde ainda, e o par `--x`/
  `--x-foreground` dos outros módulos existe porque eles estão registrados no `tailwind.config`.
  Saúde usa só as classes arbitrárias `bg-[hsl(var(--health))]`, então a var extra seria morta.
- A próxima dose só enxerga ocorrências **já materializadas** na tabela `task` — a materialização da
  série recorrente acontece em `fetchTasks` (049). Na prática, quem abre `/tasks` mantém a série em
  dia; se isso virar problema (usuário que só abre Saúde), é a 064 que resolve, já que é ela que
  reformula o controle de medicamentos.
- Não foi criada agregação de saúde em `loadHomeBundle` (`src/api/hub.ts`). Motivo: `loadHomeBundle` tem caminho de Edge Function (`home-bundle`) com fallback local, e mexer nele exigiria alterar também a Edge Function para os dois caminhos continuarem equivalentes. O Health Dashboard carrega seu próprio resumo. Se depois fizer sentido mostrar saúde no dashboard de Vida, isso vira feature própria, com os dois caminhos tratados juntos.
