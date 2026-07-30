import { e2eEnv, passwordGrant } from "./helpers/auth";
import { sweepE2eByDescription } from "./helpers/cleanup";

/**
 * Limpa leftovers E2E* uma vez no fim da suíte.
 * Não rodar no cleanup por teste: com fullyParallel isso apaga txs de specs
 * ainda em execução (mesma conta E2E).
 */
export default async function globalTeardown() {
  const env = e2eEnv();
  if (!env.hasAuth) return;
  try {
    const session = await passwordGrant(env.email!, env.password!);
    await sweepE2eByDescription(session.access_token);
  } catch (err) {
    console.warn("[e2e global-teardown] sweep falhou:", err);
  }
}
