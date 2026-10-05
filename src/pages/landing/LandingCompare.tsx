import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { LandingSectionTitle } from "@/components/landing/LandingSectionTitle";
import { fadeUp } from "@/components/landing/landingMotion";

/** O que a pessoa costuma espalhar: categorias, sem nomes de apps. */
const SCATTERED = [
  { name: "Planilha", role: "orçamento" },
  { name: "App do banco", role: "gastos" },
  { name: "App de hábitos", role: "rotina" },
  { name: "App de metas", role: "poupança" },
  { name: "App de filmes", role: "watchlist" },
  { name: "Bloco de notas", role: "lugares" },
  { name: "Planner de viagem", role: "roteiro" },
] as const;

const ORBYVA_CAPS = [
  "Teto do mês e o que ainda dá para gastar",
  "Orb: pergunte em português, ela responde com os seus dados",
  "Contas, parcelas e simular compra",
  "Hábitos, metas, viagens, lugares, cinema…",
  "Tudo no mesmo login, no bolso",
  "Cronômetro flutuante entre módulos",
] as const;

/**
 * Cunha de conversão: vários apps espalhados → uma órbita (Orbyva).
 */
export function LandingCompare() {
  return (
    <section
      id="comparar"
      className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28"
    >
      <LandingSectionTitle
        title="Chega de vida fragmentada. Um login. Uma órbita."
        description="Você troca de app o tempo todo e perde o fio da meada. No Orbyva, o mês e o resto da vida ficam na mesma órbita."
      />

      <div className="mt-14 grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
        <motion.div {...fadeUp}>
          <p className="font-display text-xl font-semibold tracking-tight text-zinc-200">
            Vários apps
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {SCATTERED.map((item) => (
              <li
                key={item.name}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-300"
              >
                <span className="text-zinc-100">{item.name}</span>
                <span className="text-zinc-500"> ({item.role})</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          {...fadeUp}
          className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        >
          <div className="rounded-[calc(1.75rem-0.375rem)] border border-sky-400/20 bg-sky-500/[0.07] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] sm:p-8">
            <p className="font-display text-xl font-semibold tracking-tight text-sky-100">
              Orbyva
            </p>
            <ul className="mt-6 space-y-3">
              {ORBYVA_CAPS.map((label) => (
                <li
                  key={label}
                  className="flex items-start gap-3 text-sm leading-relaxed text-zinc-200"
                >
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-sky-400"
                    aria-hidden
                  />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
