/** Catálogo e helpers de ícones de categoria (sem React). */

/** Catálogo de ícones de categoria, `id` = valor no banco; `label` = PT-BR na UI. */
const TYPE_ICONS_RAW = [
  { id: "wallet", label: "Carteira" },
  { id: "piggy-bank", label: "Poupança" },
  { id: "banknote", label: "Dinheiro" },
  { id: "coins", label: "Moedas" },
  { id: "hand-coins", label: "Pagamento" },
  { id: "dollar-sign", label: "Cifrão" },
  { id: "credit-card", label: "Cartão" },
  { id: "receipt", label: "Recibo" },
  { id: "landmark", label: "Banco" },
  { id: "trending-up", label: "Alta" },
  { id: "trending-down", label: "Baixa" },
  { id: "percent", label: "Porcentagem" },
  { id: "briefcase", label: "Trabalho" },
  { id: "building-2", label: "Empresa" },
  { id: "store", label: "Loja" },
  { id: "shopping-bag", label: "Sacola" },
  { id: "shopping-cart", label: "Carrinho" },
  { id: "package", label: "Encomenda" },
  { id: "home", label: "Casa" },
  { id: "hotel", label: "Hotel" },
  { id: "utensils", label: "Alimentação" },
  { id: "coffee", label: "Café" },
  { id: "wine", label: "Vinho" },
  { id: "beer", label: "Bar" },
  { id: "car", label: "Carro" },
  { id: "bike", label: "Bicicleta" },
  { id: "bus", label: "Ônibus" },
  { id: "train", label: "Trem" },
  { id: "fuel", label: "Combustível" },
  { id: "plane", label: "Avião" },
  { id: "truck", label: "Entrega" },
  { id: "map-pin", label: "Local" },
  { id: "globe", label: "Mundo" },
  { id: "heart", label: "Saúde / amor" },
  { id: "heart-pulse", label: "Saúde" },
  { id: "stethoscope", label: "Médico" },
  { id: "pill", label: "Remédio" },
  { id: "dumbbell", label: "Academia" },
  { id: "activity", label: "Atividade" },
  { id: "baby", label: "Bebê" },
  { id: "graduation-cap", label: "Educação" },
  { id: "book", label: "Livro" },
  { id: "sparkles", label: "Lazer" },
  { id: "film", label: "Cinema" },
  { id: "tv", label: "TV" },
  { id: "music", label: "Música" },
  { id: "gamepad-2", label: "Games" },
  { id: "ticket", label: "Ingresso" },
  { id: "gift", label: "Presente" },
  { id: "shirt", label: "Roupa" },
  { id: "scissors", label: "Beleza" },
  { id: "paw-print", label: "Pet" },
  { id: "dog", label: "Cachorro" },
  { id: "smartphone", label: "Celular" },
  { id: "wifi", label: "Internet" },
  { id: "zap", label: "Energia" },
  { id: "cpu", label: "Tecnologia" },
  { id: "wrench", label: "Manutenção" },
  { id: "hammer", label: "Reforma" },
  { id: "clipboard-list", label: "Lista" },
  { id: "calendar", label: "Calendário" },
  { id: "clock", label: "Relógio" },
  { id: "bell", label: "Alerta" },
  { id: "umbrella", label: "Seguro" },
  { id: "flower-2", label: "Jardim" },
  { id: "mountain", label: "Natureza" },
  { id: "waves", label: "Mar" },
  { id: "cloud-rain", label: "Chuva" },
  { id: "bar-chart-2", label: "Gráfico" },
  { id: "award", label: "Prêmio" },
] as const;

export type TypeIconId = (typeof TYPE_ICONS_RAW)[number]["id"];

/** Ícones ordenados pelo rótulo PT-BR. */
export const TYPE_ICONS = [...TYPE_ICONS_RAW].sort((a, b) =>
  a.label.localeCompare(b.label, "pt-BR")
);

/** @deprecated use TYPE_ICONS, mantido para imports existentes */
export const TYPE_ICON_OPTIONS = TYPE_ICONS.map((i) => i.id);

const ICON_LABELS: Record<string, string> = Object.fromEntries(
  TYPE_ICONS.map((i) => [i.id, i.label])
);

export function typeIconLabel(name: string | null | undefined): string {
  if (!name) return "Nenhum";
  return ICON_LABELS[name] ?? name;
}

/** Normaliza digitação de hex (#RGB / #RRGGBB). Retorna null se vazio. */
export function normalizeHexColor(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  let hex = t.startsWith("#") ? t : `#${t}`;
  if (/^#[0-9A-Fa-f]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex.toLowerCase();
  return hex;
}

export function isValidHexColor(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(raw);
}
