import { useEffect, useMemo, useState } from "react";
import { fetchTaskRefSummaries } from "@/api/tasks/taskRefs";
import type { TaskRefSummary } from "@/types/tasks";

/**
 * Índice id → tarefa das referências `[Rótulo](orbyva-task:<id>)` citadas num texto (feature 105).
 *
 * **A resolução é em lote, e é o ponto do hook.** Uma lista de tarefas monta um snippet por card, e
 * um card pode citar várias tarefas; resolver por ocorrência seria uma consulta por chip na tela.
 * Aqui os ids pedidos no mesmo tick entram numa fila e saem numa consulta só — o mesmo problema que
 * `useNotesTitleIndex` e `useLinkIconRules` resolvem com cache no módulo, com a diferença de que
 * aqui não dá para carregar "tudo": o conjunto é o que o texto cita.
 *
 * Id que a consulta não devolve fica **fora do mapa**, e é assim que o chip sabe que a tarefa foi
 * apagada (o texto de quem escreveu não é tocado — decisão da 105).
 *
 * Falha de rede **não** é marcada como resolvida: o id continua pendente e uma próxima montagem
 * tenta de novo. O contrário (cachear o vazio, como `useLinkIconRules` faz) transformaria uma queda
 * momentânea em "referência removida" permanente na tela, que é mentir sobre o dado.
 */

/** O que já voltou do banco, por id em minúsculas — uuid é hexadecimal, a caixa não distingue. */
const cache = new Map<string, TaskRefSummary>();
/** Ids já perguntados **com resposta** (achados ou não). Evita repetir a consulta do que não existe. */
const answered = new Set<string>();

let queue = new Set<string>();
let flushing: Promise<void> | null = null;

function flushQueue(): Promise<void> {
  if (flushing) return flushing;
  // Microtask: todos os hooks que montaram no mesmo commit já registraram os ids deles quando esta
  // função roda, então o que sai é **uma** consulta com o conjunto inteiro.
  flushing = Promise.resolve().then(async () => {
    const batch = [...queue];
    queue = new Set();
    flushing = null;
    if (batch.length === 0) return;
    try {
      const rows = await fetchTaskRefSummaries(batch);
      for (const row of rows) cache.set(row.id.toLowerCase(), row);
      for (const id of batch) answered.add(id);
    } catch (error) {
      console.error("Não foi possível resolver as referências de tarefa do texto.", error);
    }
  });
  return flushing;
}

function request(ids: readonly string[]): Promise<void> {
  const missing = ids
    .map((id) => id.toLowerCase())
    .filter((id) => !answered.has(id) && !cache.has(id));
  if (missing.length === 0) return Promise.resolve();
  for (const id of missing) queue.add(id);
  return flushQueue();
}

/** Descarta o que já foi resolvido — os testes precisam, senão o mock de uma suíte vaza pra outra. */
export function invalidateTaskRefIndex(): void {
  cache.clear();
  answered.clear();
  queue = new Set();
  flushing = null;
}

/**
 * A tarefa de um id no índice, **ignorando a caixa** do uuid.
 *
 * É a porta de leitura do mapa, e existe para o consumidor não errar: `taskRefIds` deduplica
 * ignorando a caixa e devolve a primeira grafia, então um segundo `orbyva-task:ABC…` no mesmo texto
 * chegaria ao chip com a grafia dele — e um `Map.get` cru renderizaria "referência removida" para
 * uma tarefa que existe.
 */
export function lookupTaskRef(
  index: Map<string, TaskRefSummary>,
  id: string
): TaskRefSummary | undefined {
  return index.get(id.toLowerCase());
}

/**
 * As tarefas citadas, resolvidas em lote. O mapa é chaveado pelo id **em minúsculas** — leia por
 * `lookupTaskRef`, nunca por `Map.get` direto.
 *
 * `ids` vem de `taskRefIds(conteúdo)` (feature 103).
 */
export function useTaskRefIndex(ids: readonly string[]): Map<string, TaskRefSummary> {
  /** Chave estável do conjunto: sem ela, um array novo a cada render refaria o efeito sempre. */
  const key = useMemo(() => [...new Set(ids.map((id) => id.toLowerCase()))].sort().join(","), [ids]);
  const [resolvedAt, setResolvedAt] = useState(0);

  useEffect(() => {
    if (!key) return; // Lista vazia não dispara consulta nenhuma.
    let alive = true;
    void request(key.split(",")).then(() => {
      if (alive) setResolvedAt((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  return useMemo(() => {
    const index = new Map<string, TaskRefSummary>();
    for (const id of key ? key.split(",") : []) {
      const hit = cache.get(id);
      if (hit) index.set(id, hit);
    }
    return index;
    // `resolvedAt` não é lido no corpo de propósito: a fonte do snapshot é o `cache` do módulo, que
    // muda fora do React. É ele que diz "chegou resposta, refaça o mapa" — sem ele o chip ficaria
    // com o mapa vazio da primeira render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, resolvedAt]);
}
