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
- [x] Confirmar com o usuário a adoção de `@svar-ui/react-gantt` (ou a alternativa DHTMLX) antes de
      instalar — primeira lib de UI pesada desde `@dnd-kit`
- [x] Instalar a lib escolhida
- [x] Adaptador em `domain/tasks/gantt.ts`: `Task[]` (hierarquia projeto→tarefa→subtarefa) para o
      formato da lib; testes Vitest
- [x] Reescrever `GanttChart` sobre a lib, recebendo a lista de tarefas escopada (um projeto, ou
      todas) como prop
- [x] Página nova `/tasks/gantt` (Gantt global) + item na sidebar
- [x] `ProjectDetail.tsx` (aba Gantt) passa a usar o mesmo componente, escopado ao projeto
- [x] Colapsar/expandir por projeto, tarefa e subtarefa; zoom de escala de tempo (dia/semana/mês,
      conforme a lib expuser)
- [ ] `npm run build && npm run lint` limpos + verificação manual (colapsar/expandir em cada nível,
      zoom, Gantt global mostrando tarefas de múltiplos projetos)

## Notas
- `npm run build && npm run lint` e `npx tsc -b` estão limpos (372 testes Vitest passando,
  incluindo 8 novos para `buildGanttNodes`); a verificação manual no navegador (colapsar/expandir,
  zoom, Gantt global com múltiplos projetos) ficou de fora por não haver sessão autenticada
  disponível nesta rodada — mesma lacuna do restante do backlog desta sessão (009-016).
- `domain/tasks/gantt.ts` foi reescrito do zero: `computeGanttDays`/`computeGanttBar`/`GanttTask`/
  `GanttBar` (grade CSS antiga) saíram; entrou `buildGanttNodes(projects, tasks)`, que converte
  `Task[]` pro formato `ITask[]` da lib (`id`, `text`, `start`/`end`, `type`, `parent`, `open`,
  `progress`). Um projeto só vira nó "summary" se tiver ao menos uma tarefa de topo com data —
  evita nós de projeto vazios poluindo a árvore no Gantt global.
- `GanttChart.tsx` ganhou um `props.projects` opcional (default `[]`): em `ProjectDetail.tsx` (um
  projeto só) não faz sentido agrupar por projeto, então tarefas de topo vão direto pra raiz; na
  página nova `/tasks/gantt` a lista de projetos filtrados é passada, criando a hierarquia
  Projeto → Tarefa → Subtarefa.
- **Zoom**: em vez de montar a `Toolbar` da lib (precisa de `ref`/`api` do Gantt e mais estado),
  usei a prop `zoom` direto no componente `<Gantt>` (`zoom?: boolean | IZoomConfig` do
  `IConfig` da lib) — habilita zoom de escala por scroll/pinch sem UI extra. Mais simples e ainda
  atende "zoom de escala de tempo" do plano.
- **Cor por status ficou fora desta rodada** (como já previsto em Decisões): sem conseguir testar
  no navegador, não dava pra confirmar com segurança um hook de estilo por tarefa na lib sem
  arriscar CSS quebrado; a lib já colore por `type` (tarefa=azul, resumo=verde) via tema Willow, o
  que é aceitável para v1. Fica como próximo passo se o usuário pedir.
- **Tema escuro**: `GanttChart` detecta `dark` na classe de `document.documentElement` (mesmo sinal
  que `nav-user.tsx` usa pro toggle de tema) via `MutationObserver`, e alterna entre os wrappers
  `Willow`/`WillowDark` da lib. CSS importado é o `dist-full` (`@svar-ui/react-gantt/all.css`), que
  inclui os dois temas.
- `readonly` fica fixo em `true`: editar `start_date`/`due_date` arrastando a barra ficou
  explicitamente fora de escopo nesta rodada (ver Decisões) — a lib suporta, é só tirar a prop
  quando o usuário confirmar que quer esse comportamento.
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
