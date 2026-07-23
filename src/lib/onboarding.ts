import { BRAND } from "@/lib/brand";

const LEGACY_V1 = "fintrack_onboarding_v1";
const LEGACY_V2_PREFIX = "fintrack_onboarding_v2:";
const KEY_PREFIX = "orbyva_onboarding_v1:";

export type OnboardingState = {
  tourDone: boolean;
  firstTxDone: boolean;
  firstBudgetDone: boolean;
};

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function defaultState(): OnboardingState {
  return { tourDone: false, firstTxDone: false, firstBudgetDone: false };
}

function migrateLegacy(userId: string): OnboardingState | null {
  const legacyV2 = localStorage.getItem(`${LEGACY_V2_PREFIX}${userId}`);
  if (legacyV2) {
    try {
      const parsed = JSON.parse(legacyV2) as Partial<OnboardingState>;
      const migrated: OnboardingState = {
        tourDone: Boolean(parsed.tourDone),
        firstTxDone: Boolean(parsed.firstTxDone),
        firstBudgetDone: Boolean(parsed.firstBudgetDone),
      };
      writeState(userId, migrated);
      localStorage.removeItem(`${LEGACY_V2_PREFIX}${userId}`);
      return migrated;
    } catch {
      localStorage.removeItem(`${LEGACY_V2_PREFIX}${userId}`);
    }
  }

  if (localStorage.getItem(LEGACY_V1) === "done") {
    const migrated = {
      tourDone: true,
      firstTxDone: false,
      firstBudgetDone: false,
    };
    writeState(userId, migrated);
    localStorage.removeItem(LEGACY_V1);
    return migrated;
  }

  return null;
}

function readRaw(userId: string): OnboardingState {
  if (typeof window === "undefined") {
    return { tourDone: true, firstTxDone: true, firstBudgetDone: true };
  }

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      return {
        tourDone: Boolean(parsed.tourDone),
        firstTxDone: Boolean(parsed.firstTxDone),
        firstBudgetDone: Boolean(parsed.firstBudgetDone),
      };
    }
  } catch {
    /* ignore */
  }

  const migrated = migrateLegacy(userId);
  if (migrated) return migrated;

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

export function isFirstBudgetDone(userId: string): boolean {
  return readRaw(userId).firstBudgetDone;
}

/** Tour + 1ª transação — ativação finance-first. */
export function isActivationDone(userId: string): boolean {
  const s = readRaw(userId);
  return s.tourDone && s.firstTxDone;
}

/** @deprecated Use isActivationDone */
export function isOnboardingFullyDone(userId: string): boolean {
  return isActivationDone(userId);
}

export function markTourDone(userId: string): void {
  patchOnboardingState(userId, { tourDone: true });
}

export function markFirstTxDone(userId: string): void {
  patchOnboardingState(userId, { firstTxDone: true });
}

export function markFirstBudgetDone(userId: string): void {
  patchOnboardingState(userId, { firstBudgetDone: true });
}

export function resetOnboarding(userId?: string | null): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LEGACY_V1);
  if (userId) {
    localStorage.removeItem(storageKey(userId));
    localStorage.removeItem(`${LEGACY_V2_PREFIX}${userId}`);
    return;
  }
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (
      k?.startsWith(KEY_PREFIX) ||
      k?.startsWith(LEGACY_V2_PREFIX)
    ) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) localStorage.removeItem(k);
}

/** @deprecated Use isTourDone(userId) */
export function isOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(LEGACY_V1) === "done";
}

/** @deprecated Use markTourDone(userId) */
export function markOnboardingDone(): void {
  localStorage.setItem(LEGACY_V1, "done");
}

/** Finance-first: bem-vindo → categorias → 1ª tx → orçamento (opcional). */
export const ONBOARDING_STEPS = [
  {
    id: "welcome",
    title: `Bem-vindo ao ${BRAND.name}`,
    body: `${BRAND.wedge} Começamos pelo livro-caixa — o resto do life OS vem depois.`,
  },
  {
    id: "dimensions",
    title: "Categorias prontas",
    body: "Criamos tipos e classes iniciais (ex.: Alimentação → Mercado) só na sua conta, para registrar a primeira despesa sem fricção.",
  },
  {
    id: "first-tx",
    title: "Primeira transação",
    body: "Registre um gasto ou receita agora. Sem isso o hub fica vazio — é o único passo obrigatório da ativação.",
  },
  {
    id: "budget",
    title: "Orçamento do mês (opcional)",
    body: "Defina um teto de despesa ou meta de receita. Pode pular e fazer depois em Finanças → Orçamento.",
  },
] as const;
