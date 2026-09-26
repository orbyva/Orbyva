/**
 * Exportar nota para PDF no app — espelho enxuto do printNote do web.
 * Corpo em texto (markdown cru), sem chrome do app.
 */

export function escapePrintText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bodyToHtml(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "<p></p>";
  return trimmed
    .split(/\n{2,}/)
    .map((block) => {
      const lines = escapePrintText(block).replace(/\n/g, "<br />");
      return `<p>${lines}</p>`;
    })
    .join("\n");
}

export function buildNotePrintHtml(title: string, content: string): string {
  const safeTitle = escapePrintText(title.trim() || "Nota");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body {
      font-family: -apple-system, system-ui, Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #111;
      margin: 0;
    }
    h1 {
      font-size: 22pt;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 0 0 16pt;
    }
    p { margin: 0 0 0.7em; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${bodyToHtml(content)}
</body>
</html>`;
}
