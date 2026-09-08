---
prompt: |-
  - na tela de véículos, não há botão para adicionar veículo
---

# 002 — Botão e fluxo de adição de veículos

## Contexto
O usuário identificou que na tela de Veículos (`/car`, `Car.tsx`), quando não há nenhum veículo cadastrado (estado vazio), não é renderizado nenhum botão para adicionar/cadastrar veículo. A investigação do código confirmou que no estado vazio de `Car.tsx`, o componente `<VehicleFormDialog open={createVehicleOpen} onOpenChange={setCreateVehicleOpen} onSaved={reloadAll} />` é passado para o slot `action` de `<EmptyState />` sem a prop `trigger`, e a condição interna de fallback do dialog (`!trigger && !isEditing && controlledOpen === undefined`) avalia para falso porque `controlledOpen` recebe `false` (valor booleano definido), impedindo a renderização do botão de cadastro no estado vazio.

## Definições
- **Tela de Veículos (`Car.tsx`)**: Módulo para gestão de manutenções, abastecimentos e documentos de veículos.
- **Estado Vazio (`EmptyState`)**: Tela exibida quando a lista de veículos retornada por `fetchVehicles()` é vazia (`vehicles.length === 0`). Deve conter um botão de ação primário e acessível ("Cadastrar veículo" / "Novo veículo") que abre o diálogo de criação.
- **Estado com Veículos**: Quando já existem veículos, o cabeçalho (`PageShell actions`) já contém "Novo veículo", mas é necessário garantir consistência entre os botões de ação do topo e das ações contextuais.

## Estrutura
1. **Correção do gatilho no `VehicleFormDialog` e `Car.tsx`**:
   - Passar explicitamente o botão `<Button>Cadastrar veículo</Button>` como prop `trigger` no `<VehicleFormDialog />` ou disparar a abertura via `onClick={() => setCreateVehicleOpen(true)}` no botão do `EmptyState`.
   - Revisar a lógica de controle de estado (`open`, `controlledOpen`, `trigger`) em `VehicleFormDialog.tsx` para evitar silenciamento do botão de ação.
2. **Verificação de Acessibilidade e Responsividade**:
   - Garantir que tanto no mobile quanto no desktop o botão seja clicável e responsivo no estado vazio e no cabeçalho com veículos existentes.

## Decisões
- **Gatilho explícito**: O botão dentro do `EmptyState` deve ser passado explicitamente via prop `action` com `<Button onClick={() => setCreateVehicleOpen(true)}>Cadastrar veículo</Button>` para desacoplar a renderização do botão da lógica interna do Dialog.

## Perguntas em aberto
- (Nenhuma pendência crítica identificada no momento; o comportamento e o fluxo de cadastro de veículos já estão bem delineados).

## Prompts
(vazio até haver iteração nova)

## Attacks
(vazio até o primeiro /attack)
