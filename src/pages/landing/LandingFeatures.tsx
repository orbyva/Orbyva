import { motion } from "framer-motion";
import {
  BookOpen,
  Car,
  Check,
  Clapperboard,
  Flame,
  MapPin,
  Music,
  Plane,
  Target,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { LandingPhoneFrame } from "./LandingPhoneFrame";
import { LandingSectionTitle } from "@/components/landing/LandingSectionTitle";
import { fadeUp, fadeUpSlow, staggerDelay } from "@/components/landing/landingMotion";
import { cn } from "@/lib/utils";

/** Ganchos de conversão: 1 print por bloco (sem repetir telas). */
const MONEY_FEATURES = [
  {
    id: "orcamento",
    kicker: "Controle do mês",
    title: "Veja o que ainda dá para gastar, antes de estourar",
    body: "Defina um teto por categoria e acompanhe gasto e restante. Alerta quando aperta em Moradia, Alimentação ou Lazer, sem planilha.",
    points: [
      "Resumo claro: quanto entrou, quanto saiu e o resultado do mês",
      "Categorias com % usado e status OK / atenção / estourado",
      "No início do app, junto com o saldo do dia",
    ],
    src: "/marketing/orcamento.png",
    alt: "Teto do mês: resultado, gasto e receita",
    reverse: false,
  },
  {
    id: "recorrencias",
    kicker: "Contas e parcelas",
    title: "Não esqueça o que vence, e simule antes de parcelar",
    body: "Contas fixas e 12x numa lista só, com alertas. Na Projeção você vê a receber × a pagar e testa uma compra sem gravar.",
    points: [
      "Alertas de atrasadas e vencimentos próximos",
      "Projeção do mês com saldo previsto",
      "Simular compra (valor, Nx, 1ª parcela) antes de comprometer o mês",
    ],
    src: "/marketing/parcelas.png",
    alt: "Recorrências: contas, parcelas e alertas do mês",
    reverse: true,
  },
] as const;

type ModuleSpan = "feature" | "wide" | "full" | "cell";

/** Life OS: elementos por módulo (ícone + texto), sem prints repetidos. */
const LIFE_MODULES: {
  id: string;
  label: string;
  body: string;
  icon: LucideIcon;
  span: ModuleSpan;
  tint?: boolean;
}[] = [
  {
    id: "habitos",
    label: "Hábitos",
    body: "Check-in do dia, streaks e ritmo da semana, sem app separado.",
    icon: Flame,
    span: "feature",
    tint: true,
  },
  {
    id: "metas",
    label: "Metas",
    body: "Objetivos com progresso e quanto guardar por mês nas metas em R$.",
    icon: Target,
    span: "wide",
  },
  {
    id: "viagens",
    label: "Viagens",
    body: "Roteiro, orçamento e checklist. Compartilhe a viagem com amigos.",
    icon: Plane,
    span: "wide",
    tint: true,
  },
  {
    id: "lugares",
    label: "Lugares",
    body: "Restaurantes e passeios com nota e opinião pronta para compartilhar.",
    icon: MapPin,
    span: "cell",
  },
  {
    id: "cinema",
    label: "Cinema",
    body: "Watchlist, notas e card para Stories, sem outro app de filmes.",
    icon: Clapperboard,
    span: "cell",
    tint: true,
  },
  {
    id: "livros",
    label: "Livros",
    body: "Lista de leitura, lidos e opinião, do mesmo jeito que o cinema.",
    icon: BookOpen,
    span: "cell",
  },
  {
    id: "musica",
    label: "Música",
    body: "Álbuns para ouvir e ouvidos, com nota e comentário.",
    icon: Music,
    span: "cell",
  },
  {
    id: "veiculos",
    label: "Veículos",
    body: "Manutenção, combustível, km e documentos com prazos sob controle.",
    icon: Car,
    span: "full",
  },
];

function moduleSpanClass(span: ModuleSpan) {
  if (span === "feature") return "lg:col-span-2 lg:row-span-2";
  if (span === "wide") return "lg:col-span-2";
  if (span === "full") return "lg:col-span-4";
  return "";
}

export function LandingFeatures() {
  return (
    <>
      <section
        id="controle"
        className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28"
      >
        <LandingSectionTitle
          title="O que você sente falta todo mês, num só lugar"
          description="Saber o que ainda dá para gastar e não esquecer contas. O resto da vida vem junto, desde o dia 1."
        />

        <div className="mt-16 space-y-20 sm:mt-20 sm:space-y-28">
          {MONEY_FEATURES.map((feat) => (
            <motion.div
              key={feat.id}
              {...fadeUpSlow}
              className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              <div className={feat.reverse ? "lg:order-2" : "lg:order-1"}>
                <p className="text-sm font-medium text-sky-400/80">
                  {feat.kicker}
                </p>
                <h3 className="mt-2 text-balance font-display text-2xl font-semibold leading-[1.4] tracking-tighter sm:text-3xl sm:leading-[1.35]">
                  {feat.title}
                </h3>
                <p className="mt-3 max-w-[65ch] text-base leading-relaxed text-zinc-400">
                  {feat.body}
                </p>
                <ul className="mt-5 space-y-2">
                  {feat.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2 text-sm text-zinc-300"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
              <div
                className={`mx-auto w-full max-w-[260px] ${
                  feat.reverse ? "lg:order-1" : "lg:order-2"
                }`}
              >
                <LandingPhoneFrame src={feat.src} alt={feat.alt} />
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          {...fadeUp}
          className="mt-20 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        >
          <div className="grid items-center gap-8 rounded-[calc(1.75rem-0.375rem)] border border-sky-400/20 bg-sky-500/[0.07] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] sm:grid-cols-[auto_1fr] sm:gap-10 sm:p-8">
            <div
              className="mx-auto flex size-20 items-center justify-center rounded-2xl border border-sky-400/25 bg-sky-500/15 sm:size-24"
              aria-hidden
            >
              <Timer className="size-10 text-sky-300 sm:size-12" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium text-sky-400/80">Produtividade</p>
              <h3 className="mt-1 font-display text-2xl font-semibold tracking-tighter sm:text-3xl">
                Cronômetro flutuante, sempre à mão
              </h3>
              <p className="mt-3 max-w-[65ch] text-base leading-relaxed text-zinc-400">
                Inicie o timer numa tarefa e continue navegando pelos módulos. O
                cronômetro fica fixo na tela: pausa, retoma e registra o tempo sem
                sair do fluxo.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-zinc-300">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                  Visível em qualquer módulo enquanto a sessão estiver ativa
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                  Histórico de tempo ligado à tarefa e ao projeto
                </li>
              </ul>
            </div>
          </div>
        </motion.div>
      </section>

      <section
        id="modulos"
        className="scroll-mt-24 border-t border-white/8 bg-gradient-to-b from-sky-500/[0.04] to-transparent"
      >
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <LandingSectionTitle
            title="E o resto da vida? Também. No mesmo app."
            description="Hábitos, metas, viagens, lugares, cinema, livros, música e veículos. Liberado no teste e no Pro."
          />

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[auto_auto_auto_auto]">
            {LIFE_MODULES.map((mod, i) => (
              <motion.div
                key={mod.id}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{
                  delay: staggerDelay(i, 0.04),
                  duration: 0.4,
                }}
                className={cn(
                  "rounded-2xl border p-5",
                  moduleSpanClass(mod.span),
                  mod.span === "feature" && "lg:p-8",
                  mod.tint
                    ? "border-sky-400/20 bg-sky-500/[0.08]"
                    : "border-white/10 bg-white/[0.03]"
                )}
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
                  <mod.icon className="size-5" aria-hidden strokeWidth={1.5} />
                </div>
                <p
                  className={cn(
                    "mt-4 font-medium text-zinc-100",
                    mod.span === "feature"
                      ? "font-display text-xl tracking-tight sm:text-2xl"
                      : "text-sm"
                  )}
                >
                  {mod.label}
                </p>
                <p
                  className={cn(
                    "mt-1 leading-snug text-zinc-500",
                    mod.span === "feature" ? "text-base text-zinc-400" : "text-sm"
                  )}
                >
                  {mod.body}
                </p>
                <span className="sr-only">{`${mod.label} no ${BRAND.name}`}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
