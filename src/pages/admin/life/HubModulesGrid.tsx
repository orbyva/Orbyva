import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { HOME_MODULES } from "./hubMeta";

export function HubModulesGrid() {
  return (
    <section className="space-y-3 lg:col-span-7">
      <h2 className="text-base font-semibold tracking-tight sm:text-lg">
        Módulos
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
        {HOME_MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.href}
              to={mod.href}
              className="group flex flex-col gap-2 rounded-xl border bg-card/80 px-3 py-3 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md sm:gap-2.5 sm:rounded-[1.15rem] sm:px-3.5 sm:py-3.5"
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-transform group-hover:scale-105 sm:h-10 sm:w-10",
                  mod.tone
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">
                  {mod.label}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {mod.subtitle}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
