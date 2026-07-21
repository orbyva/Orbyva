import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

  function finish() {
    markTourDone(userId!);
    track("onboarding_complete", { skipped: false });
    setOpen(false);
  }

  function skip() {
    markTourDone(userId!);
    track("onboarding_complete", { skipped: true });
    setOpen(false);
  }

  async function handleNext() {
    track("onboarding_step", { id: current.id, step });

    if (current.id === "dimensions") {
      setBusy(true);
      try {
        const result = await ensureDefaultDimensions();
        if (result.missingNatures.length) {
          toast({
            title: "Naturezas faltando",
            description: `Rode scripts/seed_natures.sql no Supabase (${result.missingNatures.join(", ")}).`,
            variant: "destructive",
          });
        } else if (result.createdTypes || result.createdClasses) {
          toast({
            title: "Categorias prontas",
            description: `${result.createdTypes} tipos e ${result.createdClasses} classes criados.`,
            duration: 2500,
          });
        }
      } catch (error) {
        toast({
          title: "Não foi possível semear categorias",
          description: getErrorMessage(error),
          variant: "destructive",
        });
        setBusy(false);
        return;
      } finally {
        setBusy(false);
      }
    }

    if (isLast) {
      finish();
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
            Pular
          </Button>
          <div className="flex flex-wrap gap-2">
            {current.id === "first-tx" ? (
              <Button variant="outline" asChild>
                <Link
                  to="/finance/transactions"
                  onClick={() => {
                    markTourDone(userId);
                    track("onboarding_goto_first_tx");
                    setOpen(false);
                  }}
                >
                  Ir às transações
                </Link>
              </Button>
            ) : null}
            {current.id === "explore" ? (
              <Button variant="outline" asChild>
                <Link to="/home" onClick={finish}>
                  Ver início
                </Link>
              </Button>
            ) : null}
            <Button onClick={() => void handleNext()} disabled={busy}>
              {busy
                ? "Criando tipos e classes..."
                : isLast
                  ? "Começar"
                  : current.id === "dimensions"
                    ? "Criar tipos e classes"
                    : "Continuar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
