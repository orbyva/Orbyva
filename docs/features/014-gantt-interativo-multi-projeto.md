# 014 — Gantt interativo, colapsável e cruzando todos os projetos

## Contexto
A feature 007 decidiu explicitamente "Gantt é uma grade CSS própria, sem lib externa" e "Escopo do
Gantt é sempre um projeto — não faz um Gantt global misturando projetos diferentes (ficaria
ilegível)". O resultado (`src/domain/tasks/gantt.ts` + `GanttChart.tsx`) é uma grade estática:
uma coluna por dia, barra colorida por status, sem colapsar, sem zoom, sem drag, e só dentro de um
projeto por vez. O usuário agora pede explicitamente o oposto das duas decisões: algo "muuuito mais
interativo", colapsável em nível de tarefa e subtarefa, e um Gantt que junte todos os projetos —
mesma dinâmica da feature 003, que reverteu a decisão original de "sem drag-and-drop" no Kanban
quando o usuário pediu explicitamente.

Pesquisa feita a pedido do usuário ("busque referências"): o repo irmão `smartminutes` (indicado
como referência de design) não tem Gantt nem árvore colapsável pronta pra copiar — o mais próximo
são timelines verticais e linhas de lista expansíveis (padrões de interação úteis, listados em
Notas). Para a peça central (Gantt em si), pesquisa de bibliotecas React atuais aponta
`@svar-ui/react-gantt` como melhor opção: relicenciada para MIT na versão 2.4, hierarquia
pai-filho colapsável nativa (`parent: id` — encaixa direto com `task.parent_task_id` que já
existe), zoom de escala de tempo, edição de datas por drag-and-drop, compatível com React 18/19 e
TypeScript. Fontes em Notas.

## Decisões
- **Reverte a decisão da 007**: adota uma lib em vez de continuar a grade CSS manual. Recriar à mão
  árvore colapsável + zoom + drag seria reimplementar uma quantidade grande de UI já madura em
  bibliotecas específicas para isso — não é um caso de YAGNI, é o oposto do que o usuário pediu
  ("muito mais interativo").
- **Biblioteca recomendada: `@svar-ui/react-gantt`** (MIT, `npm i @svar-ui/react-gantt`). É a
  primeira dependência de UI "pesada" desde `@dnd-kit` (feature 003) — fica marcada como ponto a
  confirmar com o usuário antes de instalar (ver Tarefas), não decidida silenciosamente. Alternativa
  encontrada na mesma pesquisa: DHTMLX Gantt Community Edition (também MIT recentemente, mais
  madura porém mais pesada) — considerar se o SVAR não performar bem o suficiente na prática.
- **Hierarquia de 3 níveis**: Projeto (linha-resumo) → Tarefa de topo → Subtarefa, usando o
  parentesco nativo da lib. Se a lib não aceitar 3 níveis de profundidade sem gambiarra (a
  documentação pesquisada não deixa isso explícito), o Projeto degrada para um cabeçalho de seção
  visual em vez de nó colapsável de verdade — aceitável, decidir durante a implementação.
- **View global nova** `/tasks/gantt` (grupo "Produtividade" na sidebar) mostra todos os projetos.
  O Gantt já embutido em `/tasks/projects/:id` (feature 007) passa a ser o **mesmo componente**
  filtrado para um projeto só — não duas implementações paralelas.
- **`start_date`/`due_date` continuam a fonte de verdade**; um adaptador em `domain/tasks/gantt.ts`
  converte `Task[]` para o formato esperado pela lib — substitui as funções atuais
  (`computeGanttDays`/`computeGanttBar`, que só serviam à grade CSS manual).
- **Cor por status** (cinza/azul/verde, mesma paleta atual de todo/doing/done) mapeada pra API de
  estilo da lib; prioridade (`TaskPriorityFlag`, feature 008) vira indicador extra na barra
  (borda/ícone), não substitui a cor de status.
- Fora de escopo nesta rodada: editar `start_date`/`due_date` arrastando a barra diretamente (a lib
  suporta, mas é comportamento novo que precisa de confirmação de UX própria — decidir durante a
  implementação, não travar o planejamento nisso agora); linhas de dependência entre tarefas
  (`task_dependency`, feature 001) desenhadas no Gantt — nice-to-have, não obrigatório.

## Tarefas
- [ ] Confirmar com o usuário a adoção de `@svar-ui/react-gantt` (ou a alternativa DHTMLX) antes de
      instalar — primeira lib de UI pesada desde `@dnd-kit`
- [ ] Instalar a lib escolhida
- [ ] Adaptador em `domain/tasks/gantt.ts`: `Task[]` (hierarquia projeto→tarefa→subtarefa) para o
      formato da lib; testes Vitest
- [ ] Reescrever `GanttChart` sobre a lib, recebendo a lista de tarefas escopada (um projeto, ou
      todas) como prop
- [ ] Página nova `/tasks/gantt` (Gantt global) + item na sidebar
- [ ] `ProjectDetail.tsx` (aba Gantt) passa a usar o mesmo componente, escopado ao projeto
- [ ] Colapsar/expandir por projeto, tarefa e subtarefa; zoom de escala de tempo (dia/semana/mês,
      conforme a lib expuser)
- [ ] `npm run build && npm run lint` limpos + verificação manual (colapsar/expandir em cada nível,
      zoom, Gantt global mostrando tarefas de múltiplos projetos)

## Notas
- Referências levantadas a pedido do usuário:
  - SVAR React Gantt — https://svar.dev/react/gantt/ (produto) e
    https://svar.dev/blog/top-react-gantt-charts/ (comparativo com outras libs)
  - Anúncio da relicença para MIT na v2.4 —
    https://medium.com/@SvarWidgets/svar-gantt-2-4-a-modern-gantt-chart-library-for-react-svelte-under-the-mit-license-ae62f36a5dde
  - Alternativa DHTMLX Gantt Community Edition (MIT) —
    https://dhtmlx.com/docs/products/dhtmlxGantt/open-source/
  - `smartminutes` (repo irmão, sem Gantt pronto) tem padrões de interação/visual que valem
    espelhar no acabamento do Gantt novo: timeline vertical com linha conectando bolhas de evento
    (`src/components/meeting/DealSalesTimeline.tsx`), scrubber horizontal com marcadores coloridos
    por categoria + tooltip com blur (`src/components/meeting/VideoTimeline.tsx`), linhas de lista
    expansíveis inline sem modal (`src/components/settings/PillarCalibration.tsx`), token semântico
    de cor (`--success`) e sombra de elevação leve (`0 1px 3px rgba(0,0,0,.05), 0 4px 16px
    rgba(0,0,0,.04)`) — reaproveitar esses detalhes de acabamento no visual das barras/cards do
    Gantt novo, mesmo a lib de base sendo diferente.
