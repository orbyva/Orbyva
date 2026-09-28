import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { uploadIconAsset } from "@/api/tasks/iconAssets";
import { ASSET_ACCEPT_ATTR, assetUploadRejection } from "@/domain/tasks/assetUpload";
import type { IconAsset } from "@/types/tasks";
import { SvgIconPasteField } from "./SvgIconPasteField";

/**
 * As duas formas de acrescentar um asset à biblioteca (feature 086, extraídas do `TaskIconPicker`
 * na 131): escolher um arquivo ou colar o markup de um SVG.
 *
 * **A recusa por tamanho/tipo acontece aqui, antes da chamada** (`assetUploadRejection`): hoje um
 * arquivo de 3 MB sobe até o bucket só para voltar com a mensagem crua do Supabase em inglês. A
 * barreira de verdade continua sendo o bucket e o `uploadIconAsset` — esta é a cortesia de dizer o
 * motivo em português, com o tamanho do arquivo, sem gastar a subida.
 *
 * A **sanitização do SVG não mora aqui**: ela está dentro de `uploadIconAsset`
 * (`src/api/tasks/iconAssets.ts`), onde nenhum chamador novo consegue esquecer de chamá-la.
 *
 * O campo de colar é **controlado de fora** (`pasting`/`markup`) porque quem monta a biblioteca
 * pode querer abrir o campo por uma colagem que aconteceu num container acima — é o caso do popover
 * de ícone de tarefa, onde `Ctrl+V` sem campo focado precisa cair aqui. Ver `pastedSvg.ts`.
 */
export function AssetUploadControls({
  onUploaded,
  pasting,
  onPastingChange,
  markup,
  onMarkupChange,
  trailing,
}: {
  /** Recebe a linha já criada no banco. Quem monta decide o que fazer com ela além de listá-la. */
  onUploaded: (asset: IconAsset) => void;
  pasting: boolean;
  onPastingChange: (next: boolean) => void;
  markup: string;
  onMarkupChange: (next: string) => void;
  /** Encaixe no fim da linha de botões (o "Remover ícone" do picker de tarefa mora aqui). */
  trailing?: ReactNode;
}) {
  const [uploading, setUploading] = useState(false);
  const [savingSvg, setSavingSvg] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  function closePasteField() {
    onPastingChange(false);
    onMarkupChange("");
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const rejection = assetUploadRejection(file);
    if (rejection) {
      toast({ title: "Arquivo não aceito", description: rejection, variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const asset = await uploadIconAsset({ file });
      onUploaded(asset);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível enviar o ícone."),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveSvg({ svg, name }: { svg: string; name: string }) {
    setSavingSvg(true);
    try {
      const asset = await uploadIconAsset({ svg }, name);
      onUploaded(asset);
      closePasteField();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar o ícone."),
        variant: "destructive",
      });
    } finally {
      setSavingSvg(false);
    }
  }

  return (
    <>
      {pasting ? (
        <div className="border-t pt-2.5">
          <SvgIconPasteField
            markup={markup}
            onMarkupChange={onMarkupChange}
            onCancel={closePasteField}
            onSave={(input) => void handleSaveSvg(input)}
            saving={savingSvg}
          />
        </div>
      ) : (
        <div className="flex items-center gap-1.5 border-t pt-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading && <Loader2 className="h-3 w-3 animate-spin" />}
            Enviar imagem
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => onPastingChange(true)}
          >
            Colar SVG
          </Button>
          {trailing}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={ASSET_ACCEPT_ATTR}
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
}
