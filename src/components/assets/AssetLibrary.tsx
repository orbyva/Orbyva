import { useState } from "react";
import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/FormLabel";
import { cn } from "@/lib/utils";
import type { IconAsset } from "@/types/tasks";
import { AssetUploadControls } from "./AssetUploadControls";
import { useAssetLibrary, type AssetLibraryController } from "./useAssetLibrary";

/** Lista vazia: diz o que fazer, não só que não há nada. */
export const ICON_LIBRARY_EMPTY = "Nenhum ícone seu ainda — envie uma imagem ou cole um SVG.";
/** Falha ao carregar a biblioteca. Uma linha, sem derrubar o resto da tela: no popover de ícone,
 * escolher um preset continua funcionando com a lista fora do ar. */
export const ICON_LIBRARY_ERROR = "Não foi possível carregar seus ícones.";
/** A linha do confirmar-exclusão. Excluir tira da lista e **não** apaga o arquivo: as tarefas que
 * já usam aquela URL continuam mostrando o ícone. Dizer isso antes evita o susto de achar que se
 * está quebrando as tarefas antigas. */
export const ICON_DELETE_WARNING =
  "Sai só da lista — as tarefas que já usam este ícone continuam com ele.";

/**
 * A biblioteca de assets do usuário (feature 086), montável em qualquer lugar (feature 131): o
 * cabeçalho com o alternador "Gerenciar", a grade de assets, o modo de renomear/excluir e as duas
 * formas de acrescentar um asset novo.
 *
 * **Ela não decide o que um clique significa.** Sem `onSelect` os itens não são clicáveis — é o que
 * impede um painel novo de nascer com botão que não faz nada; com `onSelect`, quem monta decide se
 * aquilo vira o ícone de uma tarefa ou vai para o clipboard.
 *
 * **O asset é sempre desenhado por `<img>`, nunca inline** — é a segunda barreira da 086: um SVG
 * carregado por `<img>` roda em modo restrito, sem script e sem acesso ao documento.
 */
