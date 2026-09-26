# Orb no mobile + favicon transparente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a Orb no Expo como tela cheia `/orb` (stream SSE + confirmação de criação) e favicon/mark PNG com fundo transparente.

**Architecture:** Cliente nativo fino em `mobile/`: parser SSE puro, `streamOrbTurn` via `fetch`, `useOrbChat` + `OrbProvider` no root do `(app)`, UI RN própria. `open_screen` não navega (aviso no balão). `executeOrbProposal` chama só `mobile/src/api/*`. Favicon regenerado com alpha a partir do mark Orbyva.

**Tech Stack:** Expo Router 57, React Native, Supabase Edge `orb-agent`, Vitest (novo no `mobile/`), ImageMagick para assets.

**Spec:** `docs/superpowers/specs/2026-09-25-orb-mobile-design.md`

## Global Constraints

- Escopo A: sem dock, sem FAB da Orb, sem tray global, sem mapa `open_screen` → rotas nativas.
- Sem migration; sem deploy da Edge só por esta feature (CORS mobile já existe).
- Sem pacote compartilhado web↔mobile; copiar/adaptar TS puro, não importar componentes web.
- Chrome/browser automation proibido na verificação — prova por Vitest + `tsc`.
- Commits só quando o usuário pedir na sessão de execução (passos de commit ficam no plano como checkpoints opcionais).
- Idioma da UI: pt-BR, tom do web (“Resposta interrompida.”, “Tarefa criada.”, etc.).

## Review Focus

- Chunk SSE cortado no meio de um `data:` — parser não pode emitir JSON quebrado nem perder o evento.
- `AbortController` mid-stream — bolha vira `interrupted`, tools `running` fecham em `error`, não ficam girando.
- `propose_create` com `kind` sem API mobile — cartão mostra erro explícito, zero insert.
- `open_screen` com summary válido — não chama `router`; aviso visível no tool card.
- Favicon PNG com corners alpha 0 — mark central ainda legível (não apagar o azul near-white do glow).

## File structure

| Path | Responsibility |
|------|----------------|
| `public/logo-mark.png` (+ `.webp` opcional) | Mark quadrado com alpha |
| `index.html` | `rel="icon"` → PNG transparente |
| `mobile/assets/images/favicon.png` | Favicon Expo web |
| `mobile/src/types/orb.ts` | Contratos de mensagem/stream |
| `mobile/src/domain/orb/stream.ts` | `createOrbStreamParser` |
| `mobile/src/domain/orb/toolLabel.ts` | Rótulo PT da tool (mapa mínimo + fallback nome) |
| `mobile/src/domain/orb/chatReduce.ts` | Funções puras: aplicar tool start/done, encerrar running |
| `mobile/src/api/orb.ts` | `streamOrbTurn` |
| `mobile/src/api/orbActions.ts` | `executeOrbProposal` |
| `mobile/src/hooks/useOrbChat.ts` | Estado da conversa + turnos |
| `mobile/src/hooks/useOrb.tsx` | Provider + propostas |
| `mobile/src/components/orb/*` | Chat, bolha, tool, action card, composer |
| `mobile/src/app/(app)/orb.tsx` | Rota |
| `mobile/src/lib/nav.ts` | Item Orb + esconder quick-add em `/orb` |
| `mobile/src/app/(app)/_layout.tsx` | Stack screen + `OrbProvider` |
| `mobile/vitest.config.ts` + `package.json` | Testes unitários |
| `docs/features/todo/108-orb-no-mobile.md` | Feature da esteira (ou número livre seguinte) |

---

### Task 1: Favicon / mark transparente

**Files:**
- Modify: `public/logo-mark.png`, `public/logo-mark.webp` (regenerar)
- Modify: `index.html` (linha do `rel="icon"`)
- Modify: `mobile/assets/images/favicon.png`
- Create: `scripts/assert-logo-mark-alpha.mjs`
- Test: o script (rodar via `node`)

**Interfaces:**
- Consumes: `public/logo-mark.png` atual (RGB branco)
- Produces: PNG/WebP com alpha; `index.html` apontando para `/logo-mark.png`

- [ ] **Step 1: Gerar PNG com fundo removido**

Rodar no repo (ImageMagick já disponível como `magick`):

