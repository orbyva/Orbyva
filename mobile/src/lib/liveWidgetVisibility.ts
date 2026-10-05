import { secureStoreAdapter } from "@/lib/secure-store";

/**
 * Preferência local de esconder o widget do timer Live — espelho de `src/lib/liveWidgetVisibility.ts`
 * do web. Fica no aparelho, nunca no banco. Ausente, inválida ou storage com erro = visível, para
 * ninguém perder o acesso ao timer por acidente.
 */
export const LIVE_WIDGET_HIDDEN_STORAGE_KEY = "orbyva_live_widget_hidden_v1";

const HIDDEN_VALUE = "1";

export async function readLiveWidgetHidden(): Promise<boolean> {
  try {
    return (await secureStoreAdapter.getItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY)) === HIDDEN_VALUE;
  } catch {
    return false;
  }
}

/** Visível remove a chave em vez de gravar `"0"`. */
export async function writeLiveWidgetHidden(hidden: boolean): Promise<void> {
  try {
    if (hidden) {
      await secureStoreAdapter.setItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY, HIDDEN_VALUE);
    } else {
      await secureStoreAdapter.removeItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export type LiveWidgetMode = "none" | "pill" | "collapsed";

/**
 * O que o widget desenha. Sem tarefa ativa, ou com a última tarefa parada já concluída, não há o
 * que mostrar — escondido ou não. `dismissed` é o "parar e concluir" da sessão, que some de vez;
 * `hidden` é a preferência, que deixa o botão redondo de volta no canto.
 */
export function liveWidgetMode(state: {
  hasTask: boolean;
  running: boolean;
  taskDone: boolean;
  dismissed: boolean;
  hidden: boolean;
}): LiveWidgetMode {
  if (state.dismissed || !state.hasTask) return "none";
  if (!state.running && state.taskDone) return "none";
  return state.hidden ? "collapsed" : "pill";
}
