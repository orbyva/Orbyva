import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MARKDOWN_PREVIEW_CLASS =
  "min-h-[80px] space-y-2 text-sm [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_del]:text-muted-foreground [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium [&_ul]:list-disc";

/** Campo de descrição com abas Escrever/Visualizar — Markdown + GFM (listas, tabela, riscado, checklist). */
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
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Descrição em Markdown — listas, **negrito**, tabelas, checklist…"
        />
      </TabsContent>
      <TabsContent value="preview" className="mt-1.5 rounded-md border px-3 py-2">
        {value.trim() ? (
          <div className={MARKDOWN_PREVIEW_CLASS}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nada para visualizar ainda.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
