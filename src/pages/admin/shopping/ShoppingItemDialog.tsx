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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { createShoppingItem, updateShoppingItem } from "@/api/shopping/items";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type {
  ShoppingCategory,
  ShoppingItem,
  ShoppingItemCreateRequest,
} from "@/types/shopping";

/**
 * Valor sentinela do `<Select>` para "sem categoria" — o Radix proíbe `value=""`, mesmo truque do
 * `ALL_PROJECTS = "__all__"` que a página usa no filtro de projeto. Nunca vai para o payload:
 * vira `null` no `onValueChange`.
 */
const NO_CATEGORY = "__none__";

interface ShoppingItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criar; item = editar. */
  item: ShoppingItem | null;
  categories: ShoppingCategory[];
  /**
   * Categoria pré-selecionada ao criar — vem do "Adicionar item em X" de cada seção. O "Novo item"
   * do cabeçalho manda `null` de propósito: chutar a primeira categoria da lista arquivaria o item
   * no lugar errado sem o usuário perceber.
   */
  defaultCategoryId?: string | null;
  onSaved: () => void;
}

interface ItemForm extends Omit<ShoppingItemCreateRequest, "quantity"> {
  /** O input é texto livre ("2", "0,5", "") — só vira número no submit. */
  quantity: string;
}

const emptyItem = (categoryId: string | null): ItemForm => ({
  shopping_category_id: categoryId,
  title: "",
  description: "",
  quantity: "",
  unit: "",
  provider_link: "",
  status: "pending",
});

function parseQuantity(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function ShoppingItemDialog({
  open,
  onOpenChange,
  item,
  categories,
  defaultCategoryId,
  onSaved,
}: ShoppingItemDialogProps) {
  const [form, setForm] = useState<ItemForm>(emptyItem(null));
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        shopping_category_id: item.shopping_category_id,
        title: item.title,
        description: item.description ?? "",
        quantity: item.quantity == null ? "" : String(item.quantity),
        unit: item.unit ?? "",
        provider_link: item.provider_link ?? "",
        status: item.status,
      });
      return;
    }
    setForm(emptyItem(defaultCategoryId ?? null));
  }, [open, item, defaultCategoryId, categories]);

  // Só o título prende o salvar: categoria virou opcional (reabertura 2026-08-18).
  const canSave = Boolean(form.title.trim());

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: ShoppingItemCreateRequest = {
        shopping_category_id: form.shopping_category_id,
        title: form.title.trim(),
        description: form.description?.trim() || null,
        quantity: parseQuantity(form.quantity),
        unit: form.unit?.trim() || null,
        provider_link: form.provider_link?.trim() || null,
        status: form.status,
      };
      if (item) await updateShoppingItem({ id: item.id, ...payload });
      else await createShoppingItem(payload);
      toast({ title: "Item salvo!", duration: 2000 });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar o item."),
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
          <DialogTitle>{item ? "Editar item" : "Novo item"}</DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel htmlFor="shopping-item-title" required>
              Título
            </FormLabel>
            <Input
              id="shopping-item-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Café, cabo HDMI, cadeira…"
            />
          </div>
          <div>
            <FormLabel optional>Categoria</FormLabel>
            <Select
              value={form.shopping_category_id ?? NO_CATEGORY}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  shopping_category_id: v === NO_CATEGORY ? null : v,
                })
              }
            >
              <SelectTrigger aria-label="Categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel htmlFor="shopping-item-quantity" optional>
                Quantidade
              </FormLabel>
              <Input
                id="shopping-item-quantity"
                inputMode="decimal"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                placeholder="2"
              />
            </div>
            <div>
              <FormLabel htmlFor="shopping-item-unit" optional>
                Unidade
              </FormLabel>
              <Input
                id="shopping-item-unit"
                value={form.unit ?? ""}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="kg, caixas, m…"
              />
            </div>
          </div>
          <div>
            <FormLabel htmlFor="shopping-item-provider-link" optional>
              Link do fornecedor
            </FormLabel>
            <Input
              id="shopping-item-provider-link"
              type="url"
              value={form.provider_link ?? ""}
              onChange={(e) =>
                setForm({ ...form, provider_link: e.target.value })
              }
              placeholder="https://…"
            />
          </div>
          <div>
            <FormLabel htmlFor="shopping-item-description" optional>
              Descrição
            </FormLabel>
            <Input
              id="shopping-item-description"
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <Button
            onClick={handleSave}
            className="w-full"
            disabled={saving || !canSave}
          >
            {item ? "Salvar alterações" : "Criar item"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
