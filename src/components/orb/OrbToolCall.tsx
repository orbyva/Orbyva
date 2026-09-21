import { memo, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronRight, Loader2 } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarDuracao, resumoDeToolParaTabela } from "@/domain/orb/stream";
import { orbToolLabel } from "@/domain/orb/toolLabel";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { OrbToolCall as ChamadaDeTool, OrbToolStatus } from "@/types/orb";

/** Teto de linhas na tabela do cartão. O resto vira "+N linhas" — o cartão é prova, não relatório. */
const MAX_LINHAS = 20;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const NUMERO_PT_BR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/**
 * Colunas numéricas que NÃO são dinheiro, mesmo quando o nome parece. `total_items` e
 * `total_minutes` casariam com "total" e virariam "R$ 12,00" — número certo, unidade inventada.
 * Por isso a negativa é conferida primeiro e ganha da lista de dinheiro.
 */
const SEGMENTOS_NAO_MONETARIOS = new Set([
  "count",
  "item",
  "items",
  "itens",
  "minute",
  "minutes",
  "minuto",
  "minutos",
  "hour",
  "hours",
  "hora",
  "horas",
  "day",
  "days",
  "dia",
  "dias",
  "percent",
  "percentual",
  "pct",
  "month",
  "months",
  "mes",
  "meses",
  "qtd",
  "quantidade",
  "tags",
  "measurements",
  "matching",
  "rounds",
  "id",
  "ids",
  "year",
  "ano",
  "anos",
  "score",
  "nota",
  "rating",
]);

const SEGMENTOS_MONETARIOS = new Set([
  "valor",
  "value",
  "amount",
  "total",
  "saldo",
  "balance",
  "gasto",
  "gastos",
  "spent",
  "spend",
  "planned",
  "previsto",
  "preco",
  "price",
  "custo",
  "cost",
  "receita",
  "despesa",
  "income",
  "expense",
  "parcela",
  "installment",
  "budget",
  "limite",
  "sobra",
  "remaining",
  "monthly",
  "mensal",
]);

function ehColunaDeDinheiro(coluna: string): boolean {
  const segmentos = coluna.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (segmentos.some((segmento) => SEGMENTOS_NAO_MONETARIOS.has(segmento))) return false;
  return segmentos.some((segmento) => SEGMENTOS_MONETARIOS.has(segmento));
}

function rotuloDeColuna(coluna: string): string {
  const texto = coluna.replace(/_/g, " ").trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Uma célula já pronta para a `<td>`: dinheiro em BRL, data ISO em dd/mm/aaaa, vazio em travessão. */
function formatarCelula(valor: unknown, coluna: string): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "—";
    return ehColunaDeDinheiro(coluna) ? formatBRL(valor) : NUMERO_PT_BR.format(valor);
  }
  if (typeof valor === "string" && ISO_DATE.test(valor)) return formatDateBR(valor);
  return String(valor);
}

function comoJson(valor: unknown): string {
  try {
    return JSON.stringify(valor, null, 2) ?? "null";
  } catch {
    return "(não foi possível exibir este resultado)";
  }
}

/** Valor de parâmetro: escalar formatado como célula; objeto/array vira JSON compacto. */
function formatarParametro(valor: unknown, chave: string): string {
  if (valor !== null && typeof valor === "object") {
    try {
      return JSON.stringify(valor) ?? "";
    } catch {
      return "…";
    }
  }
  return formatarCelula(valor, chave);
}

const STATUS: Record<OrbToolStatus, { rotulo: string; cor: string }> = {
  running: { rotulo: "Consultando", cor: "text-muted-foreground" },
  ok: { rotulo: "Concluída", cor: "text-success" },
  // Âmbar (`warning`), não vermelho: uma tool falhar não significa que o turno falhou — a Orb
  // costuma responder mesmo assim, e vermelho aqui faria a resposta boa parecer errada.
  error: { rotulo: "Falhou", cor: "text-warning" },
};

function IconeDeStatus({ status }: { status: OrbToolStatus }) {
  if (status === "running") return <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />;
  if (status === "ok") return <Check className="size-3.5 shrink-0" aria-hidden />;
  return <AlertTriangle className="size-3.5 shrink-0" aria-hidden />;
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      {children}
    </div>
  );
}

function BlocoJson({ valor }: { valor: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed">
      {comoJson(valor)}
    </pre>
  );
}

