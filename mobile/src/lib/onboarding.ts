import { kvGet, kvSet } from "@/lib/kv";

const KEY_PREFIX = "orbyva_onboarding_v1_";

export type OnboardingState = {
  tourDone: boolean;
  firstTxDone: boolean;
  firstBudgetDone: boolean;
  moduleGuidesSeen: string[];
};

function defaultState(): OnboardingState {
  return {
    tourDone: false,
    firstTxDone: false,
    firstBudgetDone: false,
    moduleGuidesSeen: [],
  };
}

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function parseState(raw: string | null): OnboardingState {
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      tourDone: Boolean(parsed.tourDone),
      firstTxDone: Boolean(parsed.firstTxDone),
      firstBudgetDone: Boolean(parsed.firstBudgetDone),
      moduleGuidesSeen: Array.isArray(parsed.moduleGuidesSeen)
        ? parsed.moduleGuidesSeen.filter((v): v is string => typeof v === "string")
        : [],
    };
  } catch {
    return defaultState();
  }
}

export async function loadOnboardingState(userId: string): Promise<OnboardingState> {
  return parseState(await kvGet(storageKey(userId)));
}

async function writeState(userId: string, state: OnboardingState): Promise<void> {
  await kvSet(storageKey(userId), JSON.stringify(state));
}

export async function isTourDone(userId: string): Promise<boolean> {
  return (await loadOnboardingState(userId)).tourDone;
}

export async function markTourDone(userId: string): Promise<void> {
  const state = await loadOnboardingState(userId);
  state.tourDone = true;
  await writeState(userId, state);
}

export async function resetOnboarding(userId: string): Promise<void> {
  await writeState(userId, defaultState());
}

export async function isFirstTxDone(userId: string): Promise<boolean> {
  return (await loadOnboardingState(userId)).firstTxDone;
}

export async function markFirstTxDone(userId: string): Promise<void> {
  const state = await loadOnboardingState(userId);
  state.firstTxDone = true;
  await writeState(userId, state);
}

export async function isFirstBudgetDone(userId: string): Promise<boolean> {
  return (await loadOnboardingState(userId)).firstBudgetDone;
}

export async function markFirstBudgetDone(userId: string): Promise<void> {
  const state = await loadOnboardingState(userId);
  state.firstBudgetDone = true;
  await writeState(userId, state);
}

export async function isModuleGuideSeen(
  userId: string,
  moduleId: string
): Promise<boolean> {
  const state = await loadOnboardingState(userId);
  return state.moduleGuidesSeen.includes(moduleId);
}

export async function markModuleGuideSeen(
  userId: string,
  moduleId: string
): Promise<void> {
  const state = await loadOnboardingState(userId);
  if (!state.moduleGuidesSeen.includes(moduleId)) {
    state.moduleGuidesSeen.push(moduleId);
    await writeState(userId, state);
  }
}

export const ONBOARDING_STEPS = [
  {
    id: "welcome",
    title: "Bem-vindo ao Orbyva",
    body: "Orçamento, parcelas e o mês em clareza, mais hábitos, viagens e cinema no mesmo app. Tudo liberado desde o primeiro acesso.",
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
    body: "Defina o teto de despesa (e, se quiser, meta de receita). É o que transforma os lançamentos em controle de verdade, pode pular e fazer depois.",
  },
] as const;