```bash
# Cópia de segurança local não versionada se quiser; depois regenera:
magick public/logo-mark.png -alpha set -channel RGBA \
  -fuzz 8% -fill none -opaque 'rgb(255,255,255)' \
  -strip public/logo-mark.png
magick public/logo-mark.png -quality 90 public/logo-mark.webp
magick public/logo-mark.png -resize 48x48 mobile/assets/images/favicon.png
```

Se o fuzz comer o glow azul claro, baixar para `4%` ou usar `-transparent white` só em pixels quase brancos (`rgb(250-255,*)`).

- [ ] **Step 2: Script de assert**

```js
// scripts/assert-logo-mark-alpha.mjs
import { execFileSync } from "node:child_process";

function corner(path, expr) {
  return execFileSync(
    "magick",
    [path, "-format", `%[pixel:${expr}]`, "info:"],
    { encoding: "utf8" }
  ).trim();
}

const path = "public/logo-mark.png";
for (const expr of ["p{0,0}", "p{%[fx:w-1],0}", "p{0,%[fx:h-1]}", "p{%[fx:w-1],%[fx:h-1]}"]) {
  const px = corner(path, expr);
  if (!/,?\s*0\)$/.test(px) && !/none/i.test(px) && !/,0\b/.test(px)) {
    // ImageMagick imprime srgba(r,g,b,0) ou similar
    if (!px.includes(",0)") && !px.endsWith(",0")) {
      console.error(`Corner not transparent: ${expr} => ${px}`);
      process.exit(1);
    }
  }
}
const center = corner(path, "p{%[fx:int(w/2)],%[fx:int(h/2)]}");
if (/,\s*0\)$/.test(center) || center.includes("none")) {
  console.error(`Center unexpectedly empty: ${center}`);
  process.exit(1);
}
console.log("logo-mark alpha ok");
```

Ajustar o parse do alpha conforme a string real do `magick` na máquina (`identify -format` se precisar).

- [ ] **Step 3: Rodar assert — deve passar**

```bash
node scripts/assert-logo-mark-alpha.mjs
```

Expected: `logo-mark alpha ok`

- [ ] **Step 4: Atualizar `index.html`**

Trocar:

```html
<link rel="icon" type="image/webp" href="/logo-mark.webp" />
```

por:

```html
<link rel="icon" type="image/png" href="/logo-mark.png" />
```

- [ ] **Step 5: Checkpoint (commit se o usuário pedir)**

```bash
git add public/logo-mark.png public/logo-mark.webp mobile/assets/images/favicon.png index.html scripts/assert-logo-mark-alpha.mjs
# git commit só se pedido
```

---

### Task 2: Vitest no mobile + parser SSE

**Files:**
- Create: `mobile/vitest.config.ts`
- Modify: `mobile/package.json` (devDeps + script `test`)
- Create: `mobile/src/domain/orb/stream.ts`
- Create: `mobile/src/domain/orb/__tests__/stream.test.ts`

**Interfaces:**
- Consumes: nenhum
- Produces: `createOrbStreamParser(): { push(chunk: string): OrbStreamEvent[]; flush(): OrbStreamEvent[] }`

- [ ] **Step 1: Config Vitest**

`mobile/vitest.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

Em `mobile/package.json` scripts:

```json
"test": "vitest run"
```

devDependencies: `vitest` (versão alinhada à raiz se possível).

- [ ] **Step 2: Teste falhando do parser**

```ts
// mobile/src/domain/orb/__tests__/stream.test.ts
import { describe, expect, it } from "vitest";
import { createOrbStreamParser } from "@/domain/orb/stream";

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

