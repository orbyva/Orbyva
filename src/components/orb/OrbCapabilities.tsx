import {
  Boxes,
  CalendarClock,
  Compass,
  Database,
  PlusCircle,
  Car,
  HeartPulse,
  ListChecks,
  MapPin,
  NotebookPen,
  Plane,
  ShoppingCart,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
// O catálogo vem do registro compartilhado, o mesmo que o servidor serializa para o modelo: uma
// lista escrita à mão aqui divergiria na primeira tool nova e prometeria (ou esconderia) consulta.
import {
  ORB_APP_ONLY_TOOLS,
  orbTools,
  type OrbTool,
} from "../../../supabase/functions/_shared/orb/registry.ts";
import { createTools } from "../../../supabase/functions/_shared/orb/tools/create.ts";
import { dataTools } from "../../../supabase/functions/_shared/orb/tools/data.ts";
import { navigationTools } from "../../../supabase/functions/_shared/orb/tools/navigation.ts";
import { financeTools } from "../../../supabase/functions/_shared/orb/tools/finance.ts";
import { healthTools } from "../../../supabase/functions/_shared/orb/tools/health.ts";
import { lifeTools } from "../../../supabase/functions/_shared/orb/tools/life.ts";
import { notesTools } from "../../../supabase/functions/_shared/orb/tools/notes.ts";
import { placesTools } from "../../../supabase/functions/_shared/orb/tools/places.ts";
import { productivityTools } from "../../../supabase/functions/_shared/orb/tools/productivity.ts";
import { shoppingTools } from "../../../supabase/functions/_shared/orb/tools/shopping.ts";
import { timelineTools } from "../../../supabase/functions/_shared/orb/tools/timeline.ts";
import { travelTools } from "../../../supabase/functions/_shared/orb/tools/travel.ts";
import { vehiclesTools } from "../../../supabase/functions/_shared/orb/tools/vehicles.ts";

interface AreaDaOrb {
  nome: string;
  icone: LucideIcon;
  tools: OrbTool[];
}

/**
 * O agrupamento reusa os MESMOS arrays por área que `registry.ts` concatena, em vez de um mapa
 * `nome da tool → área` escrito aqui: tool nova entra no arquivo da área e aparece sozinha.
 * A única coisa que ainda exige uma linha nova é uma ÁREA nova — e mesmo essa não some da tela,
 * porque `SEM_AREA` recolhe tudo que estiver em `orbTools` e não tenha caído em nenhum grupo.
 */
const AREAS: AreaDaOrb[] = [
  { nome: "Finanças", icone: Wallet, tools: financeTools },
  { nome: "Tarefas e projetos", icone: ListChecks, tools: productivityTools },
  { nome: "Rotina e conteúdo", icone: Sparkles, tools: lifeTools },
  { nome: "Viagens", icone: Plane, tools: travelTools },
  { nome: "Compras", icone: ShoppingCart, tools: shoppingTools },
  { nome: "Saúde", icone: HeartPulse, tools: healthTools },
  { nome: "Notas", icone: NotebookPen, tools: notesTools },
  { nome: "Próximos compromissos", icone: CalendarClock, tools: timelineTools },
  { nome: "Lugares", icone: MapPin, tools: placesTools },
  { nome: "Veículos", icone: Car, tools: vehiclesTools },
  { nome: "Consulta livre", icone: Database, tools: dataTools },
  { nome: "Abrir telas do app", icone: Compass, tools: navigationTools },
  { nome: "Criar (você confirma)", icone: PlusCircle, tools: createTools },
];

const NOMES_AGRUPADOS = new Set(AREAS.flatMap((area) => area.tools.map((tool) => tool.name)));
const SEM_AREA = orbTools.filter((tool) => !NOMES_AGRUPADOS.has(tool.name));

const GRUPOS: AreaDaOrb[] = [
  ...AREAS.filter((area) => area.tools.length > 0),
  ...(SEM_AREA.length > 0 ? [{ nome: "Outros", icone: Boxes, tools: SEM_AREA }] : []),
];

/**
 * Consultas ≠ catálogo inteiro: desde a feature 100 há tool que navega e tool que prepara criação.
 * Contar as três juntas como "consultas disponíveis" seria número inflado com nome errado.
 */
const TOTAL_DE_CONSULTAS = orbTools.filter(
  (tool) => !ORB_APP_ONLY_TOOLS.includes(tool.name)
).length;

/**
 * Selo de confiança do chat: a resposta à pergunta que trava quem abre a Orb pela primeira vez
 * ("ela pode mexer nos meus dados?").
 *
 * Deixou de dizer "somente leitura" na feature 100, quando a Orb passou a preparar criações — a
 * frase virava mentira, e um selo de confiança que mente é pior que nenhum. A garantia que
 * continua real, e que é a que importa, está no texto novo: nada é gravado sem o clique de quem
 * está lendo.
 */
export function OrbCapabilitiesSeal({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 rounded-full border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden />
      <span className="font-medium text-foreground">Conectada ao seu Orbyva</span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">{TOTAL_DE_CONSULTAS} consultas disponíveis</span>
      <span aria-hidden>·</span>
      <span className="font-medium text-success">só cria com a sua confirmação</span>
    </p>
  );
}

export function OrbCapabilities({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:w-[26rem] sm:max-w-none"
      >
        <SheetHeader className="space-y-3 border-b p-5 pr-12 text-left sm:p-6 sm:pr-12">
          <SheetTitle>O que eu sei consultar</SheetTitle>
          <SheetDescription>
            Cada item abaixo é algo que eu faço nos seus próprios dados, no seu login: consultar,
            abrir a tela certa já filtrada e preparar uma criação para você confirmar. Peça em
            português — eu escolho o caminho.
          </SheetDescription>
          <OrbCapabilitiesSeal className="justify-start self-start" />
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          {GRUPOS.map((grupo) => {
            const Icone = grupo.icone;
            return (
              <section key={grupo.nome} className="space-y-2">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Icone className="size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">{grupo.nome}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                    {grupo.tools.length}
                  </span>
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {grupo.tools.map((tool) => (
                    <li
                      key={tool.name}
                      className="rounded-full border bg-card px-2.5 py-1 text-xs text-card-foreground"
                    >
                      {tool.title ?? tool.name}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {/*
            Dizia "Não crio, não edito e não apago nada" até a feature 100 — a mesma frase que o
            selo lá em cima deixou de usar, e pelo mesmo motivo: com `propose_create` no catálogo
            ela virou mentira, e aqui ficava ao lado do grupo "Criar (você confirma)", contradizendo
            o que a própria tela mostra. O que continua verdade é a garantia que importa: nada é
            gravado sem o clique de quem está lendo.
          */}
          <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
            Não edito e não apago nada — o que precisar mudar, você muda no Orbyva. Criar, eu só
            preparo: a linha só passa a existir depois que você confirma no cartão. As simulações
            (parcelamento, corte de gasto, saldo do mês) só calculam em cima do que já existe; nada
            do que elas mostram fica registrado.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
