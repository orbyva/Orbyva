/** Layout HTML compartilhado dos e-mails Orbyva (pt-BR, dark). */

export function emailShell(opts: {
  eyebrow: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Link secundário ao lado do CTA principal. */
  secondaryLabel?: string;
  secondaryUrl?: string;
  footer?: string;
}): string {
  const primary =
    opts.ctaLabel && opts.ctaUrl
      ? `<a href="${opts.ctaUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px;margin-right:8px;">
            ${opts.ctaLabel}
          </a>`
      : "";
  const secondary =
    opts.secondaryLabel && opts.secondaryUrl
      ? `<a href="${opts.secondaryUrl}" style="display:inline-block;color:#38bdf8;text-decoration:none;font-weight:600;font-size:14px;padding:12px 8px;">
            ${opts.secondaryLabel}
          </a>`
      : "";
  const cta =
    primary || secondary
      ? `<p style="margin:28px 0 0;">${primary}${secondary}</p>`
      : "";

  const footer =
    opts.footer ??
    "Se não quiser mais estes e-mails, abra Conta no app e desative o envio — ou ignore esta mensagem.";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#070b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#070b14;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#0f1623;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px;">
        <tr><td>
          <p style="margin:0;color:#38bdf8;font-size:14px;font-weight:600;">${opts.eyebrow}</p>
          <h1 style="margin:12px 0 0;color:#f4f4f5;font-size:22px;line-height:1.3;">${opts.title}</h1>
          <div style="margin:16px 0 0;color:#a1a1aa;font-size:15px;line-height:1.55;">
            ${opts.bodyHtml}
          </div>
          ${cta}
          <p style="margin:24px 0 0;color:#71717a;font-size:12px;line-height:1.5;">
            ${footer}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function firstNameFromEmail(email: string): string | undefined {
  const local = email.split("@")[0]?.trim();
  if (!local) return undefined;
  const clean = local.replace(/[._+].*$/, "");
  if (!clean) return undefined;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function monthLabelPt(d = new Date()) {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/** Bloco de lista estilo card (parcelas, hábitos…). */
export function emailListBlock(
  items: { title: string; meta: string }[]
): string {
  if (items.length === 0) return "";
  return `<ul style="margin:12px 0 0;padding:0;list-style:none;">
    ${items
      .map(
        (p) => `<li style="margin:0 0 10px;padding:12px 14px;background:#161f2e;border-radius:10px;border:1px solid rgba(255,255,255,0.06);">
        <span style="color:#f4f4f5;font-size:14px;font-weight:600;">${p.title}</span>
        <br/>
        <span style="color:#a1a1aa;font-size:13px;">${p.meta}</span>
      </li>`
      )
      .join("")}
  </ul>`;
}
