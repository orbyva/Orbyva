"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/FormField";
import {
  FormDialogShell,
  FormFooter,
} from "@/components/FormDialogShell";
import { FormSection } from "@/components/FormSection";

type DuplicateBudgetMode = "missing_only" | "replace";

interface DuplicateBudgetDialogProps {
  currentMonth: number;
  currentYear: number;
  disabled?: boolean;
  onDuplicate: (
    months: string[],
    mode: DuplicateBudgetMode
  ) => Promise<void>;
}

function getNextMonths(month: number, year: number, count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month - 1 + index + 1, 1);

    const budgetMonth = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}-01`;

    const label = date.toLocaleString("pt-BR", {
      month: "long",
      year: "numeric",
    });

    return {
      value: budgetMonth,
      label: label.charAt(0).toUpperCase() + label.slice(1),
    };
  });
}

export function DuplicateBudgetDialog({
  currentMonth,
  currentYear,
  disabled = false,
  onDuplicate,
}: DuplicateBudgetDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [mode, setMode] = useState<DuplicateBudgetMode>("missing_only");
  const [loading, setLoading] = useState(false);

  const months = getNextMonths(currentMonth, currentYear);

  function toggleMonth(month: string) {
    setSelectedMonths((prev) =>
      prev.includes(month)
        ? prev.filter((item) => item !== month)
        : [...prev, month]
    );
  }

  function close() {
    setSelectedMonths([]);
    setMode("missing_only");
    setOpen(false);
  }

  async function handleDuplicate() {
    if (selectedMonths.length === 0) return;

    setLoading(true);

    try {
      await onDuplicate(selectedMonths, mode);
      close();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Copy className="mr-2 h-4 w-4" />
          Duplicar orçamento
        </Button>
      </DialogTrigger>

      <FormDialogShell
        title="Duplicar orçamento"
        description="Copie o planejamento do mês atual para os próximos meses."
        footer={
          <FormFooter
            onCancel={close}
            onSubmit={() => void handleDuplicate()}
            submitLabel={loading ? "Duplicando…" : "Duplicar"}
            loading={loading}
            submitDisabled={selectedMonths.length === 0}
          />
        }
      >
        <FormSection title="Como duplicar?">
          <FormField label="Modo" required>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="duplicate-mode"
                  value="missing_only"
                  checked={mode === "missing_only"}
                  onChange={(event) =>
                    setMode(event.target.value as DuplicateBudgetMode)
                  }
                  className="accent-primary"
                />
                Duplicar só faltantes
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="duplicate-mode"
                  value="replace"
                  checked={mode === "replace"}
                  onChange={(event) =>
                    setMode(event.target.value as DuplicateBudgetMode)
                  }
                  className="accent-primary"
                />
                Duplicar e substituir
              </label>
            </div>
          </FormField>
        </FormSection>

        <FormSection title="Meses de destino">
          <div className="grid grid-cols-1 gap-2">
            {months.map((month) => (
              <label
                key={month.value}
                className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition ${
                  selectedMonths.includes(month.value)
                    ? "border-primary bg-primary/10"
                    : "hover:bg-muted/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedMonths.includes(month.value)}
                  onChange={() => toggleMonth(month.value)}
                  className="accent-primary"
                />
                <span className="text-sm font-medium">{month.label}</span>
              </label>
            ))}
          </div>
        </FormSection>
      </FormDialogShell>
    </Dialog>
  );
}
