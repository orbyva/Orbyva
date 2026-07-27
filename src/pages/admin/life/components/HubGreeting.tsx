import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { todayHeading } from "../hubMeta";

type HubGreetingProps = {
  firstName: string | null;
};

export function HubGreeting({ firstName }: HubGreetingProps) {
  return (
    <header className="relative flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          {BRAND.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight leading-none sm:text-[2.05rem]">
          {firstName ? `Olá, ${firstName}!` : "Olá"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{todayHeading()}</p>
      </div>
      <Button size="sm" className="shrink-0 shadow-sm" asChild>
        <Link
          to="/finance/transactions?new=1"
          onClick={() => track("quick_add_open", { source: "home" })}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Despesa
        </Link>
      </Button>
    </header>
  );
}