describe("createOrbStreamParser", () => {
  it("entrega eventos de um chunk único", () => {
    const parser = createOrbStreamParser();
    expect(
      parser.push(
        sse({ type: "tool", name: "query_tasks", phase: "start" }) +
          sse({ type: "text", text: "Oi" })
      )
    ).toEqual([
      { type: "tool", name: "query_tasks", phase: "start" },
      { type: "text", text: "Oi" },
    ]);
  });

  it("segura evento partido até o próximo chunk", () => {
    const parser = createOrbStreamParser();
    const raw = sse({ type: "text", text: "orçamento" });
    const cut = Math.floor(raw.length / 2);
    expect(parser.push(raw.slice(0, cut))).toEqual([]);
    expect(parser.push(raw.slice(cut))).toEqual([{ type: "text", text: "orçamento" }]);
  });

  it("flush entrega último evento sem linha em branco final", () => {
    const parser = createOrbStreamParser();
    expect(parser.push(`data: ${JSON.stringify({ type: "done" })}`)).toEqual([]);
    expect(parser.flush()).toEqual([{ type: "done" }]);
    expect(parser.flush()).toEqual([]);
  });

  it("ignora keep-alive, JSON quebrado e tipo desconhecido", () => {
    const parser = createOrbStreamParser();
    expect(
      parser.push(
        "\n\n: ping\n\ndata: {x}\n\n" +
          sse({ type: "proposal", id: "1" }) +
          sse({ type: "text", text: "ok" })
      )
    ).toEqual([{ type: "text", text: "ok" }]);
  });
});
```

- [ ] **Step 3: Rodar — deve falhar (módulo ausente)**

```bash
cd mobile && npm install -D vitest && npm test -- src/domain/orb/__tests__/stream.test.ts
```

Expected: FAIL cannot find module / createOrbStreamParser

- [ ] **Step 4: Implementar parser**

Copiar a lógica de `src/domain/orb/stream.ts` (`createOrbStreamParser` + `toEvent`) para `mobile/src/domain/orb/stream.ts`. Importar `OrbStreamEvent` de `@/types/orb` — criar stub mínimo de tipos nesta task se ainda não existir (só o union do stream):

```ts
// mobile/src/types/orb.ts (mínimo para o parser)
export type OrbStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool"; id?: string; name: string; phase: "start"; input?: Record<string, unknown> }
  | {
      type: "tool";
      id?: string;
      name: string;
      phase: "done";
      ok?: boolean;
      summary?: unknown;
      duration_ms?: number;
    }
  | { type: "done"; usage?: unknown }
  | { type: "error"; message: string };
```

Expandir tipos na Task 3.

- [ ] **Step 5: Rodar testes — PASS**

```bash
cd mobile && npm test -- src/domain/orb/__tests__/stream.test.ts
```

---

### Task 3: Tipos completos + `streamOrbTurn`

**Files:**
- Modify: `mobile/src/types/orb.ts` (completar como web)
- Create: `mobile/src/api/orb.ts`
- Create: `mobile/src/api/__tests__/orb.stream-fallback.test.ts` (mock de Response sem body stream opcional — ou teste do helper de leitura)

**Interfaces:**
- Consumes: `createOrbStreamParser`, `supabase` session, `supabaseUrl` / `supabaseAnonKey`
- Produces:

```ts
export async function streamOrbTurn(opts: {
  messages: { role: "user" | "assistant"; content: string }[];
  today: string;
  timezone: string;
  onEvent: (e: OrbStreamEvent) => void;
  signal?: AbortSignal;
}): Promise<void>;
```

- [ ] **Step 1: Completar `mobile/src/types/orb.ts`**

Espelhar `src/types/orb.ts` (OrbMessage, OrbToolCall, isOrbUsage, OrbTurnRequest). Copiar verbatim.

- [ ] **Step 2: Implementar `streamOrbTurn`**

```ts
// mobile/src/api/orb.ts
import { createOrbStreamParser } from "@/domain/orb/stream";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import type { OrbStreamEvent, OrbTurnRequest } from "@/types/orb";

const FUNCTIONS_BASE = `${supabaseUrl}/functions/v1`;

