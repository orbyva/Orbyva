import { createElement, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Root, RootContent } from "hast";
import { Check, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

/**
 * # Bloco de código colorido — ` ```ts ` (feature 069)
 *
 * O realce sincroniza pelo `rehype-highlight` (spans `hljs-*` na árvore hast). Este componente
 * embrulha o `<pre><code>` já realçado com cabeçalho e botão de copiar — sem re-picar o código e
 * sem `dangerouslySetInnerHTML`.
 *
 * Fence sem linguagem, linguagem desconhecida, ou children ainda sem cor: o bloco aparece igual,
 * só sem (ou com menos) cor. Erro de realce não é erro do texto.
 *
 * O `lowlight` fica como fallback assíncrono quando o consumidor passa só `code`/`language` sem
 * children (ex.: testes unitários do próprio bloco).
 */
export function CodeBlock({
  code,
  language,
  children,
}: {
  code: string;
  language: string | null;
  /** `<code>` (ou árvore) já realçado pelo `rehype-highlight`. */
  children?: ReactNode;
}) {
  const highlighted = useHighlighted(code, language, Boolean(children));

  return (
    <div className="markdown-code" data-testid="markdown-code">
      <div className="markdown-code-header">
        <span className="markdown-code-language">{language ?? ""}</span>
        <CopyCodeButton code={code} />
      </div>
      {children ? (
        children
      ) : (
        <pre>
          <code
            className={cn(
              language && `language-${language}`,
              highlighted && "hljs"
            )}
          >
            {highlighted ?? `${code}\n`}
          </code>
        </pre>
      )}
    </div>
  );
}

/**
 * "Copiar" no cabeçalho. É a affordance que separa "mostra código" de "trabalha com código", e o
 * que ela copia é **o texto-fonte**, não o DOM colorido — colar num editor tem que devolver
 * exatamente o que estava escrito na nota.
 */
function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch (error) {
      toast({
        title: getErrorMessage(error, "Não foi possível copiar o código."),
        variant: "destructive",
      });
    }
  }

  return (
    <button
      type="button"
      className="markdown-code-copy"
      onClick={() => void copy()}
    >
      {copied ? (
        <Check className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

const COPIED_FEEDBACK_MS = 2000;

function useHighlighted(
  code: string,
  language: string | null,
  skip: boolean
): ReactNode | null {
  const [tree, setTree] = useState<Root | null>(null);

  useEffect(() => {
    setTree(null);
    if (skip || !language) return;

    let cancelled = false;
    void (async () => {
      try {
        const lowlight = await loadLowlight();
        if (cancelled || !lowlight.registered(language)) return;
        const result = lowlight.highlight(language, code);
        if (!cancelled) setTree(result);
      } catch {
        // Chunk que não chegou: texto puro.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, language, skip]);

  if (!tree) return null;
  return hastToReact(tree.children);
}

type Lowlight = ReturnType<typeof import("lowlight").createLowlight>;

let lowlightPromise: Promise<Lowlight> | null = null;

async function loadLowlight(): Promise<Lowlight> {
  if (!lowlightPromise) {
    lowlightPromise = import("lowlight").then(({ createLowlight, common }) =>
      createLowlight(common)
    );
  }
  try {
    return await lowlightPromise;
  } catch (error) {
    lowlightPromise = null;
    throw error;
  }
}

function hastToReact(nodes: readonly RootContent[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "text") return node.value;
    if (node.type !== "element") return null;

    const children = hastToReact(node.children);
    if (node.tagName !== "span") return children;

    return createElement(
      "span",
      { key: index, className: classNameOf(node.properties?.className) },
      children
    );
  });
}

function classNameOf(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "string") return value;
  return undefined;
}
