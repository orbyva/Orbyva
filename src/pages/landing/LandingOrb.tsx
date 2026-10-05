import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { LandingSectionTitle } from "@/components/landing/LandingSectionTitle";
import { fadeUp, fadeUpSlow } from "@/components/landing/landingMotion";
import { LandingOrbSphere } from "@/components/landing/LandingOrbSphere";
import { ORB_AREAS, ORB_POINTS } from "./landingOrbData";

function OrbChatPreview() {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div
        className="space-y-4 rounded-[calc(1.75rem-0.375rem)] border border-violet-400/20 bg-[#0b0f1d] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-6"
        role="img"
        aria-label="Conversa de exemplo com a Orb: ela responde quanto ainda dá para gastar em Lazer e prepara um lançamento para você confirmar"
      >
        <div className="flex items-center gap-3 border-b border-white/8 pb-4">
          <LandingOrbSphere size={36} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-100">Orb</p>
            <p className="text-xs text-zinc-500">Conectada ao seu Orbyva</p>
          </div>
        </div>

        <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-sky-500/15 px-4 py-2.5 text-sm text-sky-50">
          Quanto ainda posso gastar com lazer este mês?
        </p>

        <div className="flex items-start gap-2.5">
          <LandingOrbSphere size={22} className="mt-1" />
          <p className="max-w-[85%] rounded-2xl rounded-tl-md border border-white/8 bg-white/[0.04] px-4 py-2.5 text-sm leading-relaxed text-zinc-200">
            Restam <span className="font-semibold tabular-nums text-zinc-50">R$ 182,40</span> em
            Lazer até o dia 31. No ritmo atual, você fecha o mês dentro do teto.
          </p>
        </div>

        <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-sky-500/15 px-4 py-2.5 text-sm text-sky-50">
          Lança o cinema de ontem, R$ 48,90.
        </p>

        <div className="flex items-start gap-2.5">
          <LandingOrbSphere size={22} className="mt-1" />
          <div className="w-full max-w-[85%] rounded-2xl rounded-tl-md border border-violet-400/25 bg-violet-500/[0.07] p-4">
            <p className="text-xs font-medium text-violet-300">Novo lançamento</p>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <p className="text-sm text-zinc-100">Cinema · Lazer · ontem</p>
              <p className="text-sm font-semibold tabular-nums text-zinc-50">R$ 48,90</p>
            </div>
            <div className="mt-3 flex gap-2">
              <span className="inline-flex h-8 items-center rounded-full bg-sky-400 px-4 text-xs font-medium text-sky-950">
                Confirmar
              </span>
              <span className="inline-flex h-8 items-center rounded-full border border-white/10 px-4 text-xs text-zinc-300">
                Descartar
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A Orb, a IA do Orbyva: pergunta em português, resposta com os dados da própria conta. */
export function LandingOrb() {
  return (
    <section
      id="orb"
      className="scroll-mt-24 border-t border-white/8 bg-gradient-to-b from-violet-500/[0.05] to-transparent"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <div className="flex items-center gap-3">
              <LandingOrbSphere size={44} />
              <p className="text-sm font-medium text-violet-300">Orb · a IA do Orbyva</p>
            </div>
            <LandingSectionTitle
              className="mt-5"
              title="Pergunte. A Orb responde com os seus números."
              description="Ela conversa em português e consulta o que está no seu Orbyva: o mês, as contas, as tarefas, os hábitos, as viagens. Nada de resposta genérica: é a sua conta, no seu login."
            />
            <motion.ul {...fadeUp} className="mt-6 space-y-2.5">
              {ORB_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden />
                  {point}
                </li>
              ))}
            </motion.ul>
            <motion.ul {...fadeUp} className="mt-7 flex flex-wrap gap-2" aria-label="O que a Orb consulta">
              {ORB_AREAS.map((area) => (
                <li
                  key={area}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-zinc-300"
                >
                  {area}
                </li>
              ))}
            </motion.ul>
            <p className="mt-6 text-xs text-zinc-500">
              Não edita nem apaga nada sozinha: o que ela prepara só passa a existir depois do seu
              clique.
            </p>
          </div>

          <motion.div {...fadeUpSlow} className="mx-auto w-full max-w-md">
            <OrbChatPreview />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
