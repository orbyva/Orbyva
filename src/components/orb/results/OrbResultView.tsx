import { memo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  OrbBadge,
  OrbBadgeTone,
  OrbBarGroup,
  OrbBarItem,
  OrbCardItem,
  OrbPosterItem,
  OrbResultView as Visao,
  OrbRowItem,
} from "@/domain/orb/results";

/**
 * O desenho dos resultados da Orb (feature 100).
 *
 * Cinco formas cobrem o catálogo — cartão, carrossel, linha, barra e barras agrupadas —, e a
 * tradução de cada tool para uma delas mora em `@/domain/orb/results`, que é código puro e
 * testado. Aqui só tem pixel: qualquer regra sobre O QUE mostrar está do outro lado.
 */

const TOM: Record<OrbBadgeTone, string> = {
  neutro: "bg-muted text-muted-foreground",
  ok: "bg-success/15 text-success",
  atencao: "bg-warning/15 text-warning",
  erro: "bg-destructive/15 text-destructive",
  destaque: "bg-primary/10 text-primary",
};

const TOM_DE_TEXTO: Record<OrbBadgeTone, string> = {
  neutro: "text-foreground",
  ok: "text-success",
  atencao: "text-warning",
  erro: "text-destructive",
  destaque: "text-primary",
};

const TOM_DE_BARRA: Record<OrbBadgeTone, string> = {
  neutro: "bg-muted-foreground/40",
  ok: "bg-success",
  atencao: "bg-warning",
  erro: "bg-destructive",
  destaque: "bg-primary",
};

function Etiqueta({ badge }: { badge: OrbBadge }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
        TOM[badge.tone ?? "neutro"]
      )}
    >
      {badge.label}
    </span>
  );
}

/** Cartão que vira link quando há para onde ir — e continua sendo um `div` quando não há. */
function Alvo({ to, children, className }: { to?: string; children: ReactNode; className?: string }) {
  if (!to) return <div className={className}>{children}</div>;
  return (
    <Link to={to} className={cn(className, "hover:border-primary/40 hover:bg-accent/50")}>
      {children}
    </Link>
  );
}

function Cartoes({ items }: { items: OrbCardItem[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <Alvo
          key={item.id}
          to={item.to}
          className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-2.5 transition-colors"
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-snug">
              {item.title}
            </span>
            {item.meta ? (
              <span className="shrink-0 text-[11px] text-muted-foreground">{item.meta}</span>
            ) : null}
          </div>
          {item.subtitle ? (
            <span className="line-clamp-2 text-[11px] text-muted-foreground">{item.subtitle}</span>
          ) : null}
          {item.badges && item.badges.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {item.badges.map((badge) => (
                <Etiqueta key={badge.label} badge={badge} />
              ))}
            </div>
          ) : null}
        </Alvo>
      ))}
    </div>
  );
}

function Carrossel({ items }: { items: OrbPosterItem[] }) {
  return (
    // Rolagem horizontal com `snap`: numa lista de 30 pôsteres, o corte no meio do cartaz é o que
    // avisa que dá para arrastar — grade quebrada em linhas esconderia isso.
    <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
      {items.map((item) => (
        <Alvo
          key={item.id}
          to={item.to}
          className="w-[104px] shrink-0 snap-start overflow-hidden rounded-xl border bg-card transition-colors"
        >
          <div className="relative aspect-[2/3] w-full bg-muted">
            {item.image ? (
              <img
                src={item.image}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
                // Capa quebrada (link morto do provedor) não pode deixar um ícone de imagem
                // quebrada do navegador no meio do carrossel.
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageOff className="size-5" aria-hidden />
              </span>
            )}
            {item.badge ? (
              <span className="absolute left-1 top-1">
                <Etiqueta badge={item.badge} />
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-0.5 p-1.5">
            <span className="line-clamp-2 text-[11px] font-medium leading-tight">{item.title}</span>
            {item.subtitle ? (
              <span className="truncate text-[10px] text-muted-foreground">{item.subtitle}</span>
            ) : null}
          </div>
        </Alvo>
      ))}
    </div>
  );
}

function Linhas({ items }: { items: OrbRowItem[] }) {
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((item) => (
        <Alvo
          key={item.id}
          to={item.to}
          className="flex min-w-0 items-center justify-between gap-3 px-2.5 py-2 transition-colors"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] leading-snug">{item.title}</span>
            {item.subtitle ? (
              <span className="block truncate text-[11px] text-muted-foreground">
                {item.subtitle}
              </span>
            ) : null}
          </span>
          {item.value ? (
            <span
              className={cn(
                "shrink-0 text-[13px] font-medium tabular-nums",
                TOM_DE_TEXTO[item.valueTone ?? "neutro"]
              )}
            >
              {item.value}
            </span>
          ) : null}
        </Alvo>
      ))}
    </div>
  );
}

function Barras({ items }: { items: OrbBarItem[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-2.5">
      {items.map((item) => {
        const largura = Math.max(0, Math.min(1, item.ratio)) * 100;
        const estourou = item.ratio > 1;
        return (
          <div key={item.id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[12px]">{item.label}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {item.value}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  TOM_DE_BARRA[estourou ? "erro" : (item.tone ?? "destaque")]
                )}
                style={{ width: `${largura}%` }}
              />
            </div>
            {item.hint ? (
              <span className="text-[10px] text-muted-foreground">{item.hint}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Nível (título) → subníveis (barras), como na tela de Orçamento. */
function BarrasAgrupadas({ groups }: { groups: OrbBarGroup[] }) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((grupo) => (
        <div key={grupo.id} className="flex flex-col gap-1.5">
          <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {grupo.title}
          </p>
          <Barras items={grupo.items} />
        </div>
      ))}
    </div>
  );
}

/**
 * `memo` pelo mesmo motivo do `OrbMessageBubble`: cada token do stream troca a lista de mensagens
 * inteira, e sem ele 30 pôsteres seriam remontados a cada chunk de texto.
 */
export const OrbResultView = memo(function OrbResultView({ view }: { view: Visao }) {
  return (
    <div className="flex flex-col gap-1.5">
      {view.kind === "cards" ? <Cartoes items={view.items} /> : null}
      {view.kind === "carousel" ? <Carrossel items={view.items} /> : null}
      {view.kind === "rows" ? <Linhas items={view.items} /> : null}
      {view.kind === "bars" ? <Barras items={view.items} /> : null}
      {view.kind === "grouped_bars" ? <BarrasAgrupadas groups={view.groups} /> : null}
      {view.note ? <p className="px-1 text-[11px] text-muted-foreground">{view.note}</p> : null}
    </div>
  );
});
