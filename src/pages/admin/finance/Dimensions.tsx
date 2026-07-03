import { useState, useEffect } from "react";

import { Nature, Type } from "@/types/finance";

import TypeManager from "./components/TypeManager";
import ClassManager from "../home/components/ClassManager";

import { fetchNatures, fetchTypes } from "@/api/finance";

export default function Dimensions() {
  const [natures, setNatures] = useState<Nature[]>([]);
  const [types, setTypes] = useState<Type[]>([]);

  function refreshNatures() {
    fetchNatures().then(setNatures);
  }

  function refreshTypes() {
    fetchTypes().then(setTypes);
  }

  useEffect(() => {
    refreshNatures();
    refreshTypes();
  }, []);

  return (
    <main
      className="
        w-full max-w-7xl mx-auto
        px-4 sm:px-6 lg:px-8
        py-6
        space-y-6
        overflow-x-hidden
      "
    >
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">
            Dimensões Financeiras
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie Tipos e Classes para organizar suas finanças.
          </p>
        </div>
      </section>

      {/* Conteúdo */}
      <section
        className="
          grid grid-cols-1
          md:grid-cols-2
          gap-4
        "
      >
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
    </main>
  );
}