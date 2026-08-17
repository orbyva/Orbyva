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
- [ ] Criar `src/types/health.ts` com `HealthSummary = { nextMedicationDose: Task | null }` (importando `Task` de `src/types/tasks.ts`)
- [ ] Adicionar `health: "hsl(350 89% 60%)"` a `moduleColors` em `src/lib/design-tokens.ts`
- [ ] Adicionar a CSS var `--health: 350 89% 60%` em `src/index.css`, nos blocos light e dark (seguindo como `--car`/`--travel`/`--cinema` são declaradas)
- [ ] Adicionar `health: "bg-[hsl(var(--health))]"` ao mapa `MODULE_DOT` em `src/pages/admin/life/hubMeta.ts`
- [ ] Adicionar a entrada de Saúde ao array `HOME_MODULES` em `src/pages/admin/life/hubMeta.ts`: `{ label: "Saúde", subtitle: "Medicações e consultas", href: "/life/health", icon: HeartPulse, tone: "bg-[hsl(var(--health))]/10 text-[hsl(var(--health))]" }` — importar `HeartPulse` de `lucide-react`
- [ ] Criar `src/api/health.ts` com `loadHealthSummary(): Promise<HealthSummary>` — busca em `task` a próxima ocorrência com `is_medication = true`, `status = 'todo'` e `due_date >= hoje`, ordenada por `due_date`/`due_time`, `limit 1`
- [ ] Criar `src/pages/admin/life/HealthDashboard.tsx` usando `PageShell`, com a seção "Próxima dose" (ou `EmptyState` com CTA "Cadastrar medicação" quando não houver nenhuma) e `TableLoadingSkeleton` durante o carregamento; erros de fetch via `useToast` + `getErrorMessage`
- [ ] Registrar a rota `/life/health` → `<HealthDashboard />` em `src/routes.tsx`
- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] Verificação manual: abrir o hub de Vida, confirmar que o card "Saúde" aparece no grid com o dot rose; clicar e chegar em `/life/health`; com uma medicação já cadastrada, conferir que a próxima dose aparece com data e hora corretas; sem nenhuma, conferir o `EmptyState`; alternar tema light/dark e confirmar que a cor do módulo se mantém legível nos dois

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
- Não foi criada agregação de saúde em `loadHomeBundle` (`src/api/hub.ts`). Motivo: `loadHomeBundle` tem caminho de Edge Function (`home-bundle`) com fallback local, e mexer nele exigiria alterar também a Edge Function para os dois caminhos continuarem equivalentes. O Health Dashboard carrega seu próprio resumo. Se depois fizer sentido mostrar saúde no dashboard de Vida, isso vira feature própria, com os dois caminhos tratados juntos.
