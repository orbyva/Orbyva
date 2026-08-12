import { motion } from "framer-motion";
import { Check, Minus, X } from "lucide-react";
import { LandingSectionTitle } from "@/components/landing/LandingSectionTitle";
import { fadeUp, staggerDelay } from "@/components/landing/landingMotion";

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

const ROWS = [
  {
    label: "Teto do mês e o que ainda cabe gastar",
    many: "partial",
    orbyva: true,
  },
  {
    label: "Contas, parcelas e simular compra",
    many: "partial",
    orbyva: true,
  },
  {
    label: "Hábitos, metas, viagens, lugares, cinema…",
    many: false,
    orbyva: true,
  },
  {
    label: "Tudo no mesmo login, no bolso",
    many: false,
    orbyva: true,
  },
  {
    label: "Cronômetro flutuante entre módulos",
    many: false,
    orbyva: true,
  },
] as const;

type Cell = true | false | "partial";

function CellIcon({ value }: { value: Cell }) {
  if (value === true) {
    return <Check className="mx-auto size-4 text-sky-400" aria-label="Sim" />;
  }
  if (value === "partial") {
    return (
      <Minus className="mx-auto size-4 text-zinc-500" aria-label="Parcial" />
    );
  }
  return <X className="mx-auto size-4 text-zinc-600" aria-label="Não" />;
}

/**
 * Cunha de conversão: vários apps espalhados → uma órbita (Orbyva).
 */
export function LandingCompare() {
  return (
    <section
      id="comparar"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24"
    >
      <LandingSectionTitle
        align="center"
        eyebrow="Uma órbita"
        title="Chega de vida fragmentada. Um login. Uma órbita."
        description="Você troca de app o tempo todo e perde o fio da meada. No Orbyva, o mês e o resto da vida ficam na mesma órbita."
      />

      <motion.div
        {...fadeUp}
        className="mx-auto mt-10 max-w-3xl text-center"
      >
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          O que costuma ficar espalhado
        </p>
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {SCATTERED.map((item, i) => (
            <motion.li
              key={item.name}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: staggerDelay(i, 0.04), duration: 0.3 }}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-300"
            >
              <span className="text-zinc-100">{item.name}</span>
              <span className="text-zinc-500"> · {item.role}</span>
            </motion.li>
          ))}
        </ul>
        <p className="mt-5 font-display text-sm font-medium text-sky-400">
          → Orbyva: controle do mês + vida organizada no mesmo app
        </p>
      </motion.div>

      <motion.div
        {...fadeUp}
        className="mt-12 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]"
      >
        <table className="w-full min-w-[420px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-zinc-400">
              <th className="px-4 py-4 font-medium sm:px-6">Capacidade</th>
              <th className="px-3 py-4 text-center font-medium">Vários apps</th>
              <th className="px-3 py-4 text-center font-display font-semibold text-sky-300">
                Orbyva
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <motion.tr
                key={row.label}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: staggerDelay(i), duration: 0.35 }}
                className="border-b border-white/5 last:border-0"
              >
                <td className="px-4 py-3.5 text-zinc-300 sm:px-6">
                  {row.label}
                </td>
                <td className="px-3 py-3.5 text-center">
                  <CellIcon value={row.many} />
                </td>
                <td className="bg-sky-500/[0.06] px-3 py-3.5 text-center">
                  <CellIcon value={row.orbyva} />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </section>
  );
}
