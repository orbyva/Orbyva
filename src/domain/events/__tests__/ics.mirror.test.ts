import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `supabase/functions/_shared/ics.ts` e `_shared/inviteEmail.ts` são espelhos manuais de
 * `src/domain/events/*` — a Edge Function em Deno não importa o front (mesmo arranjo de
 * `mapsQuotaRules.ts`). Espelho manual sem guarda é bug esperando acontecer: os testes rodam só do
 * lado do front, então uma correção feita lá e esquecida aqui só apareceria num e-mail que o Google
 * recusa, ou num convite revogado que ainda dispara e-mail.
 *
 * A comparação ignora o cabeçalho de cada arquivo (o comentário de bloco inicial) e exige que o
 * resto seja idêntico, caractere a caractere.
 */

const raiz = resolve(__dirname, "../../../..");

const espelhos = [
  {
    front: "src/domain/events/ics.ts",
    edge: "supabase/functions/_shared/ics.ts",
    marcador: "export type BuildEventIcsInput",
  },
  {
    front: "src/domain/events/inviteEmail.ts",
    edge: "supabase/functions/_shared/inviteEmail.ts",
    marcador: "export type InviteEmailGuardInput",
  },
];

function corpo(caminho: string, marcador: string): string {
  const conteudo = readFileSync(resolve(raiz, caminho), "utf8");
  const inicio = conteudo.indexOf(marcador);
  expect(inicio, `${caminho} deveria conter "${marcador}"`).toBeGreaterThan(-1);
  return conteudo.slice(inicio);
}

describe("espelhos front ↔ Edge não podem divergir", () => {
  for (const { front, edge, marcador } of espelhos) {
    it(`${edge} é idêntico a ${front}`, () => {
      expect(corpo(edge, marcador)).toBe(corpo(front, marcador));
    });

    it(`${edge} declara de onde veio, para quem for editar saber que há dois`, () => {
      const conteudo = readFileSync(resolve(raiz, edge), "utf8");
      expect(conteudo).toContain(`espelho de ${front}`);
    });
  }

  it("a Edge Function do convite consome os espelhos, não uma cópia solta", () => {
    const conteudo = readFileSync(
      resolve(raiz, "supabase/functions/event-invite-email/index.ts"),
      "utf8"
    );
    expect(conteudo).toContain('from "../_shared/inviteEmail.ts"');
    expect(conteudo).toContain("buildInviteEmailPayload");
    expect(conteudo).toContain("shouldSendInviteEmail");
  });
});
