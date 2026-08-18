- [ ] Agrupar cinema/leitura em um grupo, em que serão salvos também não só filmes, séries e livros, mas também vídeos, artigos, posts, álbums/músicas entre outros 
  - colocar tags
  - [ ] Extensão Chrome para Read Later / Marcar como Lido
    -  para artigos/posts/vídeos/conteúdos no geral
    -  o processamento no backend faz a diferenciação do tipo de conteúdo e pode criar categorias
    -  adiado: módulo de conteúdo geral ainda não existe no app

### Extensão Chrome — v1 (módulos prontos)
- [x] Painel lateral fixo (`/ext` + Manifest V3 em `extension/`)
- [x] Check-in de hábitos do dia
- [x] Restante do orçamento + “Está dentro do orçamento?” em páginas de produto
- [x] Simulação de parcelamento no produto (1ª parcela vs restante do mês; oferta Nx da página)
- [x] Captura: cinema, livros, música, lugares
- [ ] Read Later / artigos (depende do agrupamento de conteúdo)
- [ ] Lista de compras / wishlist (depende do módulo de compras)
- [ ] Tarefas e recursos de projeto
- [ ] Coleções de sites / inspiração

-  Melhoria da parte de tarefas / projetos
   -  ✅ quero poder ter uma criação de um projeto
   -  ✅ quero poder atribuir tarefas para o projeto
   -  devo ser capaz de visualizar em formato de calendário, em formato de cronograma (adiado para v2, fora do escopo do núcleo)
   -  ✅ devo ser capaz de adicionar tags para as tarefas
   -  ✅ devo ser capaz de adicionar prazos para as tarefas
   -  ✅ devo ser capaz de visualizar as tarefas que estão em andamento, em uma seção tipo 'live' que deve ser útil para gerenciamento de tempo e de organização das tarefas
   -  ✅ deve ser possível tipo agrupar, as tarefas, pra poder encadear.

   #### Tarefas de implementação — Núcleo de Tarefas/Projetos (v1)
   - [ ] Migration: tabelas `projects`, `tasks`, `task_dependencies`, `task_time_entries` + RLS por `user_id`
   - [ ] `domain/tasks`: `recurrence.ts`, `dependencies.ts` (detecção de ciclo, soft-block), `timeTracking.ts`, `filters.ts` + testes (Vitest)
   - [ ] `api/tasks`: `projects.ts`, `tasks.ts` (materialização lazy de recorrência no fetch), `timeEntries.ts`, `dependencies.ts`
   - [ ] Página Lista (`/tasks`) com filtro por tag/prazo/projeto
   - [ ] Página Projetos (`/tasks/projects`) + Kanban do projeto (`/tasks/projects/:id`) com subtarefas
   - [ ] Página Live (`/tasks/live`): timer start/pause/stop + histórico de tempo do dia
   - [ ] Recorrência simples (diária/semanal/mensal) na criação/edição de tarefa
   - [ ] Novo grupo de navegação "Produtividade" na sidebar