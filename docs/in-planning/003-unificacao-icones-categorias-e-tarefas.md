---
prompt: |-
  - unificar a lógica de ícones de categoria + tarefas, de modo que também dê para fazer o upload do svg/png na hora de criar uma nova categoria
---

# 003 — Unificação da biblioteca e upload de ícones em Categorias e Tarefas

## Contexto
Atualmente, a gestão de ícones no sistema possui implementações distintas e fragmentadas:
- Em **Tarefas** (`TaskIconPicker.tsx`, `SvgIconPasteField.tsx`, `TaskIconBadge.tsx`, feature 086), o usuário pode escolher entre ícones do catálogo Lucide, colar código SVG diretamente e fazer upload de arquivos SVG ou PNG para a biblioteca compartilhada de assets (`icon_asset` / Supabase Storage).
- Em **Finanças (Categorias, Subcategorias e Naturezas)** (`DimensionsBoard.tsx`, `TypeIcon.tsx`, `lib/typeIconCatalog.ts`), as categorias (`Type`) utilizam apenas uma coluna `lucide_icon` baseada em uma lista estática de nomes pré-definidos (`lucide-react`), e subcategorias/naturezas possuem opções limitadas ou inexistentes de ícones customizados, sem suporte a upload de imagem, colagem de SVG ou integração com a biblioteca de assets do usuário.

O objetivo deste protocolo é unificar a experiência e infraestrutura de seleção e personalização de ícones no app, permitindo que na criação/edição de **Categorias (`Type`)**, **Subcategorias (`Class`)** e **Naturezas (`Nature`)** em Finanças, assim como em Tarefas, o usuário possa selecionar presets do catálogo unificado, fazer upload de SVG/PNG ou colar código SVG diretamente.

## Definições
- **Catálogo & Seletor Unificado de Ícones**: Componente e helpers compartilhados para seleção de presets Lucide, busca de ícones, colagem de SVG e upload de assets visuais.
- **Biblioteca Compartilhada de Ícones (`icon_asset`)**: Armazenamento único de SVGs e PNGs customizados no Supabase Storage e tabela `icon_asset`, acessível por todos os módulos.
- **Dimensões Financeiras (`Nature`, `Type`, `Class`)**: Entidades financeiras que passam a compartilhar a mesma estrutura de ícones gerenciável, suportando tanto chave de catálogo (`lucide_icon` / `icon_key`) quanto URL de asset customizado (`icon_url`).
- **Escopo**:
  - *Dentro*: Componentização do seletor universal de ícones (reaproveitável por Tarefas, Categorias, Subcategorias e Naturezas); suporte a upload e seleção de assets SVG/PNG em `Type`, `Class` e `Nature`; migração ou extensão do schema do banco de dados para suportar `icon_url` ou referências a `icon_asset`; renderizador visual compatível (`TypeIcon` atualizado para renderizar imagens/SVGs remotos).
  - *Fora*: Alteração de regras de categorização automática ou regras de regex de links externos.

## Estrutura
1. **Componente Compartilhado de Seleção de Ícones (`src/components/IconPicker/` ou `src/components/TypeIcon/`)**:
   - Extrair e generalizar a lógica de `TaskIconPicker.tsx` (catálogo, upload de imagem, colar SVG, gerenciar biblioteca) para um seletor unificado parametrizável por presets (`UniversalIconPicker`).
2. **Renderizador de Ícones Unificado (`src/components/TypeIcon.tsx` / `TaskIconBadge.tsx`)**:
   - Atualizar `TypeIcon` para suportar tanto `name` (Lucide) quanto `url` (SVG/PNG remoto ou inline), com fallback seguro para todas as entidades financeiras e tarefas.
3. **Integração no Módulo de Finanças (`src/pages/admin/finance/components/DimensionsBoard.tsx`)**:
   - Substituir os seletores estáticos pelo seletor universal nos formulários/diálogos de criação e edição de Naturezas, Categorias (`Type`) e Subcategorias (`Class`).
4. **Camada de Dados & Persistência**:
   - Atualizar schemas/types de `Nature`, `Type` e `Class` para suportar `icon_url` (ou campo polimórfico de ícone), garantindo compatibilidade retroativa com os registros legados.

## Decisões
- **Estrutura de ícones gerenciável compartilhada para Naturezas, Categorias e Subcategorias**: Toda a árvore dimensional de Finanças (`Nature` -> `Type` -> `Class`) compartilha a mesma capacidade de seleção de catálogo, colagem de SVG e upload de imagem.
- **Compatibilidade retroativa**: Registros existentes com nome de ícone Lucide clássico continuam funcionando normalmente; novos registros podem receber chaves do catálogo ou URLs da biblioteca de assets.
- **Reaproveitamento da infraestrutura da Feature 086 (`icon_asset`)**: A mesma tabela e bucket de storage introduzidos na feature 086 servem a todos os módulos do sistema.

## Perguntas em aberto
- (Nenhuma pergunta impeditiva aberta; decisões de arquitetura e escopo alinhadas).

## Prompts
- 2026-09-04 — Decisão do usuário: "as subcategorias e naturezas também compartilharão da estrutura de ícones gerenciável".

## Attacks
(vazio até o primeiro /attack)
