import { supabase } from "@/lib/supabase";

export type OpsProfile = {
  id: string;
  plan: string;
  subscription_status: string | null;
  current_period_end: string | null;
  created_at: string;
  trial_ends_at: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

export type OpsLookupResult = {
  user: { id: string; email: string; auth_created_at?: string };
  profile: OpsProfile | null;
};

export type OpsListUser = {
  id: string;
  email: string;
  auth_created_at: string;
  plan: string;
  subscription_status: string | null;
  trial_ends_at: string | null;
  profile_created_at: string | null;
  stripe_subscription_id: string | null;
};

async function invokeOps<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ops-admin", {
    body,
  });

  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const parsed = (await ctx.clone().json()) as { error?: string };
        if (parsed?.error) detail = parsed.error;
      } catch {
        /* ignore */
      }
    }
    if (
      data &&
      typeof data === "object" &&
      "error" in data &&
      (data as { error?: unknown }).error
    ) {
      detail = String((data as { error: unknown }).error);
    }
    throw new Error(detail);
  }

  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    (data as { error?: unknown }).error
  ) {
    throw new Error(String((data as { error: unknown }).error));
  }

  return data as T;
}

export async function opsPing(): Promise<{ ok: boolean; actor: string }> {
  return invokeOps({ action: "ping" });
}

export async function opsListUsers(): Promise<{
  users: OpsListUser[];
  total: number;
}> {
  return invokeOps({ action: "list" });
}

export async function opsLookup(email: string): Promise<OpsLookupResult> {
  return invokeOps({ action: "lookup", email });
}

export async function opsGrantPro(
  email: string
): Promise<{ ok: boolean; profile: OpsProfile }> {
  return invokeOps({ action: "grant_pro", email });
}

export async function opsRevokePro(
  email: string
): Promise<{ ok: boolean; profile: OpsProfile }> {
  return invokeOps({ action: "revoke_pro", email });
}

export async function opsExtendTrial(
  email: string,
  days: number
): Promise<{ ok: boolean; profile: OpsProfile }> {
  return invokeOps({ action: "extend_trial", email, days });
}
