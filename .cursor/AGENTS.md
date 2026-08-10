# AGENTS.md

## Objetivo do Projeto

Orbyva é um **life OS** pessoal em português (Brasil): finanças, metas, hábitos, viagens, lugares, veículos, cinema, livros e música no mesmo app.

Stack principal: **React 19 + TypeScript + Vite**, Tailwind + shadcn/ui, Recharts, Framer Motion e **Supabase** (Auth, Postgres + RLS, Storage e Edge Functions). Deploy front na Vercel; segredos de terceiros (Stripe, Spotify, Google Maps/Places/Routes/Weather, Resend) ficam em Edge Functions, nunca em `VITE_*` de produção sensível.

A aplicação deve ser tratada como uma solução profissional, escalável, segura, testável, bem documentada e preparada para uso real por clientes (trial/Pro, tenancy, cotas de APIs externas).

Fontes de verdade do produto e da arquitetura:

* [`README.md`](../README.md) — módulos, camadas, rotas, env, billing, e-mails, qualidade;
* [`ARCHITECTURE.md`](./ARCHITECTURE.md) — arquitetura de código (camadas, fluxos, Edge, limites);

---

## Instrução Principal para a IA

Antes de propor, alterar ou implementar qualquer código:

1. **Ler [`ARCHITECTURE.md`](./ARCHITECTURE.md)** — obrigatório em **toda** mudança (código, schema, Edge, docs de produto/arquitetura). Usar as camadas, fluxos e limites desse documento como restrição de desenho.
2. Levar sempre em consideração as recomendações do conselho técnico multidisciplinar abaixo.

Esse conselho atua como uma camada de revisão contínua do projeto e deve influenciar decisões de arquitetura, qualidade, segurança, dados, usabilidade, testes, performance e manutenção.

Sempre que implementar algo, pense como se a alteração estivesse sendo revisada pelos especialistas abaixo.

---

## Fluxo obrigatório de trabalho

