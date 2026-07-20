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
import { Trash, Pen } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fetchClasses, deleteClassApi, createClassApi, updateClassApi } from "@/api/finance";
import { Class, ClassCreateRequest, ClassUpdateRequest, Type } from "@/types/finance";
import { FormLabel, ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { cn } from "@/lib/utils";

function ClassManager({ types }: { types: Type[] }) {
  const [newClass, setNewClass] = useState<ClassCreateRequest>({
    name: "",
    type_id: 0,
  });
  const [classes, setClasses] = useState<Class[]>([]);
  const [editingClass, setEditingClass] = useState<ClassUpdateRequest | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [forDeletionClass, setForDeletionClass] = useState<number | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetchClasses().then(setClasses);
  }, []);

  function handleDelete(id: number) {
    setForDeletionClass(id);
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    if (forDeletionClass) {
      await deleteClassApi(forDeletionClass);
      fetchClasses().then(setClasses);
      setConfirmOpen(false);
      setForDeletionClass(null);
    }
  }

  function cancelDelete() {
    setConfirmOpen(false);
    setForDeletionClass(null);
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
    fetchClasses().then(setClasses);
    setNewClass({ name: "", type_id: 0 });
  }

  async function handleUpdate() {
    if (editingClass && editingClass.id != null) {
      await updateClassApi(editingClass);
      fetchClasses().then(setClasses);
      setEditingClass(null);
    }
  }

  function startEditing(cls: Class) {
    setEditingClass({ id: cls.id, name: cls.name, type_id: cls.type.id });
  }

  function cancelEditing() {
    setEditingClass(null);
  }

  return (
    <Card className="max-h-none md:h-[800px]">
      <CardHeader>
        <CardTitle>Gerenciamento de Classes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                {types.map((type) => (
                  <SelectItem key={type.id} value={String(type.id)}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}

        <Button onClick={handleCreate} className="mt-4 w-full sm:w-auto">
          Adicionar Classe
        </Button>

        <div className="mt-8 border-t border-border pt-4"></div>

        <div className="mt-4 max-h-none overflow-x-auto overflow-y-auto md:max-h-[460px] md:h-[460px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Ações</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.map((cls) => (
                <TableRow key={cls.id}>
                  <TableCell>
                    {editingClass && editingClass.id === cls.id ? (
                      <Input
                        value={editingClass.name}
                        onChange={(e) =>
                          setEditingClass({ ...editingClass, name: e.target.value })
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
                        value={String(editingClass.type_id) || ""}
                        onValueChange={(value) =>
                          setEditingClass({ ...editingClass, type_id: parseInt(value) })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {types.map((type) => (
                            <SelectItem key={type.id} value={String(type.id)}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      cls.type?.name
                    )}
                  </TableCell>
                  <TableCell className="flex space-x-2">
                    {editingClass && editingClass.id === cls.id ? (
                      <>
                        <Button onClick={handleUpdate} className="p-2 text-success" variant="ghost">
                          Salvar
                        </Button>
                        <Button onClick={cancelEditing} className="p-2 text-muted-foreground" variant="ghost">
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          className={cn("p-2", ICON_EDIT_BUTTON_CLASS)}
                          onClick={() => startEditing(cls)}
                        >
                          <Pen size={16} />
                        </Button>
                        <Button variant="ghost" className="p-2 text-destructive" onClick={() => handleDelete(cls.id)}>
                          <Trash size={16} />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle>Confirmar Exclusão</DialogTitle>
          <p>Tem certeza que deseja excluir esta classe? Essa ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={cancelDelete}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default ClassManager;
