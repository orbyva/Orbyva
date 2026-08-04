import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { LandingPhoneFrame } from "./LandingPhoneFrame";
import { fadeUp, fadeUpSlow, staggerDelay } from "./landingMotion";

/** Ganchos de conversão — 1 print = 1 tela real. */
const MONEY_FEATURES = [
  {
    id: "orcamento",
    eyebrow: "Orçamento",
    title: "Saiba o que ainda cabe no mês",
    body: "Teto por categoria, gasto e restante. Alerta quando estoura — Moradia, Alimentação, Lazer — sem planilha.",
    points: [
      "Resumo: resultado, gasto e receita do mês",
      "Categorias com % usado e status OK / atenção / estourado",
      "Aparece no hub junto com o saldo dos lançamentos",
    ],
    src: "/marketing/orcamento.png",
    detailSrc: "/marketing/orcamento-categorias.png",
    alt: "Orçamento mensal: resultado, gasto e receita",
    reverse: false,
  },
  {
    id: "recorrencias",
    eyebrow: "Recorrências",
    title: "Nunca mais esquecer o que vence",
    body: "Lista de recorrências e 12x, mais a aba Projeção: a receber × a pagar, gráfico dos próximos meses e simular compra antes de comprometer o mês.",
    points: [
      "Alertas de contas atrasadas e vencimentos próximos",
      "Projeção mensal — saldo previsto e horizonte à frente",
      "Simular compra (valor, parcelas Nx, 1ª parcela) sem gravar",
    ],
    src: "/marketing/parcelas.png",
    detailSrc: "/marketing/parcelas-lista.png",
    alt: "Recorrências com alertas, projeção e simulação",
    reverse: true,
  },
] as const;

/** Life OS — módulos além do dinheiro (prints batem com o label). */
const LIFE_MODULES = [
  {
    id: "habitos",
    label: "Hábitos",
    body: "Check-in do dia, streaks e taxa da semana.",
    src: "/marketing/habitos.png",
  },
  {
    id: "metas",
    label: "Metas",
    body: "Objetivos com progresso — e quanto guardar por mês nas metas em R$.",
    src: "/marketing/metas.png",
  },
  {
    id: "viagens",
    label: "Viagens",
    body: "Roteiro, orçamento e checklist. Compartilhe com amigos no Orbyva.",
    src: "/marketing/viagens.png",
  },
  {
    id: "lugares",
    label: "Lugares",
    body: "Notas de restaurantes e passeios — compartilhe a opinião.",
    src: "/marketing/lugares.png",
  },
  {
    id: "cinema",
    label: "Cinema",
    body: "Watchlist, notas e card para compartilhar.",
    src: "/marketing/cinema.png",
  },
  {
    id: "veiculos",
    label: "Veículos",
    body: "Manutenção, combustível, km e documentos.",
    src: "/marketing/veiculos.png",
  },
] as const;

export function LandingFeatures() {
  return (
    <>
      <section
        id="controle"
        className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28"
      >
        <motion.div {...fadeUp} className="max-w-xl">
          <p className="font-display text-sm font-medium text-sky-400/90">
            Controle do mês
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            O que faz alguém assinar
          </h2>
          <p className="mt-3 text-zinc-400">
            Orçamento e recorrências — o diferencial. O resto do life OS vem junto.
          </p>
        </motion.div>

        <div className="mt-16 space-y-20 sm:mt-20 sm:space-y-28">
          {MONEY_FEATURES.map((feat) => (
            <motion.div
              key={feat.id}
              {...fadeUpSlow}
              className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              <div className={feat.reverse ? "lg:order-2" : "lg:order-1"}>
                <p className="text-sm font-medium text-sky-400/80">
                  {feat.eyebrow}
                </p>
                <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  {feat.title}
                </h3>
                <p className="mt-3 max-w-md text-base leading-relaxed text-zinc-400">
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
                className={`mx-auto flex w-full max-w-[280px] flex-col items-center gap-4 sm:max-w-[420px] sm:flex-row sm:items-end sm:justify-center sm:gap-3 ${
                  feat.reverse ? "lg:order-1" : "lg:order-2"
                }`}
              >
                <div className="hidden w-[48%] max-w-[200px] opacity-80 sm:block">
                  <LandingPhoneFrame
                    src={feat.detailSrc}
                    alt={`${feat.eyebrow}: detalhe`}
                  />
                </div>
                <div className="w-full max-w-[260px] sm:w-[58%] sm:max-w-[240px]">
                  <LandingPhoneFrame src={feat.src} alt={feat.alt} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          {...fadeUp}
          className="mt-20 grid items-center gap-10 border-t border-white/10 pt-16 lg:grid-cols-2 lg:gap-16"
        >
          <div>
            <p className="text-sm font-medium text-sky-400/80">Finanças</p>
            <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              O mês inteiro, com alertas
            </h3>
            <p className="mt-3 max-w-md text-base leading-relaxed text-zinc-400">
              Receita, despesa e saldo — e as recorrências atrasadas ou próximas já
              no dashboard. Compartilhe o mês ou exporte CSV.
            </p>
          </div>
          <div className="mx-auto flex w-full max-w-[280px] flex-col items-center gap-4 sm:max-w-[420px] sm:flex-row sm:items-end sm:justify-center sm:gap-3">
            <div className="hidden w-[48%] max-w-[200px] opacity-80 sm:block">
              <LandingPhoneFrame
                src="/marketing/financas-charts.png"
                alt="Gráficos de finanças no Orbyva"
              />
            </div>
            <div className="w-full max-w-[260px] sm:w-[58%] sm:max-w-[240px]">
              <LandingPhoneFrame
                src="/marketing/financas.png"
                alt="Dashboard de Finanças com alertas de recorrências"
              />
            </div>
          </div>
        </motion.div>
      </section>

      <section
        id="modulos"
        className="scroll-mt-20 border-t border-white/8 bg-gradient-to-b from-sky-500/[0.05] to-transparent"
      >
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <motion.div {...fadeUp} className="max-w-xl">
            <p className="font-display text-sm font-medium text-sky-400/90">
              Life OS
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              O que antes eram vários apps
            </h2>
            <p className="mt-3 text-zinc-400">
              Hábitos, metas, viagens, lugares, cinema e veículos — na mesma
              órbita dos lançamentos. Liberado desde o dia 1.
            </p>
          </motion.div>

          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {LIFE_MODULES.map((mod, i) => (
              <motion.figure
                key={mod.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{
                  delay: staggerDelay(i, 0.04),
                  duration: 0.4,
                }}
                className="mx-auto w-full max-w-[260px] space-y-3 sm:max-w-none"
              >
                <LandingPhoneFrame
                  src={mod.src}
                  alt={`${mod.label} no ${BRAND.name}`}
                />
                <figcaption>
                  <p className="text-sm font-medium text-zinc-100">
                    {mod.label}
                  </p>
                  <p className="mt-0.5 text-sm leading-snug text-zinc-500">
                    {mod.body}
                  </p>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
