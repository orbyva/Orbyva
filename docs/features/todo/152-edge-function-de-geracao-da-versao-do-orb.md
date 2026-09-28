---
prompt: |-
  Pedido do usuário, verbatim (bullet 5 de uma lista de melhorias de interface):

  - quero quer dê para criar versões do orb com IA, você faz uplaod de imagens, e um prompt. ele cria uma imagem png do orb, e você salva, como o seu

  Fatia desta feature — a geração:

  - Edge Function nova, não um ramo do `orb-agent`: entrada multimodal (imagens + prompt), saída
    binária, sem SSE e sem loop de tools. Entrada, saída e orçamento de tempo são outros, e o
    contrato SSE da feature 098 é consumido por três arquivos do front.
  - A chave do Gemini nunca sai do secret do Supabase: o browser manda imagem e prompt.
  - Registro de tools (`supabase/functions/_shared/orb/registry.ts`) **não** entra. Resposta do
    usuário (P4): a Orb **não** gera a versão dela por conversa nesta rodada — a ordem do array
    `orbTools` é contrato de cache (`docs/stack.md`) e uma tool que grava contraria a regra
    "nenhuma tool grava sozinha".
  - Resposta do usuário (P5): modelo de imagem do Gemini fixado por env (como `ORB_MODEL` em
    `orb-agent:34`), com limite diário por usuário na função — geração de imagem custa por chamada
    e a tela convida a repetir.
  - Resposta do usuário (P6): até 3 imagens de referência por geração, redimensionadas no cliente
    antes de subir — o corpo da requisição é o gargalo da Edge Function, e `orb-agent:43` já trata
    corpo grande como erro de contrato.

  Fora desta feature: a tela (153) e mostrar a versão na esfera (154).
---

# 152 — Edge Function que gera a versão da Orb

## Contexto
Depende de 151 (a tabela `public.orb_avatar`, a RPC e o bucket `orb-avatars` precisam existir: é a
própria função que grava a linha e o arquivo).

É a primeira geração de imagem do projeto. O que já existe é o caminho de chamada: `GEMINI_API_KEY`
como secret e a Edge Function `orb-agent` como molde (`supabase/functions/orb-agent/index.ts:186-215`
— CORS por `corsHeadersForRequest`, JWT obrigatório, client anon + `Authorization` para a RLS ser a
do usuário, chave só no secret).

## Decisões
- Função nova `supabase/functions/orb-avatar/`, nunca um ramo dentro de `orb-agent`.
- Nenhuma tool nova no registro (`supabase/functions/_shared/orb/registry.ts`): a Orb não gera a
  versão dela por conversa nesta rodada. A ordem do array `orbTools` é contrato de cache de
  prefixo (`docs/stack.md`) e uma tool que grava contraria a regra "nenhuma tool grava sozinha".
- **A função grava**: ela sobe o PNG no bucket e insere a linha em `orb_avatar`, devolvendo JSON
  (`{ id, url, prompt, model, created_at, remaining }`). O planning dizia "o browser recebe o PNG",
  mas o teto diário respondido em P5 só existe se toda geração deixar rastro do lado do servidor —
  devolvendo o binário cru, um cliente que simplesmente não gravasse a linha geraria sem limite. O
  que aquela decisão protegia (a chave nunca sai do secret) continua valendo.
- O contador da cota é a própria tabela `orb_avatar`: linhas do usuário criadas no dia dele. Sem
  tabela de uso à parte — apagar uma versão devolve uma geração do dia, e isso é aceitável (é o
  usuário se punindo, e o limite é por custo, não por segurança).
- Teto diário em `ORB_IMAGE_DAILY_LIMIT` (padrão 10); modelo em `ORB_IMAGE_MODEL` (padrão
  `gemini-2.5-flash-image`). Modelo errado ou indisponível vira erro explícito com a mensagem do
  provedor, nunca um 500 mudo.
- A lógica sem I/O mora em módulos **puros** (`request.ts`, `prompt.ts`, `gemini.ts`) — sem
  `Deno.*` e sem import externo — porque são eles que o Vitest roda e que o `tsc -b` do app
  typecheca por tabela (`src/domain/orb/__tests__/messages.test.ts` já importa
  `supabase/functions/orb-agent/messages.ts` assim). Só `index.ts` toca runtime.
- As imagens de referência não são guardadas em lugar nenhum: chegam em base64 no corpo, vão para o
  modelo e morrem com a requisição.
- Nenhum log carrega prompt, referência nem imagem gerada — mesma regra do `orb-agent`. Só
  `requestId`, duração e tamanho em bytes.

## Tarefas
- [ ] Criar `supabase/functions/orb-avatar/request.ts` (puro): `MAX_REFERENCES = 3`,
      `MAX_REFERENCE_BASE64_BYTES` (600 KB), `MAX_TOTAL_BASE64_BYTES` (1,8 MB), `MAX_PROMPT_CHARS`
      (500), `REFERENCE_MIMES = ["image/png","image/jpeg","image/webp"]` e
      `parseGenerateRequest(body): { prompt, references, today, timezone }` — lançando erro com
      mensagem em PT-BR para prompt vazio/comprido, mais de 3 referências, mime fora da lista,
      base64 vazio ou grande demais, `today` fora de `^\d{4}-\d{2}-\d{2}$`.
