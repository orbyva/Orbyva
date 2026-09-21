import { useEffect } from "react";

type JsonLdProps = {
  data: unknown | unknown[];
};

/** Injeta JSON-LD no documento (visível a crawlers após prerender). */
export function JsonLd({ data }: JsonLdProps) {
  const payloads = Array.isArray(data) ? data : [data];
  return (
    <>
      {payloads.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}

/** Meta robots noindex para rotas privadas / auth. */
export function useNoIndex(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let el = document.head.querySelector<HTMLMetaElement>(
      'meta[name="robots"]'
    );
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "robots");
      document.head.appendChild(el);
    }
    const prev = el.getAttribute("content");
    el.setAttribute("content", "noindex, nofollow");
    return () => {
      if (prev == null) el?.remove();
      else el?.setAttribute("content", prev);
    };
  }, [enabled]);
}
