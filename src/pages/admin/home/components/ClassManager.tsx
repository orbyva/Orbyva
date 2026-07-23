import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Trash, Pen, Tags } from "lucide-react";
import { fetchClasses, deleteClassApi, createClassApi, updateClassApi } from "@/api/finance";
import { Class, ClassCreateRequest, ClassUpdateRequest, Type } from "@/types/finance";
import { FormLabel, ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { repairOrphanClasses } from "@/domain/onboarding/defaults";
import { useToast } from "@/hooks/use-toast";
import { cn, sortByNamePt } from "@/lib/utils";

function resolveTypeId(cls: Class): number | null {
  return cls.type?.id ?? cls.type_id ?? null;
}

function resolveTypeName(cls: Class, types: Type[]): string | null {
  const typeId = resolveTypeId(cls);
  const fromList =
    typeId != null ? types.find((t) => t.id === typeId) : undefined;
  return fromList?.name ?? cls.type?.name ?? null;
}

function ClassManager({ types }: { types: Type[] }) {
  const [newClass, setNewClass] = useState<ClassCreateRequest>({
    name: "",
    type_id: 0,
  });
  const [classes, setClasses] = useState<Class[]>([]);
  const [editingClass, setEditingClass] = useState<ClassUpdateRequest | null>(null);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (types.length > 0) {
        const repaired = await repairOrphanClasses(types);
        if (repaired > 0 && !cancelled) {
          toast({
            title: "Classes religadas",
            description: `${repaired} classe(s) órfã(s) foram associadas a um tipo válido.`,
            duration: 3500,
          });
        }
      }
      const list = await fetchClasses();
      if (!cancelled) setClasses(list);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [types, toast]);

  async function confirmDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteClassApi(id);
      setClasses(await fetchClasses());
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreate() {
    if (!newClass.name.trim()) {
      setFormError("Informe o nome da classe.");
      return;
    }
    if (!newClass.type_id) {
      setFormError("Selecione o Tipo.");
      return;
    }

    setFormError("");
    await createClassApi(newClass);
    setClasses(await fetchClasses());
    setNewClass({ name: "", type_id: 0 });
  }

  async function handleUpdate() {
    if (editingClass && editingClass.id != null) {
      await updateClassApi(editingClass);
      setClasses(await fetchClasses());
      setEditingClass(null);
    }
  }

  function startEditing(cls: Class) {
    const typeId = resolveTypeId(cls);
    setEditingClass({
      id: cls.id,
      name: cls.name,
      type_id: typeId ?? 0,
    });
  }

  function cancelEditing() {
    setEditingClass(null);
  }

  const typesByNature = sortByNamePt(types);

  return (
    <Card className="flex h-full min-h-0 flex-col border-0 shadow-none">
      <CardHeader className="shrink-0 px-0 pt-0">
        <CardTitle className="text-base">Classes</CardTitle>
        <p className="text-sm text-muted-foreground">
          Detalham o gasto ou receita (ex.: Supermercado, Uber).
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
        <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <FormLabel required>Nome</FormLabel>
            <Input
              value={newClass.name}
              onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
              placeholder="Ex: Supermercado, Uber..."
            />
          </div>

          <div className="space-y-2">
            <FormLabel required>Tipo</FormLabel>
            <Select
              value={newClass.type_id ? String(newClass.type_id) : ""}
              onValueChange={(value) =>
                setNewClass({ ...newClass, type_id: parseInt(value) })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o Tipo" />
              </SelectTrigger>
              <SelectContent>
                {typesByNature.map((type) => (
                  <SelectItem key={type.id} value={String(type.id)}>
                    {type.name}
                    {type.nature?.name ? ` (${type.nature.name})` : ""}
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
          Adicionar classe
        </Button>

        <div className="mt-6 flex min-h-0 flex-1 flex-col border-t pt-4">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell>Nome</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell className="w-[100px]">Ações</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="p-0">
                      <EmptyState
                        icon={Tags}
                        title="Nenhuma classe ainda"
                        description={
                          types.length === 0
                            ? "Crie um tipo primeiro; depois adicione classes (ex.: Mercado, Uber)."
                            : "Crie a primeira classe acima para classificar suas transações."
                        }
                        className="py-10"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  classes.map((cls) => {
                    const typeName = resolveTypeName(cls, types);
                    return (
                      <TableRow key={cls.id}>
                        <TableCell>
                          {editingClass && editingClass.id === cls.id ? (
                            <Input
                              value={editingClass.name ?? ""}
                              onChange={(e) =>
                                setEditingClass({
                                  ...editingClass,
                                  name: e.target.value,
                                })
                              }
                              placeholder="Nome da classe"
                            />
                          ) : (
                            cls.name
                          )}
                        </TableCell>
                        <TableCell>
                          {editingClass && editingClass.id === cls.id ? (
                            <Select
                              value={
                                editingClass.type_id
                                  ? String(editingClass.type_id)
                                  : ""
                              }
                              onValueChange={(value) =>
                                setEditingClass({
                                  ...editingClass,
                                  type_id: parseInt(value),
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o Tipo" />
                              </SelectTrigger>
                              <SelectContent>
                                {typesByNature.map((type) => (
                                  <SelectItem
                                    key={type.id}
                                    value={String(type.id)}
                                  >
                                    {type.name}
                                    {type.nature?.name
                                      ? ` (${type.nature.name})`
                                      : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : typeName ? (
                            typeName
                          ) : (
                            <span className="text-muted-foreground">Sem tipo</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingClass && editingClass.id === cls.id ? (
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
                                onClick={() => startEditing(cls)}
                              >
                                <Pen size={16} />
                              </Button>
                              <ConfirmDeleteDialog
                                title="Excluir esta classe?"
                                description={`"${cls.name}" será removida. Transações antigas podem ficar sem essa classificação.`}
                                loading={deletingId === cls.id}
                                onConfirm={() => confirmDelete(cls.id)}
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
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ClassManager;
