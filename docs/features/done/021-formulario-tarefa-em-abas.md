# 021 — Formulário de tarefa em abas

## Contexto
O dialog de criar/editar tarefa (`TaskList.tsx`, e sua cópia duplicada em `ProjectDetail.tsx` —
duplicação aceita desde a feature 002) empilha em coluna única: Título, Descrição, Projeto (só em
`TaskList.tsx`), Tags, Link externo, Prioridade (`TaskPriorityField`), Data/Repetição
(`TaskRecurrenceField` — já agrega Prazo, Repetir simples e Vinculada a Recorrência Financeira,
feature 005) e Subtarefas (`TaskSubtasksField`); ao editar, ainda entra "Registros de tempo"
(`TaskTimeEntriesField`, feature 017). É um scroll longo pra criar até uma tarefa simples.

## Decisões
- Dividir em abas com `Tabs`/`TabsList`/`TabsContent` de `@/components/ui/tabs` — já usado no
  projeto (ex: seletor Kanban/Lista/Gantt em `ProjectDetail.tsx`), não é dependência nova.
- Agrupamento:
  - **Geral**: Título, Descrição, Projeto (quando aplicável), Prioridade — o essencial pra criar
    rápido, aba padrão ao abrir o dialog.
  - **Data e repetição**: `TaskRecurrenceField` inteiro (Prazo, Repetir, Vinculada).
  - **Organização**: Tags, Link externo, Subtarefas.
  - **Registros de tempo** (só ao editar — aba nem aparece ao criar): `TaskTimeEntriesField`.
- Botão "Criar tarefa"/"Salvar alterações" fica fora do `TabsContent`, fixo no rodapé do dialog —
  salvar não pode depender de estar numa aba específica.
- Título continua o único campo obrigatório e vive na primeira aba, sempre visível ao abrir.
- Segue a convenção de duplicação já aceita entre `TaskList.tsx`/`ProjectDetail.tsx` — cada
  arquivo implementa sua própria divisão em abas, sem componente novo compartilhado (os campos já
  divergem entre os dois: Projeto só existe em `TaskList.tsx`).
- Sem mudança de schema/API — reorganização pura de UI sobre campos que já existem.

## Tarefas
- [x] Dividir o dialog de `TaskList.tsx` nas 4 abas (Geral / Data e repetição / Organização /
      Registros de tempo — última só quando `editing`)
- [x] Aplicar a mesma divisão em `ProjectDetail.tsx` (sem a aba/campo Projeto)
- [x] Garantir botão salvar fora das abas (sempre visível) e navegação de volta pra "Geral" se o
      Título ficar vazio ao tentar salvar
- [x] `npm run build && npm run lint` + teste manual: criar tarefa nova, editar tarefa com
      registros de tempo, confirmar que trocar de aba não perde dado digitado em outra

## Notas
- `ProjectDetail.tsx` ganhou a aba "Registros de tempo" ao editar — antes desta feature esse
  arquivo não usava `TaskTimeEntriesField` (feature 017 só tinha coberto `TaskList.tsx`), gap que
  ficou visível ao replicar a divisão em abas. Import adicionado, mesmo comportamento de
  `TaskList.tsx`.
- Guarda de título vazio (`if (!form.title.trim()) { setFormTab("geral"); return; }`) implementada
  identicamente nos dois arquivos, antes do `handleSave` seguir para a chamada de API.
- Build (`tsc -b && vite build`) e lint rodaram limpos: 0 erros, só os warnings pré-existentes do
  projeto (react-refresh/only-export-components, react-hooks/exhaustive-deps em arquivos não
  tocados por esta feature).
- Verificação manual via browser (Chrome MCP) contra o dev server local através do túnel ngrok,
  cobrindo os dois arquivos: abrir "Nova tarefa" (3 abas, sem Registros de tempo), trocar de aba e
  confirmar que o título digitado na aba Geral persiste ao navegar para outras abas e voltar,
  tentar salvar com título vazio (retorna pra Geral), criar a tarefa, abrir em modo edição
  (4ª aba aparece), conferir estado vazio "Nenhum registro ainda." em Registros de tempo, e por
  fim excluir a tarefa de teste para não deixar lixo na conta.
