import { orbCatalogTitle } from "./toolCatalog";

/** Rótulo do cartão de tool: o `title` declarado no servidor. Fallback: nome humanizado. */

function humanize(name: string): string {
  return name
    .replace(/^query_/, "")
    .replace(/^propose_/, "")
    .replace(/_/g, " ")
    .trim();
}

export function orbToolLabel(name: string): string {
  return orbCatalogTitle(name) ?? humanize(name);
}
