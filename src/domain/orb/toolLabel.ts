/**
 * Rótulo humano de uma tool, para o "Consultando…" e para o cartão de consulta.
 *
 * Mora sozinho, e não em `stream.ts`, POR CAUSA DO BUNDLE: `orbToolTitle` vem de `registry.ts`, que
 * arrasta as 36 tools (SQL, nomes de coluna, descrições) para dentro do chunk de quem o importa. O
 * `stream.ts` está no caminho carregado em TODA página do app — o parser de SSE entra pelo
 * `useOrbChat`, que a barra lateral monta —, então o rótulo ali custava ~49 KB gzip de código que o
 * browser nunca executa, em toda visita (medido no `dist`: o chunk compartilhado subiu de 0 para
 * 158 KB crus). Aqui ele é importado só pelo cartão de ferramenta e pelo painel de capacidades, que
 * vivem no chunk da `/orb`.
 *
 * Deriva do `title` declarado na própria tool em vez de um mapa escrito à mão: o mapa paralelo já
 * tinha ficado para trás em 12 das tools e mostrava `query_tags` cru na tela. Tool nova entra no
 * registro e aparece aqui sozinha; sem `title`, ou com nome desconhecido, cai no nome cru — que é o
 * comportamento que a UI já espera.
 */

import { orbToolTitle } from "../../../supabase/functions/_shared/orb/registry.ts";

export function orbToolLabel(name: string): string {
  return orbToolTitle(name);
}
