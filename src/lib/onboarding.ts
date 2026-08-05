import { BRAND } from "@/lib/brand";

const LEGACY_V1 = "fintrack_onboarding_v1";
const LEGACY_V2_PREFIX = "fintrack_onboarding_v2:";
const KEY_PREFIX = "orbyva_onboarding_v1:";

export type OnboardingState = {
  tourDone: boolean;
  firstTxDone: boolean;
  firstBudgetDone: boolean;
  /** Guias contextuais por módulo já vistos/dispensados (ex.: "travel"). */
  moduleGuidesSeen: string[];
};

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function defaultState(): OnboardingState {
  return {
    tourDone: false,
    firstTxDone: false,
    firstBudgetDone: false,
    moduleGuidesSeen: [],
  };
}

function normalizeModuleGuides(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
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
        moduleGuidesSeen: normalizeModuleGuides(parsed.moduleGuidesSeen),
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
      moduleGuidesSeen: [],
    };
    writeState(userId, migrated);
    localStorage.removeItem(LEGACY_V1);
    return migrated;
  }

  return null;
}

function readRaw(userId: string): OnboardingState {
  if (typeof window === "undefined") {
    return {
      tourDone: true,
      firstTxDone: true,
      firstBudgetDone: true,
      moduleGuidesSeen: [],
    };
  }

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      return {
        tourDone: Boolean(parsed.tourDone),
        firstTxDone: Boolean(parsed.firstTxDone),
        firstBudgetDone: Boolean(parsed.firstBudgetDone),
        moduleGuidesSeen: normalizeModuleGuides(parsed.moduleGuidesSeen),
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

/** Guia contextual do módulo já foi visto/dispensado? */
export function isModuleGuideSeen(userId: string, moduleId: string): boolean {
  return readRaw(userId).moduleGuidesSeen.includes(moduleId);
}

export function markModuleGuideSeen(
  userId: string,
  moduleId: string,
  opts?: { notify?: boolean }
): void {
  const seen = readRaw(userId).moduleGuidesSeen;
  if (seen.includes(moduleId)) return;
  patchOnboardingState(userId, { moduleGuidesSeen: [...seen, moduleId] });
  if (opts?.notify === false) return;
  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    window.dispatchEvent(
      new CustomEvent("orbyva:module-guide-seen", {
        detail: { userId, moduleId },
      })
    );
  }
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

/** Tour curto: bem-vindo → categorias → 1ª tx (sugerida) → orçamento (opcional). */
export const ONBOARDING_STEPS = [
  {
    id: "welcome",
    title: `Bem-vindo ao ${BRAND.name}`,
    body: `Orçamento, parcelas e o mês em clareza — mais hábitos, viagens e cinema no mesmo app. Tudo liberado desde o primeiro acesso.`,
  },
  {
    id: "dimensions",
    title: "Categorias prontas",
    body: "Criamos categorias e subcategorias iniciais (ex.: Alimentação → Mercado) só na sua conta, para registrar despesas sem fricção quando quiser.",
  },
  {
    id: "first-tx",
    title: "Primeira transação (sugerida)",
    body: "Um lançamento deixa o saldo e as parcelas do mês com sentido. Não é obrigatório para usar Hábitos, Viagens, Cinema e o resto.",
  },
  {
    id: "budget",
    title: "Orçamento do mês (recomendado)",
    body: "Defina o teto de despesa (e, se quiser, meta de receita). É o que transforma os lançamentos em controle de verdade — pode pular e fazer depois.",
  },
] as const;
