import { useEffect, useState } from "react";
import { fetchLinkIconRules } from "@/api/tasks/linkIconRules";
import type { LinkIconRule } from "@/types/tasks";

/**
 * As regras de aparência de link externo (feature 087), com **cache no módulo**.
 *
 * O cache não é otimização prematura: `ExternalLinkChip` monta uma vez por tarefa com link, e uma
 * lista de 60 tarefas dispararia 60 consultas para ler a mesma tabela — que muda raramente, porque
 * é configuração. Guardar no módulo (e não num contexto React) mantém o chip sem provider e serve
 * também a Kanban, Gantt e Agenda, que renderizam as mesmas linhas por caminhos diferentes.
 *
 * Falha de carregamento **resolve para lista vazia**: todo link cai no fallback de host
 * (`describeExternalLink`), a aparência piora e a lista de tarefas continua de pé. Sem toast — é
 * leitura de fundo de toda lista de tarefas, e um toast por navegação seria ruído sobre algo que o
 * usuário não pediu agora; o `console.error` é onde isso fica registrado.
 *
 * O vazio de uma falha **fica em cache** de propósito: sem isso, cada montagem de chip tentaria de
 * novo e uma tabela fora do ar viraria uma tempestade de requisições. Quem desfaz é
 * `invalidateLinkIconRules()`, chamada pela tela de configuração a cada escrita — que é também o
 * momento em que o usuário tem motivo para esperar a lista atualizada.
 */

/** Referência estável: sem ela, todo consumidor receberia um array novo a cada render. */
const EMPTY: LinkIconRule[] = [];

let cache: LinkIconRule[] | null = null;
let pending: Promise<LinkIconRule[]> | null = null;
/** Sobe a cada `invalidate`. Uma busca em voo que resolva depois disso já está velha e não pode
 * escrever no cache — senão a lista recém-salva seria sobrescrita pela versão anterior. */
let generation = 0;
const listeners = new Set<() => void>();

function load(): Promise<LinkIconRule[]> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    const gen = generation;
    pending = fetchLinkIconRules()
      .catch((error) => {
        console.error("Não foi possível carregar as regras de ícone de link.", error);
        return EMPTY;
      })
      .then((rules) => {
        if (gen === generation) cache = rules;
        return rules;
      })
      .finally(() => {
        if (gen === generation) pending = null;
      });
  }
  return pending;
}

/** Descarta o cache e faz todo consumidor montado buscar de novo. Chamada pela tela de
 * configuração ao criar, editar, excluir, ligar/desligar e reordenar — é o que faz o chip de uma
 * tarefa aberta em outra aba do app refletir a regra nova sem recarregar a página. */
export function invalidateLinkIconRules(): void {
  cache = null;
  pending = null;
  generation += 1;
  for (const listener of [...listeners]) listener();
}

/**
 * As regras, já ordenadas por `position` (a ordem em que são avaliadas). Devolve `[]` enquanto a
 * primeira busca não volta — o chip desenha o fallback e troca sozinho quando as regras chegam,
 * que é bem melhor do que um esqueleto piscando dentro de cada card.
 */
export function useLinkIconRules(): LinkIconRule[] {
  const [rules, setRules] = useState<LinkIconRule[]>(() => cache ?? EMPTY);

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      void load().then((next) => {
        if (!cancelled) setRules(next);
      });
    };
    listeners.add(sync);
    sync();
    return () => {
      cancelled = true;
      listeners.delete(sync);
    };
  }, []);

  return rules;
}
