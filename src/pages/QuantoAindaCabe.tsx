import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PublicPageShell } from "@/components/PublicPageShell";
import { LandingAtmosphere } from "@/components/landing/LandingAtmosphere";
import { LandingNeonFrame } from "@/components/landing/LandingNeonFrame";
import { MoneyInput } from "@/components/MoneyInput";
import { track } from "@/lib/analytics";
import { PLANS } from "@/lib/plan";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import {
  CABE_NO_MES_PATH,
  CABE_NO_MES_TITLE,
  cabeNoMesShareText,
  evaluateCabeNoMes,
  type CabeNoMesResult,
} from "@/domain/marketing/cabeNoMes";
import { cn } from "@/lib/utils";

const DESCRIPTION =
  "Renda, contas fixas e o valor da compra. Em segundos você vê se ainda cabe no mês, sem criar conta.";

const moneyFieldClass =
  "h-12 border-white/15 bg-white/5 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-sky-400/40";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-zinc-200">
        {label}
      </label>
      {hint ? (
        <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>
      ) : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function verdictTone(verdict: CabeNoMesResult["verdict"]) {
  if (verdict === "cabe") return "border-emerald-400/35 bg-emerald-500/[0.07]";
  if (verdict === "aperto") return "border-amber-400/35 bg-amber-500/[0.07]";
  return "border-rose-400/35 bg-rose-500/[0.07]";
}

function verdictLabel(verdict: CabeNoMesResult["verdict"]) {
  if (verdict === "cabe") return "Dentro do Orçamento";
  if (verdict === "aperto") return "Aperta o Orçamento";
  return "Fora do Orçamento";
}

export function QuantoAindaCabePage() {
  useDocumentMeta({
    title: CABE_NO_MES_TITLE,
    description: DESCRIPTION,
    path: CABE_NO_MES_PATH,
    image: "https://orbyva.app/marketing/hub.png",
  });

  const [income, setIncome] = useState<number | "">("");
  const [bills, setBills] = useState<number | "">("");
  const [purchase, setPurchase] = useState<number | "">("");

  const result = useMemo(
    () =>
      evaluateCabeNoMes({
        income: income === "" ? 0 : income,
        bills: bills === "" ? 0 : bills,
        purchase: purchase === "" ? 0 : purchase,
      }),
    [income, bills, purchase]
  );

  useEffect(() => {
    track("cabe_no_mes_view");
  }, []);

  useEffect(() => {
    if (!result) return;
    track("cabe_no_mes_result", { verdict: result.verdict });
  }, [result?.verdict]);

  async function onShare() {
    if (!result) return;
    const text = cabeNoMesShareText(result);
    try {
      if (navigator.share) {
        await navigator.share({ title: CABE_NO_MES_TITLE, text });
        track("cabe_no_mes_share", { method: "native" });
        return;
      }
    } catch {
      /* cancelado ou indisponível */
    }
    try {
      await navigator.clipboard.writeText(text);
      track("cabe_no_mes_share", { method: "clipboard" });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative min-h-svh bg-[var(--landing-bg)]">
      <LandingAtmosphere />
      <PublicPageShell width="narrow" className="bg-transparent">
        <p className="font-display text-sm font-medium text-sky-400/90">
          Ferramenta grátis
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {CABE_NO_MES_TITLE}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-400">
          {DESCRIPTION} É o mesmo recorte da Projeção no Orbyva.
        </p>

        <form className="mt-10 space-y-5" onSubmit={(e) => e.preventDefault()}>
          <Field
            id="income"
            label="Renda do mês"
            hint="Salário, extras, o que entra neste mês"
          >
            <MoneyInput
              id="income"
              value={income}
              onChange={setIncome}
              className={moneyFieldClass}
              autoComplete="off"
            />
          </Field>
          <Field
            id="bills"
            label="Contas fixas"
            hint="Aluguel, internet, parcelas, o que já está comprometido"
          >
            <MoneyInput
              id="bills"
              value={bills}
              onChange={setBills}
              className={moneyFieldClass}
            />
          </Field>
          <Field
            id="purchase"
            label="Compra que você está pensando"
            hint="Opcional. iPhone, viagem, curso — deixe em branco só para ver o restante"
          >
            <MoneyInput
              id="purchase"
              value={purchase}
              onChange={setPurchase}
              className={moneyFieldClass}
            />
          </Field>
        </form>

        {result ? (
          <LandingNeonFrame
            className={cn("mt-10 px-6 py-8 sm:px-8", verdictTone(result.verdict))}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-300/90">
              {verdictLabel(result.verdict)}
            </p>
            <p className="mt-2 font-display text-2xl font-semibold leading-snug tracking-tight text-zinc-50 sm:text-3xl">
              {result.headline}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              {result.detail}
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-zinc-500">Depois das contas</dt>
                <dd className="mt-0.5 tabular-nums text-zinc-200">
                  {result.afterBills.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </dd>
              </div>
              {result.purchase > 0 ? (
                <div>
                  <dt className="text-zinc-500">A compra</dt>
                  <dd className="mt-0.5 tabular-nums text-zinc-200">
                    {result.purchase.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-zinc-500">Restante</dt>
                <dd className="mt-0.5 tabular-nums text-zinc-200">
                  {result.remaining.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => void onShare()}
              className="mt-6 text-sm text-sky-300 underline-offset-2 hover:underline"
            >
              Copiar para o Stories
            </button>
          </LandingNeonFrame>
        ) : (
          <p className="mt-8 text-sm text-zinc-500">
            Preencha a renda para ver o restante deste mês.
          </p>
        )}

        {result ? (
          <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 sm:px-6">
            <p className="font-display text-lg font-semibold text-zinc-100">
              Quer esse número vivo no app?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              No Orbyva o restante atualiza com os lançamentos.{" "}
              {PLANS.free.priceLabel}, sem cartão.
            </p>
            <Link
              to="/login?mode=signup"
              onClick={() => track("cabe_no_mes_cta_trial")}
              className="mt-5 inline-flex h-10 items-center rounded-full bg-sky-400 px-5 text-sm font-semibold text-sky-950 hover:bg-sky-300"
            >
              Começar {PLANS.free.priceLabel}
            </Link>
          </section>
        ) : null}

        <p className="mt-10 text-sm text-zinc-500">
          Já quer o mês vivo, com lançamentos e contas?{" "}
          <Link
            to="/login?mode=signup"
            onClick={() => track("cabe_no_mes_cta_inline")}
            className="text-sky-300 underline-offset-2 hover:underline"
          >
            {PLANS.free.priceLabel}, sem cartão
          </Link>
          .
        </p>
      </PublicPageShell>
    </div>
  );
}

export default QuantoAindaCabePage;
