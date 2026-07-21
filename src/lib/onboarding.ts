import { BRAND } from "@/lib/brand";

const LEGACY_KEY = "fintrack_onboarding_v1";

export type OnboardingState = {
  tourDone: boolean;
  firstTxDone: boolean;
};

function storageKey(userId: string): string {
  return `fintrack_onboarding_v2:${userId}`;
}

function defaultState(): OnboardingState {
  return { tourDone: false, firstTxDone: false };
}

function readRaw(userId: string): OnboardingState {
  if (typeof window === "undefined") {
    return { tourDone: true, firstTxDone: true };
  }

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      return {
        tourDone: Boolean(parsed.tourDone),
        firstTxDone: Boolean(parsed.firstTxDone),
      };
    }
  } catch {
    /* ignore */
  }

  // Migração: tour antigo (device) → marca tourDone neste user.
  if (localStorage.getItem(LEGACY_KEY) === "done") {
    const migrated = { tourDone: true, firstTxDone: false };
    writeState(userId, migrated);
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  }

  return defaultState();
}

function writeState(userId: string, state: OnboardingState): void {
  localStorage.setItem(storageKey(userId), JSON.stringify(state));
}

export function getOnboardingState(userId: string): OnboardingState {
  return readRaw(userId);
}

export function patchOnboardingState(
  userId: string,
  patch: Partial<OnboardingState>
): OnboardingState {
  const next = { ...readRaw(userId), ...patch };
  writeState(userId, next);
  return next;
}

export function isTourDone(userId: string): boolean {
  return readRaw(userId).tourDone;
}

export function isFirstTxDone(userId: string): boolean {
  return readRaw(userId).firstTxDone;
}

/** Tour + 1ª transação — onboarding “completo”. */
export function isOnboardingFullyDone(userId: string): boolean {
  const s = readRaw(userId);
  return s.tourDone && s.firstTxDone;
}

export function markTourDone(userId: string): void {
  patchOnboardingState(userId, { tourDone: true });
}

export function markFirstTxDone(userId: string): void {
  patchOnboardingState(userId, { firstTxDone: true });
}

export function resetOnboarding(userId?: string | null): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LEGACY_KEY);
  if (userId) {
    localStorage.removeItem(storageKey(userId));
    return;
  }
  // Sem user: limpa chaves v2 conhecidas + legacy (Account offline edge).
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k?.startsWith("fintrack_onboarding_v2:")) toRemove.push(k);
  }
  for (const k of toRemove) localStorage.removeItem(k);
}

/** @deprecated Use isTourDone(userId) — mantido para imports antigos sem user. */
export function isOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(LEGACY_KEY) === "done";
}

/** @deprecated Use markTourDone(userId) */
export function markOnboardingDone(): void {
  localStorage.setItem(LEGACY_KEY, "done");
}

export const ONBOARDING_STEPS = [
  {
    id: "welcome",
    title: `Bem-vindo ao ${BRAND.name}`,
    body: `${BRAND.shortDescription} ${BRAND.wedge}: vida organizada com o livro-caixa no centro.`,
  },
  {
    id: "dimensions",
    title: "Categorias prontas",
    body: "Vamos criar tipos e classes iniciais (ex.: Alimentação → Mercado, Restaurante) só na sua conta, para registrar a primeira despesa sem fricção.",
  },
  {
    id: "first-tx",
    title: "Primeira transação",
    body: "Registre um gasto ou receita — é o coração do ledger. O checklist no Início só some quando a 1ª transação existir.",
  },
  {
    id: "explore",
    title: "Explore o resto",
    body: "Metas, hábitos, lugares, cinema e veículos vivem no menu. O Início reúne alertas e o que importa hoje.",
  },
] as const;
