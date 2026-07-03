import { PageShell } from "@/components/PageShell";
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
      title="Dimensões Financeiras"
      description="Gerencie Tipos e Classes para organizar suas finanças."
    >
      {loading ? (
        <TableLoadingSkeleton rows={4} columns={3} />
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border p-4">
            <TypeManager
              natures={natures}
              types={types}
              refetchTypes={refreshTypes}
            />
          </div>

          <div className="rounded-xl border p-4">
            <ClassManager types={types} />
          </div>
        </section>
      )}
    </PageShell>
  );
}
