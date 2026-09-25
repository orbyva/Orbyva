import { Fragment } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/financas-pessoais", label: "Finanças pessoais" },
  { to: "/metas", label: "Metas" },
  { to: "/organizacao-pessoal", label: "Organização pessoal" },
  { to: "/life-os", label: "Life OS" },
  { to: "/controle-financeiro", label: "Controle financeiro" },
  { to: "/planejamento-pessoal", label: "Planejamento pessoal" },
  { to: "/app-organizacao-pessoal", label: "App de organização" },
  { to: "/blog", label: "Blog" },
] as const;

type PublicInternalNavProps = {
  /** Destacar a rota atual (sem link). */
  current?: string;
  className?: string;
};

/** Links internos contextuais entre páginas públicas (SEO + navegação). */
export function PublicInternalNav({
  current,
  className,
}: PublicInternalNavProps) {
  return (
    <nav aria-label="Explorar o Orbyva" className={className}>
      <ul className="flex flex-wrap items-center gap-y-2 text-sm">
        {LINKS.map((item, i) => (
          <Fragment key={item.to}>
            {i > 0 ? (
              <li
                aria-hidden
                className="mx-2.5 inline-flex size-1 shrink-0 rounded-full bg-sky-400/70"
              />
            ) : null}
            <li>
              {current === item.to ? (
                <span className="font-medium text-sky-300">{item.label}</span>
              ) : (
                <Link
                  to={item.to}
                  className={cn(
                    "font-medium text-sky-400 underline decoration-sky-400/45 underline-offset-[5px]",
                    "transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    "hover:text-sky-300 hover:decoration-sky-300"
                  )}
                >
                  {item.label}
                </Link>
              )}
            </li>
          </Fragment>
        ))}
      </ul>
    </nav>
  );
}
