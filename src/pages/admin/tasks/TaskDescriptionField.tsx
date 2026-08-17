import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { MarkdownTextarea } from "@/components/MarkdownTextarea";

/**
 * Campo de descrição com abas Escrever/Visualizar — Markdown + GFM (listas, tabela, riscado,
 * checklist). O textarea (com o handler de `Tab`) e o preview são os componentes compartilhados
 * `MarkdownTextarea`/`MarkdownPreview`, os mesmos que o editor de notas usa (feature 055).
 */
export function TaskDescriptionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v === "preview" ? "preview" : "write")}>
      <TabsList className="h-8">
        <TabsTrigger value="write" className="text-xs">
          Escrever
        </TabsTrigger>
        <TabsTrigger value="preview" className="text-xs">
          Visualizar
        </TabsTrigger>
      </TabsList>
      <TabsContent value="write" className="mt-1.5">
        <MarkdownTextarea
          value={value}
          onChange={onChange}
          placeholder="Descrição em Markdown — listas, **negrito**, tabelas, checklist…"
        />
      </TabsContent>
      <TabsContent value="preview" className="mt-1.5 rounded-md border px-3 py-2">
        {value.trim() ? (
          <MarkdownPreview content={value} />
        ) : (
          <p className="text-xs text-muted-foreground">Nada para visualizar ainda.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
