/**
 * Exportar nota para PDF: um documento isolado, não o `window.print()` da página do app.
 *
 * Imprimir a rota `/notes/:id` puxa sidebar, editor, header do Chrome (`App · Orbyva` +
 * `localhost`) e ainda corta o texto — `visibility: hidden` esconde o layout mas **não tira
 * o espaço**, então saem páginas em branco e a nota fica clipada no primeiro viewport.
 */

const PRINT_STYLES = `
  @page {
    size: A4;
    margin: 16mm;
  }

  html, body {
    background: #fff;
    color: #111;
    margin: 0;
    padding: 0;
    /* Iframe A4 + height:100% vazava ~3cm (a margem) pra uma folha em branco. */
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }

  html {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-scheme: light;
  }

  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
  }

  body > :last-child {
    margin-bottom: 0 !important;
  }

  .note-print-title {
    font-size: 22pt;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
    margin: 0 0 16pt;
    page-break-after: avoid;
  }

  h1, h2, h3, h4, h5, h6 {
    color: #111;
    font-weight: 650;
    line-height: 1.25;
    margin: 1.15em 0 0.4em;
    page-break-after: avoid;
  }

  h1 { font-size: 15pt; }
  h2 { font-size: 13pt; }
  h3 { font-size: 12pt; }
  h4, h5, h6 { font-size: 11pt; }

  p, li, td, th, blockquote {
    overflow: visible;
    overflow-wrap: break-word;
    word-break: normal;
  }

  p { margin: 0 0 0.7em; }

  ul, ol {
    margin: 0 0 0.8em;
    padding-left: 1.5em;
  }

  li {
    margin: 0.2em 0;
  }

  ul { list-style: disc; }
  ol { list-style: decimal; }
  ul ul { list-style: circle; }
  ol ol { list-style: lower-alpha; }

  .contains-task-list { list-style: none; padding-left: 0.25em; }
  .task-list-item { margin-left: 0; }
  .task-list-item > input { margin-right: 0.45em; }

  a {
    color: inherit;
    text-decoration: underline;
  }

  a[aria-label="Link para esta seção"] {
    display: none !important;
  }

  button {
    all: unset;
    display: inline;
    cursor: default;
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.92em;
    background: #f4f4f5;
    padding: 0.05em 0.3em;
    border-radius: 3px;
  }

  pre {
    background: #f4f4f5;
    border: 1px solid #e4e4e7;
    border-radius: 6px;
    font-size: 9.5pt;
    line-height: 1.45;
    margin: 0 0 0.9em;
    overflow: visible;
    padding: 10pt 12pt;
    page-break-inside: avoid;
    white-space: pre-wrap;
  }

  pre code {
    background: none;
    padding: 0;
  }

  blockquote {
    border-left: 3px solid #d4d4d8;
    color: #3f3f46;
    margin: 0 0 0.9em;
    padding: 0.1em 0 0.1em 12pt;
  }

  hr {
    border: 0;
    border-top: 1px solid #e4e4e7;
    margin: 1.2em 0;
  }

  table {
    border-collapse: collapse;
    margin: 0 0 0.9em;
    width: 100%;
  }

  th, td {
    border: 1px solid #d4d4d8;
    padding: 6pt 8pt;
    text-align: left;
    vertical-align: top;
  }

  th { background: #f4f4f5; font-weight: 600; }

  tr { page-break-inside: avoid; }

  img, svg {
    max-width: 100%;
    height: auto;
    page-break-inside: avoid;
  }

  [role="note"] {
    border: 1px solid #e4e4e7;
    border-left-width: 4px;
    margin: 0 0 0.9em;
    padding: 8pt 10pt;
    page-break-inside: avoid;
  }

  .overflow-x-auto, [class*="overflow-x"] {
    overflow: visible !important;
  }

  .footnotes {
    border-top: 1px solid #e4e4e7;
    font-size: 9pt;
    margin-top: 1.5em;
    padding-top: 0.6em;
  }
`;

/** Escapa o título para `<title>` / texto; o corpo já vem em HTML do preview. */
export function escapePrintText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML completo do PDF: só a nota, A4, sem chrome do app. */
export function buildPrintHtml(title: string, bodyHtml: string): string {
  const safeTitle = escapePrintText(title.trim() || "Nota");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/**
 * Abre o diálogo de impressão num iframe isolado — "Salvar como PDF" vira o arquivo, sem
 * sidebar, sem URL da rota e sem páginas em branco do layout escondido.
 */
export function printNote(title: string, bodyHtml: string): void {
  const iframe = document.createElement("iframe");
  iframe.title = "Imprimir nota";
  iframe.setAttribute("aria-hidden", "true");
  iframe.src = "about:blank";
  // Largura de A4, altura do conteúdo — 297mm fixo virava uma folha extra (o canvas do
  // iframe é A4 cheio, a área imprimível desconta a margem, e o resto cai na página 2).
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "210mm",
    height: "1px",
    border: "0",
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(buildPrintHtml(title, bodyHtml));
  doc.close();

  const contentHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 1);
  iframe.style.height = `${contentHeight}px`;

  const cleanup = () => {
    iframe.remove();
  };
  iframe.contentWindow?.addEventListener("afterprint", cleanup);
  window.setTimeout(cleanup, 120_000);

  const print = () => iframe.contentWindow?.print();
  const images = Array.from(doc.images);
  if (images.length === 0 || images.every((img) => img.complete)) {
    window.setTimeout(print, 50);
    return;
  }
  Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
    )
  ).then(() => window.setTimeout(print, 50));
}
