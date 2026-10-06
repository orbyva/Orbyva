import { useEffect, useState } from "react";
import { fetchEventTypeIcons } from "@/api/travel/eventTypeIcons";
import type { EventTypeIconMap } from "@/domain/travel/eventTypes";

/**
 * As personalizações de ícone por tipo de evento (feature 258), com **cache no módulo** — o mesmo
 * desenho (e as mesmas razões) de `useLinkIconRules`.
 *
 * O cache não é otimização prematura: o ícone é lido por **toda linha do roteiro**, e um roteiro de
 * dez dias com seis eventos cada dispararia sessenta consultas para ler a mesma tabela, que muda
 * raramente porque é configuração. Guardar no módulo (e não num contexto React) mantém o card sem
 * provider e serve igualmente ao formulário.
 *
 * Falha de carregamento **resolve para mapa vazio**: todo tipo volta ao ícone padrão de
 * `PLACE_TYPE_META`, a aparência piora e o roteiro continua de pé. Sem toast — é leitura de fundo
 * de uma tela inteira, e um toast por navegação seria ruído sobre algo que o usuário não pediu
 * agora; o `console.error` é onde isso fica registrado.
 *
 * O vazio de uma falha **fica em cache** de propósito: sem isso, cada card tentaria de novo e uma
 * tabela fora do ar viraria uma tempestade de requisições. Quem desfaz é
 * `invalidateEventTypeIcons()`, chamada pelo seletor a cada escrita — que é também o momento em que
 * o usuário tem motivo para esperar a tela atualizada.
 */

/** Referência estável: sem ela, todo consumidor receberia um objeto novo a cada render. */
const EMPTY: EventTypeIconMap = {};

let cache: EventTypeIconMap | null = null;
let pending: Promise<EventTypeIconMap> | null = null;
/** Sobe a cada `invalidate`. Uma busca em voo que resolva depois disso já está velha e não pode
 * escrever no cache — senão a escolha recém-salva seria sobrescrita pela versão anterior. */
let generation = 0;
const listeners = new Set<() => void>();

function load(): Promise<EventTypeIconMap> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    const gen = generation;
    pending = fetchEventTypeIcons()
      .catch((error) => {
        console.error("Não foi possível carregar os ícones dos tipos de evento.", error);
        return EMPTY;
      })
      .then((map) => {
        if (gen === generation) cache = map;
        return map;
      })
      .finally(() => {
        if (gen === generation) pending = null;
      });
  }
  return pending;
}

/** Descarta o cache e faz todo consumidor montado buscar de novo. Chamada pelo seletor ao definir e
 * ao remover o ícone de um tipo — é o que faz os cards do roteiro acompanharem a escolha sem
 * recarregar a página. */
export function invalidateEventTypeIcons(): void {
  cache = null;
  pending = null;
  generation += 1;
  for (const listener of [...listeners]) listener();
}

/**
 * O mapa `category → ícone personalizado`. Devolve `{}` enquanto a primeira busca não volta — o
 * card desenha o ícone padrão e troca sozinho quando a personalização chega, que é bem melhor do
 * que um esqueleto piscando dentro de cada linha do roteiro.
 */
export function useEventTypeIcons(): EventTypeIconMap {
  const [map, setMap] = useState<EventTypeIconMap>(() => cache ?? EMPTY);

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      void load().then((next) => {
        if (!cancelled) setMap(next);
      });
    };
    listeners.add(sync);
    sync();
    return () => {
      cancelled = true;
      listeners.delete(sync);
    };
  }, []);

  return map;
}
