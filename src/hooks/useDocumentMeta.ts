/** Meta title/description/OG por rota (client-side SPA). */
import { useEffect } from "react";

const SITE = "https://orbyva.app";
const DEFAULT_IMAGE = `${SITE}/marketing/hub.png`;

export type DocumentMetaInput = {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  /** Se false, não prefixa com Orbyva — */
  brandSuffix?: boolean;
};

function upsertMeta(
  attr: "name" | "property",
  key: string,
  content: string
) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function applyDocumentMeta(input: DocumentMetaInput) {
  const title =
    input.brandSuffix === false
      ? input.title
      : input.title.includes("Orbyva")
        ? input.title
        : `${input.title} · Orbyva`;

  document.title = title;

  if (input.description) {
    upsertMeta("name", "description", input.description);
    upsertMeta("property", "og:description", input.description);
    upsertMeta("name", "twitter:description", input.description);
  }

  upsertMeta("property", "og:title", title);
  upsertMeta("name", "twitter:title", title);

  const url = input.path ? `${SITE}${input.path}` : undefined;
  if (url) {
    upsertMeta("property", "og:url", url);
    const link =
      document.head.querySelector<HTMLLinkElement>("link[rel='canonical']") ??
      (() => {
        const l = document.createElement("link");
        l.rel = "canonical";
        document.head.appendChild(l);
        return l;
      })();
    link.href = url;
  }

  const image = input.image ?? DEFAULT_IMAGE;
  upsertMeta("property", "og:image", image);
  upsertMeta("name", "twitter:image", image);
  upsertMeta("property", "og:image:width", "1200");
  upsertMeta("property", "og:image:height", "630");
}

export function useDocumentMeta(input: DocumentMetaInput) {
  const { title, description, path, image, brandSuffix } = input;
  useEffect(() => {
    applyDocumentMeta({ title, description, path, image, brandSuffix });
  }, [title, description, path, image, brandSuffix]);
}
