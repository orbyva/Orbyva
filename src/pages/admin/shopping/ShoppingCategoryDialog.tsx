import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { LabelColorPicker } from "@/pages/admin/tasks/LabelColorPicker";
import {
  createShoppingCategory,
  updateShoppingCategory,
} from "@/api/shopping/categories";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type {
  ShoppingCategory,
  ShoppingCategoryCreateRequest,
} from "@/types/shopping";

interface ShoppingCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criar; categoria = editar. */
  category: ShoppingCategory | null;
  onSaved: () => void;
}

const DEFAULT_COLOR = "#94a3b8";

const emptyCategory = (): ShoppingCategoryCreateRequest => ({
  name: "",
  description: "",
  color: null,
});

export function ShoppingCategoryDialog({
  open,
  onOpenChange,
  category,
  onSaved,
}: ShoppingCategoryDialogProps) {
  const [form, setForm] = useState<ShoppingCategoryCreateRequest>(
    emptyCategory()
  );
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setForm(
      category
        ? {
            name: category.name,
            description: category.description ?? "",
            color: category.color ?? null,
          }
        : emptyCategory()
    );
  }, [open, category]);

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim() };
      if (category) await updateShoppingCategory({ id: category.id, ...payload });
      else await createShoppingCategory(payload);
      toast({ title: "Categoria salva!", duration: 2000 });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível salvar a categoria."
        ),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            {category ? "Editar categoria" : "Nova categoria"}
          </DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel htmlFor="shopping-category-name" required>
              Nome
            </FormLabel>
            <Input
              id="shopping-category-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Mercado, Casa nova, Escritório…"
            />
          </div>
          <div>
            <FormLabel htmlFor="shopping-category-description" optional>
              Descrição
            </FormLabel>
            <Input
              id="shopping-category-description"
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <FormLabel optional>Cor</FormLabel>
            <div className="mt-1.5">
              <LabelColorPicker
                color={form.color ?? DEFAULT_COLOR}
                onChange={(color) => setForm({ ...form, color })}
              />
            </div>
          </div>
          <Button
            onClick={handleSave}
            className="w-full"
            disabled={saving || !form.name.trim()}
          >
            {category ? "Salvar alterações" : "Criar categoria"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