export async function streamOrbTurn({
  messages,
  today,
  timezone,
  onEvent,
  signal,
}: OrbTurnRequest & {
  onEvent: (event: OrbStreamEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sessão expirada. Entre de novo para falar com a Orb.");

  const response = await fetch(`${FUNCTIONS_BASE}/orb-agent`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      "x-orbyva-client": "mobile",
    },
    body: JSON.stringify({ messages, today, timezone }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(
      (detail as { error?: string } | null)?.error ??
        "A Orb não respondeu agora. Tente de novo em instantes."
    );
  }

  const parser = createOrbStreamParser();
  const body = response.body;
  if (body && typeof (body as ReadableStream).getReader === "function") {
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        onEvent(event);
      }
    }
  } else {
    // Fallback Expo: sem stream incremental
    const text = await response.text();
    for (const event of parser.push(text)) onEvent(event);
  }
  for (const event of parser.flush()) onEvent(event);
}
```

- [ ] **Step 3: `tsc --noEmit` no mobile**

```bash
cd mobile && npx tsc --noEmit
```

Expected: PASS (sem erros novos nos arquivos Orb)

---

### Task 4: Redutor puro + `useOrbChat` (navegação = aviso)

**Files:**
- Create: `mobile/src/domain/orb/chatReduce.ts`
- Create: `mobile/src/domain/orb/__tests__/chatReduce.test.ts`
- Create: `mobile/src/hooks/useOrbChat.ts`
- Create: `mobile/src/domain/orb/toolLabel.ts`

**Interfaces:**
- Consumes: tipos Orb, `streamOrbTurn`
- Produces: `useOrbChat()` → `{ messages, isStreaming, send, stop, reset, retry, ... }`  
  `onNavigate` **não** é usado na v1; tool `open_screen` anexa aviso no `summary`/conteúdo via redutor.

Constante: `ORB_NAVIGATION_TOOL_NAME` — importar de `../../../supabase/functions/_shared/orb/navigation.ts` (path relativo do mobile) **ou** duplicar a string `"open_screen"` se Metro reclamar do path fora de `mobile/`. Preferir string compartilhada:

```ts
export const ORB_NAVIGATION_TOOL_NAME = "open_screen";
export const NAV_UNAVAILABLE_HINT = "Abrir tela ainda não disponível no app.";
```

- [ ] **Step 1: Testes do redutor**

```ts
import { describe, expect, it } from "vitest";
import {
  applyToolStart,
  applyToolDone,
  closeRunningTools,
  NAV_UNAVAILABLE_HINT,
} from "@/domain/orb/chatReduce";
import type { OrbMessage } from "@/types/orb";

const base: OrbMessage = {
  id: "a1",
  role: "assistant",
  content: "",
  tools: [],
  pending: true,
};

describe("chatReduce", () => {
  it("abre tool por id", () => {
    const next = applyToolStart(base, {
      type: "tool",
      phase: "start",
      id: "t1",
      name: "query_tasks",
    });
    expect(next.tools).toEqual([
      { id: "t1", name: "query_tasks", status: "running" },
    ]);
  });

  it("fecha tool e anota navegação indisponível", () => {
    const open = applyToolStart(base, {
      type: "tool",
      phase: "start",
      id: "n1",
      name: "open_screen",
    });
    const done = applyToolDone(open, {
      type: "tool",
      phase: "done",
      id: "n1",
      name: "open_screen",
      ok: true,
      summary: { path: "/tasks", title: "Tarefas" },
    });
    expect(done.tools?.[0]?.status).toBe("ok");
    expect(String(done.tools?.[0]?.summary)).toContain(NAV_UNAVAILABLE_HINT);
  });

  it("encerrar running em error", () => {
    const open = applyToolStart(base, {
      type: "tool",
      phase: "start",
      id: "t1",
      name: "query_tasks",
    });
    expect(closeRunningTools(open).tools?.[0]?.status).toBe("error");
  });
});
```

- [ ] **Step 2: Rodar — FAIL**

```bash
cd mobile && npm test -- src/domain/orb/__tests__/chatReduce.test.ts
```

- [ ] **Step 3: Implementar `chatReduce.ts` + `useOrbChat.ts`**

Portar de `src/hooks/useOrbChat.ts`, trocando:
- `window.setTimeout` / `clearTimeout` → `setTimeout` / `clearTimeout` globais
- **Não** agendar `onNavigate` para `open_screen`; em `applyToolDone`, se `name === "open_screen"`, substituir summary por objeto/string com `NAV_UNAVAILABLE_HINT`
- Datas: `new Date().toISOString().slice(0, 10)` ou helper local se não houver `formatLocalIsoDate` no mobile

- [ ] **Step 4: Testes PASS**

```bash
cd mobile && npm test -- src/domain/orb/__tests__/chatReduce.test.ts
```

---

### Task 5: `executeOrbProposal` mobile

**Files:**
- Create: `mobile/src/api/orbActions.ts`
- Create: `mobile/src/api/__tests__/orbActions.test.ts`

**Interfaces:**
- Consumes: `sanitizeOrbProposalPayload`, `OrbProposal` de `supabase/functions/_shared/orb/actions.ts` (path relativo `../../../supabase/functions/_shared/orb/actions.ts` a partir de `mobile/src/api/`); APIs mobile (`createTaskApi`, etc.)
- Produces: `executeOrbProposal(proposal: OrbProposal): Promise<{ message: string; link?: string }>`

- [ ] **Step 1: Teste — task mock + kind sem suporte**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/tasks/tasks", () => ({
  createTaskApi: vi.fn(async () => ({ id: "task-1" })),
}));

import { createTaskApi } from "@/api/tasks/tasks";
import { executeOrbProposal } from "@/api/orbActions";

describe("executeOrbProposal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria tarefa via API mobile", async () => {
    const out = await executeOrbProposal({
      kind: "task",
      label: "Nova tarefa",
      fields: [{ label: "Título", value: "Comprar pão" }],
      payload: { title: "Comprar pão", due_date: null },
    });
    expect(createTaskApi).toHaveBeenCalled();
    expect(out.message).toBe("Tarefa criada.");
  });

  it("recusa kind sem API com erro claro", async () => {
    await expect(
      executeOrbProposal({
        kind: "trip_day_plan",
        label: "Plano",
        fields: [],
        payload: {},
      })
    ).rejects.toThrow(/só no web/i);
  });
});
```

