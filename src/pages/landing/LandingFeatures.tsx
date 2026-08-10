import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { LandingPhoneFrame } from "./LandingPhoneFrame";
import { LandingSectionTitle } from "@/components/landing/LandingSectionTitle";
import { fadeUp, fadeUpSlow, staggerDelay } from "@/components/landing/landingMotion";

/** Ganchos de conversão — 1 print = 1 tela real. */
const MONEY_FEATURES = [
  {
    id: "orcamento",
    eyebrow: "Controle do mês",
    title: "Veja o que ainda dá para gastar — antes de estourar",
    body: "Defina um teto por categoria e acompanhe gasto e restante. Alerta quando aperta: Moradia, Alimentação, Lazer — sem planilha.",
    points: [
      "Resumo claro: quanto entrou, quanto saiu e o resultado do mês",
      "Categorias com % usado e status OK / atenção / estourado",
      "No início do app, junto com o saldo do dia",
    ],
    src: "/marketing/orcamento.png",
    detailSrc: "/marketing/orcamento-categorias.png",
    alt: "Teto do mês: resultado, gasto e receita",
    reverse: false,
  },
  {
    id: "recorrencias",
    eyebrow: "Contas e parcelas",
    title: "Não esqueça o que vence — e simule antes de parcelar",
    body: "Contas fixas e 12x numa lista só, com alertas. Na Projeção você vê a receber × a pagar e testa uma compra sem gravar.",
    points: [
      "Alertas de atrasadas e vencimentos próximos",
      "Projeção do mês com saldo previsto",
      "Simular compra (valor, Nx, 1ª parcela) antes de comprometer o mês",
    ],
    src: "/marketing/parcelas.png",
    detailSrc: "/marketing/parcelas-lista.png",
    extraSrc: "/marketing/projecao-chart.png",
    alt: "Recorrências: contas, parcelas e alertas do mês",
    reverse: true,
  },
] as const;

/** Life OS — módulos além do dinheiro (prints batem com o label). */
const LIFE_MODULES = [
  {
    id: "habitos",
    label: "Hábitos",
    body: "Check-in do dia, streaks e ritmo da semana — sem app separado.",
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
    body: "Roteiro, orçamento e checklist. Compartilhe a viagem com amigos.",
    src: "/marketing/viagens.png",
  },
  {
    id: "lugares",
    label: "Lugares",
    body: "Restaurantes e passeios com nota — opinião pronta para compartilhar.",
    src: "/marketing/lugares.png",
  },
  {
    id: "cinema",
    label: "Cinema",
    body: "Watchlist, notas e card para Stories — sem outro app de filmes.",
    src: "/marketing/cinema.png",
  },
  {
    id: "livros",
    label: "Livros",
    body: "Lista de leitura, lidos e opinião — do mesmo jeito que o cinema.",
    src: "/marketing/livros.png",
  },
  {
    id: "musica",
    label: "Música",
    body: "Álbuns para ouvir e ouvidos, com nota e comentário.",
    src: "/marketing/musica.png",
  },
  {
    id: "veiculos",
    label: "Veículos",
    body: "Manutenção, combustível, km e documentos — prazos sob controle.",
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
        <LandingSectionTitle
          eyebrow="Controle do mês"
          title="O que você sente falta todo mês — num só lugar"
          description="Saber o que ainda cabe gastar e não esquecer contas. O resto da vida (hábitos, viagens, cinema…) vem junto, desde o dia 1."
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
                  {feat.eyebrow}
                </p>
                <h3 className="mt-2 font-display text-2xl font-semibold leading-[1.4] tracking-tight sm:text-3xl sm:leading-[1.35]">
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
                className={`mx-auto flex w-full max-w-[280px] flex-col items-center gap-4 sm:max-w-[520px] sm:flex-row sm:items-end sm:justify-center sm:gap-2.5 ${
                  feat.reverse ? "lg:order-1" : "lg:order-2"
                }`}
              >
                {"extraSrc" in feat && feat.extraSrc ? (
                  <div className="hidden w-[30%] max-w-[160px] opacity-75 lg:block">
                    <LandingPhoneFrame
                      src={feat.extraSrc}
                      alt={`${feat.eyebrow}: projeção`}
                    />
                  </div>
                ) : null}
                <div className="hidden w-[36%] max-w-[180px] opacity-85 sm:block">
                  <LandingPhoneFrame
                    src={feat.detailSrc}
                    alt={`${feat.eyebrow}: detalhe`}
                  />
                </div>
                <div className="w-full max-w-[260px] sm:w-[44%] sm:max-w-[220px]">
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
            <p className="text-sm font-medium text-sky-400/80">Dinheiro</p>
            <h3 className="mt-2 font-display text-2xl font-semibold leading-[1.4] tracking-tight sm:text-3xl sm:leading-[1.35]">
              O mês inteiro na tela — com alertas que importam
            </h3>
            <p className="mt-3 max-w-md text-base leading-relaxed text-zinc-400">
              O que entrou, o que saiu e o saldo. Contas atrasadas ou próximas já
              no painel. Lançamentos na lista — edite, filtre e acompanhe.
            </p>
          </div>
          <div className="mx-auto flex w-full max-w-[280px] flex-col items-center gap-4 sm:max-w-[420px] sm:flex-row sm:items-end sm:justify-center sm:gap-3">
            <div className="hidden w-[48%] max-w-[200px] opacity-80 sm:block">
              <LandingPhoneFrame
                src="/marketing/transacoes.png"
                alt="Lista de transações no Orbyva"
              />
            </div>
            <div className="w-full max-w-[260px] sm:w-[58%] sm:max-w-[240px]">
              <LandingPhoneFrame
                src="/marketing/financas.png"
                alt="Dashboard com alertas de contas e parcelas"
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
          <LandingSectionTitle
            eyebrow="Vida organizada"
            title="E o resto da vida? Também. No mesmo app."
            description="Hábitos, metas, viagens, lugares, cinema, livros, música e veículos — liberado no teste e no Pro. Sem app extra, sem assinatura extra."
          />

          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {LIFE_MODULES.map((mod, i) => (
              <motion.figure
                key={mod.id}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
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
