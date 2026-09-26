/** Meta title/description/OG por rota (client-side SPA; capturado no prerender). */
import { useEffect } from "react";
import { DEFAULT_OG_IMAGE, SITE_URL } from "@/lib/seo";

const SITE = SITE_URL;
const DEFAULT_IMAGE = DEFAULT_OG_IMAGE;

export type DocumentMetaInput = {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  /** Se false, não prefixa com Orbyva, */
  brandSuffix?: boolean;
  /** noindex,nofollow: auth e app privado */
  noIndex?: boolean;
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
  upsertMeta("property", "og:site_name", "Orbyva");
  upsertMeta("property", "og:locale", "pt_BR");
  upsertMeta("property", "og:type", "website");
  upsertMeta("name", "twitter:card", "summary_large_image");
  upsertMeta("name", "application-name", "Orbyva");

  if (input.noIndex) {
    upsertMeta("name", "robots", "noindex, nofollow");
  } else {
    const robots = document.head.querySelector<HTMLMetaElement>(
      'meta[name="robots"]'
    );
    if (robots?.getAttribute("content")?.includes("noindex")) {
      robots.setAttribute("content", "index, follow");
    }
  }

  const url = input.path
    ? input.path === "/"
      ? `${SITE}/`
      : `${SITE}${input.path}`
    : undefined;
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
  const { title, description, path, image, brandSuffix, noIndex } = input;
  useEffect(() => {
    applyDocumentMeta({
      title,
      description,
      path,
      image,
      brandSuffix,
      noIndex,
    });
  }, [title, description, path, image, brandSuffix, noIndex]);
}
