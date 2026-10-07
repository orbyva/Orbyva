import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { ORB_CAPABILITY_CONSULT_COUNT } from "../capabilities";
import { orbToolLabel } from "../toolLabel";
import { ORB_APP_ONLY_CATALOG, ORB_CONSULT_AREAS, ORB_CONSULT_COUNT } from "../toolCatalog";

type Tool = { name: string; title?: string };

/*
 * Import dinâmico com caminho em variável: o Vitest carrega o registro de verdade, e o `tsc` do
 * mobile não segue para dentro do código Deno (que importa com extensão `.ts`).
 */
const ORB = path.resolve(__dirname, "../../../../../supabase/functions/_shared/orb");
const carregar = (arquivo: string) =>
  import(/* @vite-ignore */ pathToFileURL(path.join(ORB, arquivo)).href);

const { orbTools, ORB_APP_ONLY_TOOLS } = (await carregar("registry.ts")) as {
  orbTools: Tool[];
  ORB_APP_ONLY_TOOLS: readonly string[];
};

/** As mesmas áreas, na mesma ordem, do painel da web. */
const AREAS_DO_SERVIDOR: [string, string, string][] = [
  ["Finanças", "tools/finance.ts", "financeTools"],
  ["Tarefas e projetos", "tools/productivity.ts", "productivityTools"],
  ["Rotina e conteúdo", "tools/life.ts", "lifeTools"],
  ["Viagens", "tools/travel.ts", "travelTools"],
  ["Compras", "tools/shopping.ts", "shoppingTools"],
  ["Saúde", "tools/health.ts", "healthTools"],
  ["Notas", "tools/notes.ts", "notesTools"],
  ["Próximos compromissos", "tools/timeline.ts", "timelineTools"],
  ["Lugares", "tools/places.ts", "placesTools"],
  ["Veículos", "tools/vehicles.ts", "vehiclesTools"],
  ["Consulta livre", "tools/data.ts", "dataTools"],
];

const resumo = (tools: Tool[]) => tools.map((t) => ({ name: t.name, title: t.title }));
const porNome = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

describe("catálogo de tools do mobile", () => {
  it("espelha as áreas de consulta do registro, tool por tool", async () => {
    const doServidor = await Promise.all(
      AREAS_DO_SERVIDOR.map(async ([nome, arquivo, exportado]) => ({
        nome,
        tools: resumo((await carregar(arquivo))[exportado] as Tool[]),
      }))
    );
    expect(ORB_CONSULT_AREAS.map((a) => ({ nome: a.nome, tools: resumo(a.tools) }))).toEqual(
      doServidor
    );
  });

  it("conta as mesmas consultas que o selo da web", () => {
    const daWeb = orbTools.filter((t) => !ORB_APP_ONLY_TOOLS.includes(t.name)).length;
    expect(ORB_CONSULT_COUNT).toBe(daWeb);
    expect(ORB_CAPABILITY_CONSULT_COUNT).toBe(daWeb);
  });

  it("cobre as tools só do app com o título do servidor", () => {
    const doServidor = orbTools.filter((t) => ORB_APP_ONLY_TOOLS.includes(t.name));
    expect(resumo(ORB_APP_ONLY_CATALOG).sort(porNome)).toEqual(resumo(doServidor).sort(porNome));
  });

  it("dá a toda tool do registro o rótulo declarado no servidor", () => {
    for (const tool of orbTools) {
      expect(orbToolLabel(tool.name)).toBe(tool.title);
    }
  });
});
