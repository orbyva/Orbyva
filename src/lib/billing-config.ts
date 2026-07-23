/** Config de billing sem side-effects (não importa Supabase). */

export function isBillingConfigured(): boolean {
  return Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
}