- [ ] Criar `supabase/functions/orb-avatar/prompt.ts` (puro): `buildOrbImagePrompt(userPrompt)` —
      instrução fixa descrevendo o que a Orb é (esfera, quadrado 1:1, fundo sólido ou transparente,
      sem texto e sem marca d'água, PNG) + o pedido do usuário no fim. Mesma ideia de
      `orb-agent/prompt.ts`: o volátil vai no fim.
- [ ] Criar `supabase/functions/orb-avatar/gemini.ts` (puro): `buildImageRequest({model, prompt,
      references})` devolvendo o objeto de `generateContent` (partes `inlineData` das referências +
      parte de texto, `config.responseModalities: ["IMAGE"]`) e `extractPngBase64(response)`
      devolvendo `{ base64 }` ou um erro tipado para (a) `finishReason` de recusa — reaproveite a
      lista `RECUSAS` de `orb-agent/index.ts:160-168`, inclusive `IMAGE_SAFETY` — e (b) resposta sem
      nenhuma parte de imagem. Tipar contra uma interface mínima local, **sem** importar
      `npm:@google/genai` (o arquivo é typechecado pelo `tsc -b` do app quando o teste o importa).
- [ ] Escrever `src/domain/orb/__tests__/orbAvatarRequest.test.ts`: caminho feliz e uma assertiva
      por recusa de `parseGenerateRequest`; `buildOrbImagePrompt` contendo o texto do usuário e a
      instrução de 1:1/sem texto; `buildImageRequest` montando uma parte por referência na ordem
      recebida; `extractPngBase64` devolvendo o base64 de uma resposta falsa, e erro específico para
      recusa e para resposta sem imagem.
- [ ] Criar `supabase/functions/orb-avatar/index.ts` — esqueleto copiando
      `orb-agent/index.ts:186-215`: `corsHeadersForRequest`, `OPTIONS` → 200, método ≠ POST → 405,
      `GEMINI_API_KEY` ausente → 503 com mensagem em PT-BR, `Authorization` ausente ou `getUser()`
      falhando → 401, corpo acima de `MAX_BODY_BYTES` (2,5 MB) → 413, `parseGenerateRequest`
      lançando → 400 com a mensagem dela.
- [ ] No mesmo `index.ts`: cota diária — conta linhas de `orb_avatar` do usuário com `created_at`
      dentro do dia dele (use `instantFromLocalTime(today, "00:00", timezone)` de
      `supabase/functions/_shared/orb/helpers.ts` para o início e o dia seguinte como fim
      exclusivo); `>= ORB_IMAGE_DAILY_LIMIT` (padrão 10) → 429 com
      `{ error, remaining: 0, limit }` e mensagem dizendo quando volta.
- [ ] No mesmo `index.ts`: chamada real — `new GoogleGenAI({ apiKey })` (mesmo import
      `npm:@google/genai@2.21.0` do `orb-agent`), `ai.models.generateContent(buildImageRequest(...))`
      com `model = Deno.env.get("ORB_IMAGE_MODEL") || "gemini-2.5-flash-image"`, `extractPngBase64`
      no retorno; recusa → 422, sem imagem → 502, erro do provedor → 502 com a mensagem dele.
      Orçamento de tempo próprio (`AbortSignal.timeout`, 60 s) — geração de imagem é mais lenta que
      um turno de texto.
- [ ] No mesmo `index.ts`: persistir — base64 → `Uint8Array`, upload em
      `orb-avatars/{user.id}/{crypto.randomUUID()}.png` (`contentType: "image/png"`,
      `upsert: false`), `getPublicUrl`, insert em `orb_avatar` (`user_id`, `prompt` do usuário,
      `url`, `model`, `is_active: false`) com `.select().single()`, e resposta 200 com
      `{ id, url, prompt, model, created_at, remaining }`. Falha no insert depois do upload: devolve
      erro e deixa o arquivo órfão (mesma escolha documentada em `src/api/tasks/iconAssets.ts:64-67`).
- [ ] Criar `scripts/orb-avatar-smoke.ts` espelhando `scripts/orb-smoke.ts` (lê `GEMINI_API_KEY` do
      `.env` da raiz, sem Deno e sem banco): importa `prompt.ts` e `gemini.ts` da função, manda uma
      imagem de referência pequena embutida no próprio script, faz a chamada real e imprime modelo,
      duração e tamanho do PNG recebido — gravando o arquivo em `/tmp` para inspeção. Registrar
      `"orb:avatar-smoke": "tsx scripts/orb-avatar-smoke.ts"` em `package.json`.
- [ ] Rodar `npm run orb:avatar-smoke` e confirmar que volta um PNG de verdade (é esta a prova do
      contrato com o modelo antes de qualquer deploy). Se o id padrão do modelo não existir na conta,
      ajuste `ORB_IMAGE_MODEL` no `.env`, confirme, e troque o padrão no código para o id que
      funcionou — anotando em `## Notas`.
- [ ] Acrescentar em `docs/stack.md`, na seção "Orb e MCP", um item sobre a função `orb-avatar`:
      para que serve, que ela é a única que grava direto (fora do fluxo de tools), e os secrets
      `ORB_IMAGE_MODEL` / `ORB_IMAGE_DAILY_LIMIT`.
- [ ] Rodar `npm test -- src/domain/orb/__tests__/orbAvatarRequest.test.ts`, `npm run lint`,
      `npm run build` e `npm run check:mcp`.
- [ ] Deploy: `supabase functions deploy orb-avatar` e os secrets — **confirmar com o usuário antes
      de rodar** (mesma régua do `supabase db push`: é ambiente remoto).

## Prompts

## Notas

## Como testar

Este roteiro só faz sentido com a 151 já implementada e aplicada (tabela, RPC e bucket).

1. **Pré-requisitos**
   - Migration da 151 aplicada no banco remoto.
   - `GEMINI_API_KEY` no `.env` da raiz (para o smoke) e como secret do projeto Supabase (para a
     função). `ORB_IMAGE_MODEL` e `ORB_IMAGE_DAILY_LIMIT` opcionais.
   - Função publicada: `supabase functions deploy orb-avatar`.
   - Um JWT do seu usuário: no app logado, no console do navegador,
     `JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith('-auth-token')))).access_token`.

2. **Verificação automatizada**
   - `npm test -- src/domain/orb/__tests__/orbAvatarRequest.test.ts` — validação, prompt, montagem
     do pedido e leitura da resposta, todos passando.
   - `npm run orb:avatar-smoke` — chamada real ao Gemini; passou = imprime o modelo, o tamanho em
     bytes e o caminho do PNG salvo em `/tmp`, e o arquivo abre como imagem.
   - `npm run build` e `npm run check:mcp` — sem erro de tipo (os módulos puros da função entram no
     build do app pelo teste que os importa).

3. **Verificação manual, passo a passo** (a função publicada, via curl)
   1. `curl -i -X POST "$SUPABASE_URL/functions/v1/orb-avatar" -H "Authorization: Bearer $JWT"
      -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"prompt":"uma esfera roxa com
      anel de luz","references":[],"today":"2026-09-24","timezone":"America/Sao_Paulo"}'`
      → **200** com JSON `{ id, url, prompt, model, created_at, remaining }`.
   2. Abra a `url` devolvida no navegador → um PNG quadrado carrega (o bucket é público).
   3. `select * from public.orb_avatar order by created_at desc limit 1;` → a linha existe, com
      `is_active = false`, o `prompt` que você mandou e o `model` usado.
   4. Repita o passo 1 com uma referência: `references: [{ "mime": "image/png", "data": "<base64 de
      uma imagem pequena>" }]` → 200, e o PNG resultante parece com a referência.
   5. `remaining` cai de 1 a cada chamada bem-sucedida.

4. **Casos de borda e caminhos negativos**
   - Sem `Authorization` → **401**, e nenhuma linha nova na tabela.
   - `GET` em vez de `POST` → **405**.
   - `prompt: ""` → **400** com mensagem em PT-BR dizendo que falta o pedido.
   - 4 referências → **400** dizendo que o máximo é 3; nenhuma chamada ao Gemini é feita
     (a validação é anterior).
   - Referência `image/gif` ou base64 acima de 600 KB → **400**, sem chamada ao modelo.
   - Corpo acima de 2,5 MB → **413**.
   - Chamar mais vezes que `ORB_IMAGE_DAILY_LIMIT` (baixe o secret para 1 para testar em uma
     chamada) → **429** com `remaining: 0` e nenhuma linha nova.
   - `ORB_IMAGE_MODEL` com um id inexistente → **502** com a mensagem do provedor no corpo, não
     um 500 mudo.
   - Chamar com o JWT de outro usuário → a linha nasce na conta **dele**; a sua lista não muda.

5. **Sinais de que quebrou**
   - 200 com `url` mas o link abre 404 → o upload foi para o bucket errado ou o caminho não começa
     pelo `user.id` (a policy de storage recusaria o insert, então o erro apareceria antes).
   - Resposta demorando e caindo em 504 do gateway → orçamento de tempo não aplicado ou modelo
     lento demais para o padrão.
   - `remaining` sempre igual ao limite → a contagem do dia está usando UTC em vez do fuso recebido.
   - Log da função mostrando o prompt ou o base64 → a regra de "nenhum log carrega input" foi
     violada; é dado pessoal.
   - `npm run build` quebrando com `Cannot find name 'Deno'` → alguma coisa de runtime vazou para um
     dos módulos puros.
