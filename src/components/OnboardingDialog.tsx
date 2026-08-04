import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BRAND } from "@/lib/brand";
import {
  isTourDone,
  markTourDone,
  ONBOARDING_STEPS,
} from "@/lib/onboarding";
import { ensureDefaultDimensions } from "@/domain/onboarding/defaults";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function OnboardingDialog() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) return;
    if (!isTourDone(userId)) {
      setOpen(true);
      track("onboarding_start");
    }
  }, [userId]);

  if (!userId) return null;

  const current = ONBOARDING_STEPS[step];
  const isLast = step === ONBOARDING_STEPS.length - 1;

  function finish(opts?: { goTo?: string }) {
    markTourDone(userId!);
    track("onboarding_complete", { skipped: false });
    setOpen(false);
    if (opts?.goTo) navigate(opts.goTo);
  }

  function skip() {
    markTourDone(userId!);
    track("onboarding_complete", { skipped: true });
    setOpen(false);
    navigate("/home");
  }

  async function handleNext() {
    track("onboarding_step", { id: current.id, step });

    if (current.id === "dimensions") {
      setBusy(true);
      try {
        const result = await ensureDefaultDimensions();
        if (result.missingNatures.length) {
          toast({
            title: "Configuração incompleta",
            description:
              "Ainda faltam categorias básicas. Recarregue a página ou fale conosco se o problema continuar.",
            variant: "destructive",
          });
        } else if (result.createdTypes || result.createdClasses) {
          toast({
            title: "Categorias prontas",
            description: `${result.createdTypes} categorias e ${result.createdClasses} subcategorias criadas.`,
            duration: 2500,
          });
        }
      } catch (error) {
        toast({
          title: "Não foi possível semear categorias",
          description: getErrorMessage(
            error,
            "Não foi possível preparar as categorias. Tente de novo."
          ),
          variant: "destructive",
        });
        setBusy(false);
        return;
      } finally {
        setBusy(false);
      }
    }

    if (isLast) {
      finish({ goTo: "/finance/budget" });
      return;
    }
    setStep((s) => s + 1);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) skip();
        else setOpen(true);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription>{current.body}</DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Passo {step + 1} de {ONBOARDING_STEPS.length} · {BRAND.tagline}
        </p>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={skip} disabled={busy}>
            Pular e explorar o app
          </Button>
          <div className="flex flex-wrap gap-2">
            {current.id === "first-tx" ? (
              <Button
                onClick={() => finish({ goTo: "/finance/transactions" })}
                disabled={busy}
              >
                Registrar 1ª transação
              </Button>
            ) : null}
            {current.id === "budget" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => finish({ goTo: "/home" })}
                  disabled={busy}
                >
                  Agora não
                </Button>
                <Button
                  onClick={() => finish({ goTo: "/finance/budget" })}
                  disabled={busy}
                >
                  Definir orçamento
                </Button>
              </>
            ) : null}
            {current.id !== "first-tx" && current.id !== "budget" ? (
              <Button onClick={() => void handleNext()} disabled={busy}>
                {busy
                  ? "Criando categorias e subcategorias..."
                  : current.id === "dimensions"
                    ? "Criar categorias e subcategorias"
                    : "Continuar"}
              </Button>
            ) : null}
            {current.id === "first-tx" ? (
              <Button
                variant="outline"
                onClick={() => void handleNext()}
                disabled={busy}
              >
                Já registrei · continuar
              </Button>
            ) : null}
          </div>
        </DialogFooter>

        {current.id === "budget" ? (
          <p className="text-center text-xs text-muted-foreground">
            Ou{" "}
            <Link
              to="/home"
              className="underline underline-offset-2"
              onClick={() => finish()}
            >
              ir ao início
            </Link>
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
