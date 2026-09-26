function meta(selector, attr = "content") {
  const el = document.querySelector(selector);
  return el ? el.getAttribute(attr) : null;
}

function firstJsonLd() {
  const nodes = document.querySelectorAll('script[type="application/ld+json"]');
  const items = [];
  for (const node of nodes) {
    try {
      const parsed = JSON.parse(node.textContent || "null");
      if (!parsed) continue;
      if (Array.isArray(parsed)) items.push(...parsed);
      else if (Array.isArray(parsed["@graph"])) items.push(...parsed["@graph"], parsed);
      else items.push(parsed);
    } catch {
      /* ignore */
    }
  }
  return items;
}

function typeOf(item) {
  const t = item && item["@type"];
  if (Array.isArray(t)) return t.join(" ");
  return typeof t === "string" ? t : "";
}

function parseOfferAmount(raw) {
  const n = Number(String(raw).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function nearbyAfter(text, endIndex) {
  const slice = text.slice(endIndex, endIndex + 40);
  const next = slice.search(/\d{1,2}\s*x(?:\s+sem\s+juros)?\s*(?:de\s*)?R\$/i);
  return next >= 0 ? slice.slice(0, next) : slice;
}

function extractInstallments() {
  const chunks = [];
  const sels = [
    '[class*="ui-pdp-payment"]',
    '[class*="ui-pdp-price"]',
    '[class*="andes-money"]',
    '[class*="installment"]',
    '[class*="parcel"]',
  ];
  for (const sel of sels) {
    document.querySelectorAll(sel).forEach((el) => {
      const t = el.textContent;
      if (t && t.length < 4000) chunks.push(t);
    });
  }
  const body = document.body?.innerText || "";
  chunks.push(body.slice(0, 12000));
  const text = chunks.join("\n");
  const re =
    /(\d{1,2})\s*x(?:\s+sem\s+juros)?\s*(?:de\s*)?R\$\s*([\d.]+,\d{2})/gi;
  let bestJuros = null;
  let bestAny = null;
  let match;
  while ((match = re.exec(text))) {
    const count = Number(match[1]);
    const value = parseOfferAmount(match[2]);
    if (count < 2 || count > 48 || !value) continue;
    const offer = { count, value };
    const nearby = nearbyAfter(text, match.index + match[0].length);
    if (
      /sem\s+juros/i.test(`${match[0]} ${nearby}`) &&
      (!bestJuros || count > bestJuros.count)
    ) {
      bestJuros = offer;
    }
    if (!bestAny || count > bestAny.count) bestAny = offer;
  }
  return bestJuros || bestAny;
}

function extractPrice() {
  for (const item of firstJsonLd()) {
    if (!/Product|Offer/i.test(typeOf(item))) continue;
    const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
    const raw = offer?.price ?? offer?.lowPrice ?? item.price;
    const n = Number(String(raw ?? "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const metaPrice =
    meta('meta[property="product:price:amount"]') ||
    meta('meta[itemprop="price"]');
  if (metaPrice) {
    const n = Number(String(metaPrice).replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function extractImdbId(url) {
  const match = url.match(/\/title\/(tt\d{7,})/i);
  return match ? match[1].toLowerCase() : null;
}

function extractSpotifyAlbumId(url) {
  const match = url.match(
    /open\.spotify\.com\/(?:intl-[a-z]+\/)?album\/([A-Za-z0-9]+)/i
  );
  return match ? match[1] : null;
}

function extractIsbn(url) {
  try {
    const parsed = new URL(url);
    const q = parsed.searchParams.get("isbn") || parsed.searchParams.get("ISBN");
    if (q && /^\d{9}[\dXx]$|^\d{13}$/.test(q.replace(/-/g, ""))) {
      return q.replace(/-/g, "");
    }
    const dp = parsed.pathname.match(
      /\/(?:dp|gp\/product)\/(\d{9}[\dXx]|\d{13})(?:[/?]|$)/i
    );
    return dp ? dp[1] : null;
  } catch {
    return null;
  }
}

function extractPage() {
  const url = location.href;
  const installments = extractInstallments();
  return {
    url,
    title: document.title || "",
    description:
      meta('meta[property="og:description"]') ||
      meta('meta[name="description"]'),
    image: meta('meta[property="og:image"]'),
    siteName: meta('meta[property="og:site_name"]'),
    price: extractPrice(),
    installmentCount: installments ? installments.count : null,
    installmentValue: installments ? installments.value : null,
    imdbId: extractImdbId(url),
    isbn: extractIsbn(url),
    googleBookId: null,
    spotifyAlbumId: extractSpotifyAlbumId(url),
  };
}

function sendContext() {
  const payload = extractPage();
  chrome.runtime.sendMessage({ type: "PAGE_CONTEXT", payload }).catch(() => undefined);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "REQUEST_PAGE") {
    sendResponse({ payload: extractPage() });
    return true;
  }
});

sendContext();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") sendContext();
});

function maybeChip() {
  if (document.getElementById("orbyva-budget-chip")) return;
  const price = extractPrice();
  const host = location.hostname.replace(/^www\./, "");
  const isProductHost =
    /amazon\.|mercadolivre\.|mercadolibre\.|shopee\.|magazineluiza\.|magalu\.|americanas\.|kabum\./i.test(
      host
    );
  if (!price && !isProductHost) return;

  const btn = document.createElement("button");
  btn.id = "orbyva-budget-chip";
  btn.type = "button";
  btn.textContent = "Está dentro do orçamento?";
  btn.style.cssText = [
    "position:fixed",
    "z-index:2147483646",
    "right:16px",
    "bottom:16px",
    "border:0",
    "border-radius:999px",
    "padding:8px 12px",
    "font:600 12px/1.2 system-ui,sans-serif",
    "color:#0c4a6e",
    "background:#7dd3fc",
    "box-shadow:0 8px 24px rgba(12,74,110,.25)",
    "cursor:pointer",
  ].join(";");
  btn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_PANEL" }).catch(() => undefined);
    sendContext();
  });
  document.documentElement.appendChild(btn);
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  maybeChip();
} else {
  document.addEventListener("DOMContentLoaded", maybeChip, { once: true });
}