function TabelaDoResultado({ colunas, linhas }: { colunas: string[]; linhas: unknown[][] }) {
  const visiveis = linhas.slice(0, MAX_LINHAS);
  const restantes = linhas.length - visiveis.length;

  // Coluna numérica alinha à direita: número de dinheiro em coluna esquerda não deixa comparar
  // ordens de grandeza, que é justamente para o que o usuário abre o cartão.
  const numericas = colunas.map((_, indice) =>
    linhas.some((linha) => typeof linha[indice] === "number")
  );

  return (
    <div className="min-w-0 space-y-1.5">
      {/* A rolagem mora aqui dentro: tabela larga não pode empurrar a largura do chat. */}
      <div className="overflow-x-auto rounded-md border">
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {colunas.map((coluna, indice) => (
                <TableHead
                  key={coluna}
                  className={cn("h-8 whitespace-nowrap px-2", numericas[indice] && "text-right")}
                >
                  {rotuloDeColuna(coluna)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map((linha, indiceDaLinha) => (
              <TableRow key={indiceDaLinha}>
                {colunas.map((coluna, indice) => (
                  <TableCell
                    key={coluna}
                    className={cn(
                      "whitespace-nowrap px-2 py-1.5",
                      numericas[indice] && "text-right tabular-nums"
                    )}
                  >
                    {formatarCelula(linha[indice], coluna)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {restantes > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          +{restantes} {restantes === 1 ? "linha" : "linhas"} não exibidas
        </p>
      ) : null}
    </div>
  );
}

function Resultado({ tool }: { tool: ChamadaDeTool }) {
  const tabela = useMemo(() => resumoDeToolParaTabela(tool.summary), [tool.summary]);

  if (tool.status === "running") {
    return <p className="text-xs text-muted-foreground">Consultando…</p>;
  }
  if (tool.summary === undefined || tool.summary === null) {
    return (
      <p className="text-xs text-muted-foreground">
        {tool.status === "error"
          ? "A consulta falhou e não devolveu resultado."
          : "A consulta não devolveu resultado."}
      </p>
    );
  }

  const truncado =
    typeof tool.summary === "object" &&
    !Array.isArray(tool.summary) &&
    (tool.summary as Record<string, unknown>).truncated === true;

  if (tabela) return <TabelaDoResultado colunas={tabela.colunas} linhas={tabela.linhas} />;

  return (
    <div className="min-w-0 space-y-1.5">
      {truncado ? (
        <p className="text-[11px] text-muted-foreground">
          O resultado era grande demais para caber no cartão; abaixo vai só o resumo que o servidor
          mandou.
        </p>
      ) : null}
      <BlocoJson valor={tool.summary} />
    </div>
  );
}

/**
 * Um cartão por chamada de tool: fechado é uma linha discreta ("de onde saiu esse número"), aberto
 * mostra parâmetros e resultado. `memo` porque o balão inteiro re-renderiza a cada token do stream
 * e nenhuma dessas chamadas muda depois de fechada.
 */
export const OrbToolCall = memo(function OrbToolCall({ tool }: { tool: ChamadaDeTool }) {
  const [aberto, setAberto] = useState(false);

  const status = STATUS[tool.status];
  const duracao = formatarDuracao(tool.durationMs);
  const parametros = tool.input ? Object.entries(tool.input) : [];

  return (
    <Collapsible
      open={aberto}
      onOpenChange={setAberto}
      className={cn(
        "min-w-0 rounded-lg border bg-card/50 text-xs",
        tool.status === "error" && "border-warning/40 bg-warning/5"
      )}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className={status.cor}>
            <IconeDeStatus status={tool.status} />
          </span>
          <span className="sr-only">{status.rotulo}:</span>
          <span className="truncate font-medium">{orbToolLabel(tool.name)}</span>
          <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
            {tool.name}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            {duracao ? <span className="tabular-nums">{duracao}</span> : null}
            <ChevronRight
              className={cn("size-3.5 transition-transform", aberto && "rotate-90")}
              aria-hidden
            />
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-3 border-t px-2.5 py-2">
          <Secao titulo="Parâmetros">
            {parametros.length > 0 ? (
              <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
                {parametros.map(([chave, valor]) => (
                  <div key={chave} className="contents">
                    <dt className="font-mono text-[11px] text-muted-foreground">{chave}</dt>
                    <dd className="min-w-0 break-words">{formatarParametro(valor, chave)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground">Sem parâmetros.</p>
            )}
          </Secao>

          <Secao titulo="Resultado">
            <Resultado tool={tool} />
          </Secao>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});
