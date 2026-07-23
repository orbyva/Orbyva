import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormLabel, ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { cn, sortByNamePt } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { HexColorPicker } from "react-colorful";
import {
  TYPE_ICONS,
  TypeIcon,
  normalizeHexColor,
} from "@/components/TypeIcon";
import { Trash, Pen, Layers } from "lucide-react";
import {
  deleteTypeApi,
  createTypeApi,
  updateTypeApi,
} from "@/api/finance";
import { Type, Nature, TypeCreateRequest, TypeUpdateRequest } from "@/types/finance";
import { EmptyState } from "@/components/EmptyState";

function resolveNatureId(type: Type): number | null {
  return type.nature_id ?? type.nature?.id ?? null;
}

function resolveNatureName(type: Type, natures: Nature[]): string | null {
  const natureId = resolveNatureId(type);
  const fromList =
    natureId != null ? natures.find((n) => n.id === natureId) : undefined;
  return fromList?.name ?? type.nature?.name ?? null;
}

function TypeManager({
  natures,
  types,
  refetchTypes,
}: { natures: Nature[]; types: Type[]; refetchTypes: () => void }) {
  const [newType, setNewType] = useState<TypeCreateRequest>({
    name: "",
    hex_color: null,
    lucide_icon: null,
    nature_id: 0,
  });
  const [showNewColorPicker, setShowNewColorPicker] = useState(false);

  const [showEditColorPicker, setShowEditColorPicker] = useState(false);
  const [editingType, setEditingType] = useState<TypeUpdateRequest | null>(null);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function confirmDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteTypeApi(id);
      refetchTypes();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreate() {
    if (!newType.name.trim()) {
      setFormError("Informe o nome do tipo.");
      return;
    }
    if (!newType.nature_id) {
      setFormError("Selecione a Natureza.");
      return;
    }

    setFormError("");
    await createTypeApi({
      ...newType,
      hex_color: normalizeHexColor(newType.hex_color ?? "") ?? null,
    });
    refetchTypes();
    setNewType({ name: "", hex_color: null, lucide_icon: null, nature_id: 0 });
    setShowNewColorPicker(false);
  }

  async function handleUpdate() {
    if (editingType && editingType.id != null) {
      await updateTypeApi({
        ...editingType,
        hex_color:
          editingType.hex_color != null
            ? normalizeHexColor(editingType.hex_color) ?? editingType.hex_color
            : null,
      });
      refetchTypes();
      setEditingType(null);
      setShowEditColorPicker(false);
    }
  }

  function startEditing(type: Type) {
    const natureId = resolveNatureId(type);
    setEditingType({
      id: type.id,
      name: type.name,
      hex_color: type.hex_color,
      lucide_icon: type.lucide_icon,
      nature_id: natureId ?? 0,
    });
    setShowEditColorPicker(false);
  }

  function cancelEditing() {
    setEditingType(null);
    setShowEditColorPicker(false);
  }

  const naturesSorted = sortByNamePt(natures);

  return (
    <Card className="flex h-full min-h-0 flex-col border-0 shadow-none">
      <CardHeader className="shrink-0 px-0 pt-0">
        <CardTitle className="text-base">Tipos</CardTitle>
        <p className="text-sm text-muted-foreground">
          Agrupam suas classes (ex.: Alimentação, Transporte).
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
        <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <FormLabel required>Nome</FormLabel>
            <Input
              value={newType.name}
              onChange={(e) => setNewType({ ...newType, name: e.target.value })}
              placeholder="Ex: Alimentação"
            />
          </div>

          <div className="space-y-2">
            <FormLabel required>Natureza</FormLabel>
            <Select
              value={newType.nature_id ? String(newType.nature_id) : ""}
              onValueChange={(value) =>
                setNewType({ ...newType, nature_id: parseInt(value) })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Receita ou Despesa" />
              </SelectTrigger>
              <SelectContent>
                {naturesSorted.map((nature) => (
                  <SelectItem key={nature.id} value={String(nature.id)}>
                    {nature.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FormLabel optional>Cor</FormLabel>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-9 w-9 shrink-0 rounded-md border"
                style={{ backgroundColor: newType.hex_color || "#94a3b8" }}
                onClick={() => setShowNewColorPicker((v) => !v)}
                aria-label="Escolher cor"
              />
              <Input
                value={newType.hex_color ?? ""}
                onChange={(e) =>
                  setNewType({ ...newType, hex_color: e.target.value || null })
                }
                onBlur={() => {
                  const n = normalizeHexColor(newType.hex_color ?? "");
                  if (n) setNewType({ ...newType, hex_color: n });
                }}
                placeholder="#0ea5e9"
                className="font-mono uppercase"
              />
            </div>
            {showNewColorPicker ? (
              <HexColorPicker
                color={newType.hex_color || "#94a3b8"}
                onChange={(color) => setNewType({ ...newType, hex_color: color })}
              />
            ) : null}
          </div>

          <div className="space-y-2">
            <FormLabel optional>Ícone</FormLabel>
            <Select
              value={newType.lucide_icon ?? ""}
              onValueChange={(value) =>
                setNewType({
                  ...newType,
                  lucide_icon: value === "none" ? null : value,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Ícone" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">
                  <span>Nenhum</span>
                </SelectItem>
                {TYPE_ICONS.map((icon) => (
                  <SelectItem key={icon.id} value={icon.id}>
                    <span className="flex items-center gap-2">
                      <TypeIcon name={icon.id} className="h-4 w-4" />
                      {icon.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {formError ? (
          <p className="mt-3 shrink-0 text-sm text-destructive">{formError}</p>
        ) : null}

        <Button
          onClick={() => void handleCreate()}
          className="mt-4 w-full shrink-0 sm:w-auto"
        >
          Adicionar tipo
        </Button>

        <div className="mt-6 flex min-h-0 flex-1 flex-col border-t pt-4">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell>Nome</TableCell>
                  <TableCell>Natureza</TableCell>
                  <TableCell className="w-[100px]">Ações</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="p-0">
                      <EmptyState
                        icon={Layers}
                        title="Nenhum tipo ainda"
                        description={
                          natures.length === 0
                            ? "Rode scripts/seed_natures.sql no Supabase e recarregue, ou use o tour de onboarding."
                            : "Crie o primeiro tipo acima (ex.: Alimentação, Transporte)."
                        }
                        className="py-10"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  types.map((type) => (
                    <TableRow key={type.id}>
                      <TableCell>
                        {editingType && editingType.id === type.id ? (
                          <div className="space-y-2 py-1">
                            <Input
                              value={editingType.name ?? ""}
                              onChange={(e) =>
                                setEditingType({
                                  ...editingType,
                                  name: e.target.value,
                                })
                              }
                              placeholder="Nome do tipo"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="h-8 w-8 shrink-0 rounded-md border"
                                style={{
                                  backgroundColor:
                                    editingType.hex_color || "#94a3b8",
                                }}
                                onClick={() =>
                                  setShowEditColorPicker((v) => !v)
                                }
                                aria-label="Escolher cor"
                              />
                              <Input
                                value={editingType.hex_color ?? ""}
                                onChange={(e) =>
                                  setEditingType({
                                    ...editingType,
                                    hex_color: e.target.value || null,
                                  })
                                }
                                onBlur={() => {
                                  const n = normalizeHexColor(
                                    editingType.hex_color ?? ""
                                  );
                                  if (n) {
                                    setEditingType({
                                      ...editingType,
                                      hex_color: n,
                                    });
                                  }
                                }}
                                placeholder="#hex"
                                className="h-8 w-[7.5rem] font-mono uppercase"
                              />
                              <Select
                                value={editingType.lucide_icon ?? "none"}
                                onValueChange={(value) =>
                                  setEditingType({
                                    ...editingType,
                                    lucide_icon:
                                      value === "none" ? null : value,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 min-w-[9rem] flex-1">
                                  <SelectValue placeholder="Ícone" />
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                  <SelectItem value="none">Nenhum</SelectItem>
                                  {TYPE_ICONS.map((icon) => (
                                    <SelectItem key={icon.id} value={icon.id}>
                                      <span className="flex items-center gap-2">
                                        <TypeIcon
                                          name={icon.id}
                                          className="h-4 w-4"
                                        />
                                        {icon.label}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {showEditColorPicker ? (
                              <HexColorPicker
                                color={editingType.hex_color || "#94a3b8"}
                                onChange={(color) =>
                                  setEditingType({
                                    ...editingType,
                                    hex_color: color,
                                  })
                                }
                              />
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md"
                              style={{
                                backgroundColor: type.hex_color || undefined,
                              }}
                            >
                              <TypeIcon
                                name={type.lucide_icon}
                                className="h-3.5 w-3.5"
                              />
                            </span>
                            <span className="font-medium">{type.name}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingType && editingType.id === type.id ? (
                          <Select
                            value={
                              editingType.nature_id
                                ? String(editingType.nature_id)
                                : ""
                            }
                            onValueChange={(value) =>
                              setEditingType({
                                ...editingType,
                                nature_id: parseInt(value),
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Natureza" />
                            </SelectTrigger>
                            <SelectContent>
                              {naturesSorted.map((nature) => (
                                <SelectItem
                                  key={nature.id}
                                  value={String(nature.id)}
                                >
                                  {nature.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          resolveNatureName(type, natures)
                        )}
                      </TableCell>
                      <TableCell>
                        {editingType && editingType.id === type.id ? (
                          <div className="flex gap-1">
                            <Button
                              onClick={() => void handleUpdate()}
                              className="h-8 px-2 text-xs text-success"
                              variant="ghost"
                            >
                              Salvar
                            </Button>
                            <Button
                              onClick={cancelEditing}
                              className="h-8 px-2 text-xs"
                              variant="ghost"
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              className={cn("h-8 p-2", ICON_EDIT_BUTTON_CLASS)}
                              onClick={() => startEditing(type)}
                            >
                              <Pen size={16} />
                            </Button>
                            <ConfirmDeleteDialog
                              title="Excluir este tipo?"
                              description={`"${type.name}" e o vínculo com classes podem ser afetados. Essa ação não pode ser desfeita.`}
                              loading={deletingId === type.id}
                              onConfirm={() => confirmDelete(type.id)}
                            >
                              <Button
                                variant="ghost"
                                className="h-8 p-2 text-destructive"
                              >
                                <Trash size={16} />
                              </Button>
                            </ConfirmDeleteDialog>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default TypeManager;
