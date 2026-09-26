- ✅ Música, filmes e livros
    - ✅ Aparecer filmes, livros e músicas conforme o usuário escreve. Igual na parte de lugares
      → implementado: typeahead nos search modals + `useTypeaheadSearch`

- ✅ Geral
    - ✅ Colocar animação ao mover uma atividade para outro dia e uma subcategoria para outra categoria
      → implementado: Framer Motion `layout` em roteiro e DimensionsBoard

- ✅ Usabilidade
    - ✅ Testar a velocidade de criação, edição e deleção de registros e carregamento de dados de todos os módulos e trazer um relatório simples de tempo e como melhorar, se for necessário.
    - ✅ Avalie cada formulário e traga os que estão muito morosos.
    - ✅ Avalie o fluxo de todos os módulos explorando todas as funções e me traga um relatório de cada coisa que, se caso houver algo ruim que possa melhorar.
      → relatório: `docs/superpowers/reports/2026-08-07-usability-perf-forms.md`

- Monetização
    - Gate de trial/Pro inerte no banco inteiro: `has_app_access()`/`enforce_app_access()`
      (`supabase/migrations/20260723120000_app_access_enforce.sql`) são `security definer` com dono
      `postgres`, então o `is_db_admin()` que elas consultam vê `current_user = 'postgres'` e devolve
      `true` para qualquer usuário — todo mundo escreve sem assinatura. Medido durante a 076 (com o
      gate funcionando, a RPC cai com `42501`); os dois cenários estão congelados em
      `supabase/tests/event_invite/05_assert_accept.sql`. Consertar passa a cobrar de quem hoje
      escreve de graça — precisa de análise de impacto (quantas contas ativas perderiam acesso)
      antes de virar feature.