export function AssetLibrary({
  title,
  enabled = false,
  library,
  selectedUrl,
  onSelect,
  selectLabel,
  onUploaded,
  emptyHint = ICON_LIBRARY_EMPTY,
  pasting,
  onPastingChange,
  markup,
  onMarkupChange,
  uploadTrailing,
}: {
  /**
   * Rótulo da seção. "Meus ícones" no popover de tarefa. **Opcional**: quem já rotula a
   * biblioteca por fora (o cabeçalho do painel "Orbyva Assets" da 132) omite, em vez de mostrar o
   * mesmo nome duas vezes um abaixo do outro.
   */
  title?: string;
  /** Liga o carregamento preguiçoso da lista. Ignorado quando `library` vem de fora. */
  enabled?: boolean;
  /**
   * O controlador já criado por quem monta. Existe porque o `PopoverContent` do Radix **desmonta**
   * os filhos ao fechar: se o estado da lista morasse aqui dentro, cada abertura do popover de
   * ícone refaria a busca e perderia o asset recém-enviado. Quem vive dentro de algo que desmonta
   * chama `useAssetLibrary` acima e passa o resultado; quem não, só passa `enabled`.
   */
  library?: AssetLibraryController;
  /** URL do asset em uso, para marcá-lo na grade. */
  selectedUrl?: string | null;
  onSelect?: (asset: IconAsset) => void;
  /**
   * `aria-label` de cada asset clicável. O padrão é o nome do asset — o que basta no popover de
   * tarefa, onde escolher é a única coisa que um clique faz. Onde o clique tem outro significado o
   * rótulo precisa dizer qual: no painel do canvas (132) ele é `Copiar <nome>`, porque o botão
   * copia a URL em vez de selecionar o ícone.
   */
  selectLabel?: (asset: IconAsset) => string;
  /** Um asset acabou de ser criado. Ele já entra na lista sozinho; isto é para o resto. */
  onUploaded?: (asset: IconAsset) => void;
  emptyHint?: string;
  /** Campo de colar controlado de fora — ver `pastedSvg.ts`. Sem estes, a própria biblioteca
   * guarda o estado e o campo abre só pelo botão "Colar SVG". */
  pasting?: boolean;
  onPastingChange?: (next: boolean) => void;
  markup?: string;
  onMarkupChange?: (next: string) => void;
  /** Encaixe no fim da linha de botões de upload. */
  uploadTrailing?: ReactNode;
}) {
  const own = useAssetLibrary({ enabled: library ? false : enabled });
  const { assets, loading, error, busyId, adopt, rename, remove } = library ?? own;

  /** Modo "gerenciar": a mesma lista, em linhas, com renomear e excluir. Fica atrás de um clique
   * porque o caso comum é **escolher** um asset, não editar a biblioteca. */
  const [managing, setManaging] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const [ownPasting, setOwnPasting] = useState(false);
  const [ownMarkup, setOwnMarkup] = useState("");
  const pastingValue = pasting ?? ownPasting;
  const setPasting = onPastingChange ?? setOwnPasting;
  const markupValue = markup ?? ownMarkup;
  const setMarkup = onMarkupChange ?? setOwnMarkup;

  function startRename(asset: IconAsset) {
    setConfirmingId(null);
    setRenamingId(asset.id);
    setRenameValue(asset.name);
  }

  async function confirmRename(asset: IconAsset) {
    const name = renameValue.trim();
    if (!name || name === asset.name) {
      setRenamingId(null);
      return;
    }
    if (await rename(asset, name)) setRenamingId(null);
  }

  async function confirmDelete(asset: IconAsset) {
    if (await remove(asset)) setConfirmingId(null);
  }

  return (
    <>
      <div className="space-y-1.5 border-t pt-2.5">
        <div className="flex items-center gap-2">
          {title && <FormLabel>{title}</FormLabel>}
          {assets.length > 0 && !loading && (
            <button
              type="button"
              className="ml-auto text-[10px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => {
                setManaging((prev) => !prev);
                setRenamingId(null);
                setConfirmingId(null);
              }}
            >
              {managing ? "Concluir" : "Gerenciar"}
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex gap-1.5" role="status" aria-label="Carregando seus ícones">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 w-8 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : error ? (
          <p className="text-[10px] text-muted-foreground">{ICON_LIBRARY_ERROR}</p>
        ) : assets.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">{emptyHint}</p>
        ) : managing ? (
          <ul className="space-y-1">
            {assets.map((asset) => (
              <li key={asset.id} className="rounded-md border px-1.5 py-1">
                {renamingId === asset.id ? (
                  <div className="flex items-center gap-1">
                    <img src={asset.url} alt="" className="h-4 w-4 shrink-0 object-contain" />
                    <Input
                      aria-label={`Novo nome de ${asset.name}`}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="h-6 flex-1 px-1.5 text-[11px]"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={busyId === asset.id}
                      onClick={() => void confirmRename(asset)}
                    >
                      Salvar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setRenamingId(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : confirmingId === asset.id ? (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">
                      Excluir “{asset.name}”? {ICON_DELETE_WARNING}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 flex-1 text-[10px]"
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-6 flex-1 bg-destructive text-[10px] text-destructive-foreground hover:bg-destructive/90"
                        disabled={busyId === asset.id}
                        onClick={() => void confirmDelete(asset)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <img src={asset.url} alt="" className="h-4 w-4 shrink-0 object-contain" />
                    <span className="flex-1 truncate text-[11px]">{asset.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground"
                      aria-label={`Renomear ${asset.name}`}
                      onClick={() => startRename(asset)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground"
                      aria-label={`Excluir ${asset.name}`}
                      onClick={() => {
                        setRenamingId(null);
                        setConfirmingId(asset.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {assets.map((asset) => {
              const selected = !!selectedUrl && selectedUrl === asset.url;
              const tile = cn(
                "flex h-8 w-8 items-center justify-center rounded-md border",
                onSelect && "hover:bg-muted",
                selected && "border-primary bg-primary/10"
              );
              // Sem `onSelect` não há o que um clique faria: o asset vira uma miniatura rotulada
              // pelo `alt`, e não um botão morto.
              return onSelect ? (
                <button
                  key={asset.id}
                  type="button"
                  aria-label={selectLabel ? selectLabel(asset) : asset.name}
                  // Só é botão de alternar onde existe "o asset em uso" (o ícone da tarefa). Onde o
                  // clique é uma ação — copiar o link, no painel do canvas — `aria-pressed` seria
                  // um estado de seleção que não existe, anunciado em toda leitura de tela.
                  aria-pressed={selectedUrl === undefined ? undefined : selected}
                  onClick={() => onSelect(asset)}
                  className={tile}
                >
                  <img src={asset.url} alt="" className="h-4 w-4 object-contain" />
                </button>
              ) : (
                <div key={asset.id} className={tile}>
                  <img src={asset.url} alt={asset.name} className="h-4 w-4 object-contain" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AssetUploadControls
        onUploaded={(asset) => {
          adopt(asset);
          onUploaded?.(asset);
        }}
        pasting={pastingValue}
        onPastingChange={setPasting}
        markup={markupValue}
        onMarkupChange={setMarkup}
        trailing={uploadTrailing}
      />
    </>
  );
}
