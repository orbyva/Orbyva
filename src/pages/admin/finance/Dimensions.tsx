import { PageShell } from "@/components/PageShell";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import TypeManager from "./components/TypeManager";
import ClassManager from "../home/components/ClassManager";
import { fetchNatures, fetchTypes } from "@/api/finance";
import { useEffect, useState } from "react";
import type { Nature, Type } from "@/types/finance";

export default function Dimensions() {
  const [natures, setNatures] = useState<Nature[]>([]);
  const [types, setTypes] = useState<Type[]>([]);
  const [loading, setLoading] = useState(true);

  function refreshTypes() {
    fetchTypes().then(setTypes);
  }

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
      title="Dimensões"
      description="Tipos e classes são só seus — organize receitas e despesas do seu jeito."
      actions={<ModuleGuideButton moduleId="finance" />}
    >
      <ModuleGuide moduleId="finance" />
      {loading ? (
        <TableLoadingSkeleton rows={4} columns={3} />
      ) : (
        <section className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 md:gap-6 md:h-[min(720px,calc(100dvh-12rem))]">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card p-3 sm:p-5 md:min-h-0">
            <TypeManager
              natures={natures}
              types={types}
              refetchTypes={refreshTypes}
            />
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card p-3 sm:p-5 md:min-h-0">
            <ClassManager types={types} />
          </div>
        </section>
      )}
    </PageShell>
  );
}