Ajustar `kind` do segundo teste para um que a implementação **explicitamente** não suporte, se `trip_day_plan` for portado. Preferir um kind inventado inválido só se `sanitize` deixar passar — melhor: exportar `unsupportedOrbCreateKind` path forçando `default` no switch com kind válido não implementado na v1 parcial.

Na v1 completa do plano: implementar **todos** os kinds que têm API mobile (espelhar switch do web com imports mobile). Kinds sem equivalente → `throw new Error("Esse tipo de criação ainda só funciona no web.")`.

- [ ] **Step 2: FAIL → implementar → PASS**

Portar `src/api/orbActions.ts` trocando imports para `@/api/...` mobile. Assinaturas diferem (`createTaskApi` vs `createTask`): adaptar campos (ex.: `due_date` obrigatório tipado como `string | null`).

Se Metro/Vitest não resolver o path `supabase/functions/...`, copiar só `sanitizeOrbProposalPayload` + tipos usados para `mobile/src/domain/orb/actionsSanitize.ts` (último recurso).

- [ ] **Step 3: `cd mobile && npm test`**

---

### Task 6: `OrbProvider` + wiring do layout

**Files:**
- Create: `mobile/src/hooks/useOrb.tsx`
- Modify: `mobile/src/app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `useOrbChat`, `executeOrbProposal` (via ActionCard depois)
- Produces: `OrbProvider`, `useOrbContext()`, `proposalStates`, `setProposalState`, `pendingProposals`

Espelhar `src/hooks/useOrb.tsx` **sem** dock/localStorage de dock; sem `useNavigate`. `onNavigate` omitido.

```tsx
// trecho _layout
import { OrbProvider } from "@/hooks/useOrb";

return (
  <AppShellProvider>
    <ActiveTimerProvider>
      <OrbProvider>
        <AppStack />
      </OrbProvider>
    </ActiveTimerProvider>
  </AppShellProvider>
);
```

- [ ] **Step 1: Implementar provider**
- [ ] **Step 2: `tsc --noEmit`**

---

### Task 7: UI nativa do chat

**Files:**
- Create: `mobile/src/components/orb/OrbComposer.tsx`
- Create: `mobile/src/components/orb/OrbToolCall.tsx`
- Create: `mobile/src/components/orb/OrbActionCard.tsx`
- Create: `mobile/src/components/orb/OrbMessageBubble.tsx`
- Create: `mobile/src/components/orb/OrbChat.tsx`
- Create: `mobile/src/app/(app)/orb.tsx`

**Interfaces:**
- Consumes: `useOrbContext`, `isOrbProposal` / `ORB_CREATE_TOOL_NAME` do shared actions, `orbToolLabel`, `MarkdownPreview` se já existir
- Produces: tela usável

Sugestões: importar `ORB_SUGESTOES_DE_CHAT` de `supabase/functions/_shared/orb/suggestions.ts` ou hardcodar 4–5 strings iguais ao shared.

Layout `orb.tsx`:

```tsx
import { OrbChat } from "@/components/orb/OrbChat";
import { ThemedView } from "@/components/themed-view";
import { StyleSheet } from "react-native";

