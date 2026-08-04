import { PageShell } from "@/components/PageShell";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { DimensionsBoard } from "./components/DimensionsBoard";
import { fetchNatures, fetchTypes } from "@/api/finance";
import { useEffect, useState } from "react";
import type { Nature, Type } from "@/types/finance";

export default function Categories() {
  const [natures, setNatures] = useState<Nature[]>([]);
  const [types, setTypes] = useState<Type[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchNatures(), fetchTypes()])
      .then(([n, t]) => {
        setNatures(n);
        setTypes(t);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell
      title="Categorias"
      description="Organize categorias e subcategorias das suas receitas e despesas."
      actions={<ModuleGuideButton moduleId="finance" />}
    >
      <ModuleGuide moduleId="finance" />
      {loading ? (
        <TableLoadingSkeleton rows={4} columns={3} />
      ) : (
        <DimensionsBoard
          natures={natures}
          types={types}
          onTypesChange={setTypes}
        />
      )}
    </PageShell>
  );
}