1. **Ler a arquitetura:** antes de qualquer mudança, ler [`ARCHITECTURE.md`](./ARCHITECTURE.md) (e este `AGENTS.md` quando for alteração relevante).
2. **Plano antes de código:** qualquer mudança relevante (feature, bugfix estrutural, migration, Edge Function, alteração de contrato de API, UI de módulo, billing, segurança) deve começar com um **plano objetivo** apresentado ao usuário.
3. **Aguardar aprovação:** só implementar depois que o usuário **aprovar** o plano (ou pedir ajustes e reaprovar). Correções triviais e pontuais (typo, lint óbvio, ajuste de uma linha já acordada) podem seguir sem plano formal se o escopo estiver claro no pedido — ainda assim, após ler [`ARCHITECTURE.md`](./ARCHITECTURE.md).
4. **README em sincronia:** toda alteração que mude comportamento, módulos, rotas, arquitetura, variáveis de ambiente, Edge Functions, billing, autenticação, banco (gates/migrations relevantes), fluxo de contribuição ou comandos de qualidade **deve ser refletida no [`README.md`](../README.md)** no mesmo ciclo de trabalho. Não deixar documentação do produto desatualizada em relação ao código.
5. **Arquitetura em sincronia:** se a mudança alterar camadas, fluxos, Edge Functions, segurança/tenancy ou a estrutura de pastas documentada, atualizar também [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

# Conselho Técnico do Projeto

## 1. Arquiteto de Software

Avaliar:

* Organização geral do projeto (SPA multi-módulo + BaaS);
* Separação de responsabilidades: `pages/` → `hooks/` → `api/` → `domain/`;
* Escalabilidade por módulo (finance, movies, books, music, habits, goals, places, travel, car);
* Baixo acoplamento entre módulos; alta coesão dentro de `api/` e `domain/` por domínio;
* Clareza da estrutura de pastas (`src/`, `supabase/migrations/`, `supabase/functions/`, `e2e/`);
* Padrões adequados (UI fina, regras puras testáveis, I/O isolado);
* Facilidade de manutenção e evolução.

Sempre sugerir melhorias quando a arquitetura estiver confusa, frágil ou difícil de evoluir.

**Regra prática:** se a lógica precisa de `supabase` ou `fetch`, vai em `api/` ou `lib/`. Se dá para unit-testar sem rede, vai em `domain/`.

---

## 2. Tech Lead

Avaliar:

* Qualidade técnica geral;
* Priorização das melhorias;
* Simplicidade da solução;
* Consistência entre frontend, Supabase (schema/RLS), Edge Functions e integrações externas;
* Decisões técnicas que impactam o futuro do produto (billing, cotas Maps, catálogos, PWA).

O Tech Lead deve consolidar as recomendações dos demais especialistas e priorizar o que gera maior impacto para o projeto.

---

## 3. Engenheiro de Software Sênior

Avaliar:

* Clareza do código;
* Reutilização;
* Boas práticas TypeScript strict;
* Nomes de variáveis, funções, classes e arquivos;
* Tratamento de erros;
* Evitar duplicidade;
* Evitar complexidade desnecessária;
* Código fácil de entender, testar e manter;
* Hooks React nunca após early return.

O código deve ser limpo, objetivo e profissional.

---

## 4. Especialista em Qualidade de Software

Avaliar:

* Padronização (ESLint, padrões shadcn existentes);
* Confiabilidade e robustez;
* Tratamento de exceções;
* Validações de entrada e regras de negócio;
* Consistência de comportamento entre módulos similares (ex.: status de cinema/livros/música);
* Prevenção de bugs e cenários de borda (fusos, cotas, trial expirado, listas vazias).

Sempre que possível, melhorar a qualidade junto com a implementação.

---

## 5. QA / Tester

Avaliar:

* Testes unitários (Vitest em `domain/**/__tests__` e `lib/__tests__`);
* Testes de integração e E2E (Playwright em `e2e/`);
* Testes de regressão;
* Cenários felizes, de erro e extremos;
* Validação de regras de negócio (RLS com 2 contas quando tenancy estiver em jogo);
* Cleanup de dados E2E (`E2E*`) sem interferir em specs paralelos.

Sempre que criar ou alterar uma funcionalidade importante, sugerir ou implementar testes relacionados. Antes de considerar pronto em mudanças grandes: `npm run ci:local` (ou lint + vitest + `tsc` nos arquivos tocados).

---

## 6. Analista de Segurança

Avaliar:

* Autenticação (Supabase Auth, Google OAuth, hooks de e-mail);
* Autorização e tenancy (`user_id` + **RLS**);
* Escrita gated por trial/Pro (`app_access_enforce`);
* Front só com **Anon Key**; service role nunca no browser;
* Segredos Google / Spotify / Stripe / Resend / `CRON_SECRET` / `OPS_ADMIN_EMAILS` apenas em secrets do Supabase ou CI;
* Validação de entrada; sanitização; CORS das Edge (`SITE_URL` + localhost em dev);
* Logs sem dados sensíveis;
* Boas práticas contra OWASP Top 10;
* Console `/ops` com allowlist só no servidor.

Nunca deixar tokens, senhas, chaves ou credenciais expostas no código ou em `VITE_*` indevidos.

---

## 7. Especialista em Governança de Dados

Avaliar:

* Qualidade e consistência dos dados do usuário entre módulos;
* Rastreabilidade e origem (catálogos TMDB/OMDb, Google Books, Spotify/MusicBrainz, Places);
* Padronização de nomes de campos e status;
* Regras de negócio aplicadas aos dados (ex.: exclusão de viagem e cascade de lugares com `trip_id`);
* Confiabilidade do que a UI mostra (saldos, streaks, cotas, projeção financeira);
* Preparação para auditoria e exportação na Conta.

Respostas e insights (quando houver) devem ser confiáveis, explicáveis e rastreáveis aos dados do usuário.

---

## 8. Engenheiro de Dados

Avaliar:

* Modelagem alinhada às migrations em `supabase/migrations/`;
* Estratégia de ingestão de catálogos e proxies de mídia;
* Transformação e persistência (ex.: `track_ratings` jsonb, geo de lugares);
* Performance de consultas e paginação;
* Tratamento de nulos e estados parciais;
* Normalização vs. desnormalização quando fizer sentido;
* Preparação para indicadores no dashboard e timeline.

---

## 9. DBA / Especialista em Banco de Dados

Avaliar:

* Índices, constraints, PKs/FKs e integridade referencial;
* RLS e policies;
* Performance de queries; evitar N+1 e scans desnecessários;
* Estratégia de crescimento da base;
* Tipos de dados corretos;
* Cotas e contadores de Maps (fail-closed);
* `supabase db push` **somente com aprovação explícita** do usuário.

Sempre que uma consulta ou modelagem puder prejudicar performance ou integridade, sugerir melhoria.

---

## 10. Analista de BI / Dados

Avaliar:

* Indicadores possíveis (KPIs financeiros, hábitos, progresso de metas, uso por módulo);
* Dimensões e filtros úteis (período, categoria, status);
* Consistência dos números entre dashboard, timeline e módulos;
* Clareza das análises apresentadas ao usuário.

Considerar que dados do app alimentam dashboards internos.

---

## 11. Especialista em IA / Agentes Inteligentes

Avaliar:

* Qualidade dos prompts e instruções do agente (este arquivo, skill Orbyva, docs);
* Controle de alucinação: basear-se em código e dados reais do repositório;
* Uso correto de contexto (README, migrations, Edge, `docs/`);
* Explicabilidade das respostas e limites do agente;
* Segurança no uso de dados do usuário;
* Não inventar módulos, rotas ou secrets.

O agente deve sinalizar quando não houver informação suficiente e preferir plano + aprovação a improvisar.

---

## 12. Analista de Produto / Product Owner

Avaliar:

* Valor real para o usuário do life OS;
* Clareza da experiência em PT-BR;
* Priorização (dor real vs. nice-to-have);
* Simplicidade; aderência aos módulos existentes;
* Evitar funcionalidades desnecessárias;
* Alinhamento com billing (trial 7 dias → Pro) e growth (waitlist, e-mails).

---

## 13. Analista de Requisitos

Avaliar:

* Regras de negócio e fluxos principais/alternativos/erro;
* Campos obrigatórios e validações;
* Critérios de aceite;
* Ambiguidades: assumir a melhor interpretação alinhada ao README/docs e **documentar a decisão** no plano.

---

## 14. UX Designer

Avaliar:

* Facilidade de uso; hierarquia; navegação (sidebar em quatro blocos);
* Feedbacks, mensagens de erro, estados vazios e de carregamento;
* Densidade mobile (especialmente roteiro de viagem);
* Redução de fricção (⌘K, alertas, PWA).

UI em **português (Brasil)**. A aplicação deve ser simples mesmo para usuários não técnicos.

---

## 15. UI Designer

Avaliar:

* Consistência com o design system existente (Tailwind, shadcn, tokens);
* Espaçamentos, tipografia, cores, componentes;
* Responsividade e aparência profissional;
* Evitar cards desnecessários; não inventar tema genérico (roxo/cream) em telas novas do app admin.

---

## 16. Especialista em Acessibilidade

Avaliar:

* Contraste, labels, textos claros;
* Navegação por teclado; tamanho de fonte;
* Feedback visual; semântica HTML;
* Compatibilidade com leitores de tela;
* Boas práticas de acessibilidade em formulários, tabelas e modais Radix/shadcn.

---

## 17. DevOps / Cloud Engineer

Avaliar:

* Env local / Vercel / secrets Supabase;
* CI (GitHub Actions + `npm run ci:local`);
* Deploy front (SPA + rewrites/proxies em `vercel.json`);
* Deploy de Edge Functions com aprovação do usuário;
* Logs, monitoramento e observabilidade futuros;
* Facilidade de rodar, testar e publicar.

Migrations e deploys destrutivos ou de produção só com aprovação explícita.

---

## 18. Especialista em Performance

Avaliar:

* Tempo de carregamento (lazy routes, prefetch idle no `AdminLayout`);
* Bundle budget (`npm run check:bundle`);
* Cache de catálogo (`memoryCache` + `useCachedCatalog`);
* Paginação e filtros no cliente quando apropriado;
* Evitar renderizações e chamadas excessivas;
* Cotas e custo de APIs Google/Spotify;
* Boa experiência em dispositivos mais simples e PWA.

---

## 19. Especialista em Documentação Técnica

Avaliar:

* [`README.md`](../README.md) sempre alinhado ao código;
* Instruções de instalação, testes, env, arquitetura, rotas, billing, e-mails;
* Decisões técnicas relevantes e exemplos de uso;
* Fontes em `docs/` e planos em `docs/superpowers/` quando aplicável.

Toda melhoria relevante deve atualizar a documentação necessária — **em especial o README**.

---

## 20. Especialista em Observabilidade

Avaliar:

* Logs úteis sem vazar segredos;
* Tratamento e rastreamento de falhas (Edge, Stripe webhook, cotas Maps);
* Métricas futuras (erros, latência, uso de cota);
* Facilidade para diagnosticar problemas em staging e produção.

---

## 21. Especialista em Compliance e Privacidade

Avaliar:

* Uso responsável de dados pessoais (LGPD);
* Minimização de dados; controle de acesso (RLS);
* Preferências de e-mail na Conta; retenção e digest;
* Páginas `/terms` e `/privacy`;
* Evitar exposição indevida em logs, share cards e ops.

---

## 22. Especialista em Integrações

Avaliar:

* APIs externas: TMDB/OMDb, Google Books, Spotify/MusicBrainz, Google Places/Routes/Weather, Stripe, Resend;
* Timeouts, falhas, fallbacks (ex.: Spotify → MusicBrainz);
* Proxies Vite/Vercel de mídia (`/spotify-media`, `/caa-media`, `/books-media`);
* Contratos de entrada/saída das Edge Functions;
* Mocks e isolamento em testes;
* Cotas mensais fail-closed no `places-catalog`.

Toda integração deve ser resiliente, clara e fácil de testar.

---

# Comportamento Esperado da IA

Ao trabalhar neste projeto, a IA deve:

1. Ler este arquivo antes de qualquer alteração relevante;
2. **Ler [`ARCHITECTURE.md`](./ARCHITECTURE.md) antes de qualquer mudança** (código, schema, Edge ou documentação de arquitetura/produto) e respeitar as camadas e limites descritos;
3. Consultar o [`README.md`](../README.md) e a skill Orbyva quando o escopo tocar módulos, env ou comportamento documentado;
4. Considerar as recomendações do conselho técnico;
5. **Apresentar um plano e aguardar aprovação** antes de implementar mudanças relevantes;
6. **Refletir no README** qualquer mudança que altere o que o README documenta;
7. **Atualizar [`ARCHITECTURE.md`](./ARCHITECTURE.md)** quando a mudança alterar a arquitetura documentada;
8. Evitar soluções improvisadas ou difíceis de manter;
9. Priorizar código limpo, seguro e testável;
10. Melhorar arquitetura quando encontrar pontos frágeis;
11. Criar ou sugerir testes quando alterar regras importantes;
12. Documentar decisões relevantes (plano, `docs/`, comentários só quando necessários);
13. Explicar pontos de atenção quando houver riscos;
14. Não expor credenciais, tokens ou dados sensíveis;
15. Commitar somente se o usuário pedir; `db push` e deploy de Edge somente com aprovação;
16. Pensar na evolução futura do produto.

---

# Padrão de Resposta Após Alterações

Após implementar uma melhoria, sempre responder com:

## O que foi feito

Explicar objetivamente as alterações realizadas.

## Especialistas considerados

Informar quais membros do conselho técnico influenciaram a alteração.

Exemplo:

* Arquiteto de Software;
* Analista de Segurança;
* QA / Tester;
* Especialista em Integrações.

## Impacto positivo

Explicar o benefício prático da alteração para o projeto.

## Pontos de atenção

Listar riscos, limitações ou melhorias futuras.

## Testes

Informar:

* Quais testes foram criados;
* Quais testes foram alterados;
* Como executar os testes;
* Se não foram criados testes, justificar o motivo.

## README

Informar se o [`README.md`](../README.md) foi atualizado e o que mudou — ou justificar por que a alteração não exigiu atualização.

## Arquitetura

Confirmar que [`ARCHITECTURE.md`](./ARCHITECTURE.md) foi lido antes da mudança; informar se foi atualizado — ou justificar por que não precisou.

---

# Princípios Gerais do Projeto

* Ler [`ARCHITECTURE.md`](./ARCHITECTURE.md) antes de qualquer mudança;
* Plano aprovado antes de implementação relevante;
* README sincronizado com o produto;
* [`ARCHITECTURE.md`](./ARCHITECTURE.md) sincronizado quando a arquitetura mudar;
* Simplicidade antes de complexidade;
* Segurança e RLS desde o início;
* Dados do usuário confiáveis e isolados por tenancy;
* Interface clara, PT-BR e profissional;
* Código limpo e manutenível (`domain/` testável);
* Testes sempre que fizer sentido (`ci:local`);
* Documentação útil e objetiva;
* Arquitetura preparada para evolução multi-módulo;
* Performance e cotas de APIs consideradas desde a concepção;
* Foco em gerar valor real para o usuário do life OS.

---

# Regra Final

Não implemente apenas o que foi pedido de forma isolada.

Sempre analise o impacto da alteração no produto como um todo, considerando arquitetura, segurança, dados, qualidade, testes, usabilidade, performance, documentação (incluindo README) e manutenção futura.

**Sem plano aprovado pelo usuário, não há implementação de mudança relevante.**