export default function OrbScreen() {
  return (
    <ThemedView style={styles.fill}>
      <OrbChat />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
```

`OrbActionCard`: Criar chama `executeOrbProposal` + `setProposalState`; Descartar marca done descartado / remove pending. Links `href` mobile (`/tasks?...`) via `expo-router` `Link`/`router.push` quando `link` existir.

- [ ] **Step 1: Implementar componentes (estilo tokens `useTheme`)**
- [ ] **Step 2: `tsc --noEmit`**
- [ ] **Step 3: Teste mínimo ActionCard/helpers se extrair botão de confirm (opcional se tempo curto — não pular redutor/propostas)**

---

### Task 8: Nav, Stack, esconder FAB

**Files:**
- Modify: `mobile/src/lib/nav.ts` — `AppHref` + `"/orb"`; item Início; `quickAddActionsForPath` retorna `[]` em `/orb`
- Modify: `mobile/src/app/(app)/_layout.tsx` — `<Stack.Screen name="orb" options={{ title: "Orb" }} />`
- Modify: `mobile/src/components/chrome/AppSidebar.tsx` — abrir grupo Início se path `/orb`

- [ ] **Step 1: Tipos e NAV_GROUPS**

```ts
| "/orb"
// ...
items: [
  { title: "Dashboard", href: "/home" },
  { title: "Orb", href: "/orb" },
],
```

```ts
if (path === "/orb" || path.startsWith("/orb/")) return [];
```

em `quickAddActionsForPath`.

- [ ] **Step 2: Teste unitário nav (se já houver helpers testáveis) ou assert manual via vitest:**

```ts
import { quickAddActionsForPath } from "@/lib/nav";
import { describe, expect, it } from "vitest";

it("esconde quick add na Orb", () => {
  expect(quickAddActionsForPath("/orb")).toEqual([]);
});
```

Arquivo: `mobile/src/lib/__tests__/nav.orb.test.ts`

- [ ] **Step 3: PASS + tsc**

---

### Task 9: Feature doc na esteira

**Files:**
- Create: `docs/features/todo/108-orb-no-mobile.md` (usar próximo NNN livre se 108 ocupado — conferir `docs/features/**`)

Frontmatter `prompt:` verbatim do pedido do usuário (Orb no mobile + favicon PNG). Seções: Contexto, Decisões (apontar spec), Tarefas espelhando este plano, Prompts, Como testar.

- [ ] **Step 1: Checar número livre**

```bash
ls docs/features/**/*.md | rg -o '[0-9]{3}' | sort -u | tail
```

- [ ] **Step 2: Escrever feature apontando spec + plan**
- [ ] **Step 3: Suíte final**

```bash
cd mobile && npm test && npx tsc --noEmit
node scripts/assert-logo-mark-alpha.mjs
```

Expected: tudo verde.

---

## Self-review (autor do plano)

1. **Spec coverage:** tela `/orb`, provider, stream, criação, open_screen no-op, FAB hidden, favicon alpha, testes — tasks 1–9. Fatia 2 explícita fora.
2. **Placeholders:** nenhum TBD.
3. **Types:** `streamOrbTurn`, `executeOrbProposal`, `OrbMessage` alinhados web/mobile.
4. **Review Focus:** chunk partido → Task 2; abort → Task 4 useOrbChat; kind sem API → Task 5; open_screen → Task 4; favicon alpha → Task 1.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-25-orb-mobile.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** — fresh subagent per task + reviewer; thorough, more tokens.
- **Native** — I implement every task in this session, then one end review.

**For this plan I recommend Native**, because the tasks share types/hooks tightly (parser → chat → UI → nav) and you asked to move fast (“arrocha”). Does the plan capture what you want, and which approach should we use?
