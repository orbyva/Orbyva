import { useEffect, useState } from "react";
import {
  EXT_APP_SOURCE,
  isExtMessage,
  type ExtractedPage,
} from "@/domain/extension/pageContext";

function isTrustedExtensionOrigin(origin: string): boolean {
  return origin.startsWith("chrome-extension://");
}

/**
 * Contexto da aba atual, enviado pelo painel da extensão via postMessage.
 */
export function useExtensionPageContext(): {
  embedded: boolean;
  page: ExtractedPage | null;
} {
  const [embedded, setEmbedded] = useState(
    () => typeof window !== "undefined" && window.parent !== window
  );
  const [page, setPage] = useState<ExtractedPage | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isTrustedExtensionOrigin(event.origin) && event.source !== window.parent) {
        return;
      }
      if (!isExtMessage(event.data)) return;
      if (event.data.type === "HELLO") {
        setEmbedded(true);
        return;
      }
      if (event.data.type === "PAGE_CONTEXT") {
        setEmbedded(true);
        setPage(event.data.payload);
      }
    }

    window.addEventListener("message", onMessage);
    if (window.parent !== window) {
      window.parent.postMessage(
        { source: EXT_APP_SOURCE, type: "READY" },
        "*"
      );
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return { embedded, page };
}
