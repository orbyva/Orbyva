import type { Page } from "@playwright/test";

export function e2eEnv() {
  const email = process.env.E2E_EMAIL?.trim();
  const password = process.env.E2E_PASSWORD?.trim();
  const emailB = process.env.E2E_EMAIL_B?.trim();
  const passwordB = process.env.E2E_PASSWORD_B?.trim();
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, "");
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  return {
    email,
    password,
    emailB,
    passwordB,
    supabaseUrl,
    supabaseAnonKey,
    hasAuth: Boolean(email && password && supabaseUrl && supabaseAnonKey),
    hasTwoUsers: Boolean(
      email &&
        password &&
        emailB &&
        passwordB &&
        supabaseUrl &&
        supabaseAnonKey
    ),
  };
}

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user: { id: string; email?: string };
};

export async function passwordGrant(
  email: string,
  password: string
): Promise<SupabaseSession> {
  const { supabaseUrl, supabaseAnonKey } = e2eEnv();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes");
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Login Supabase falhou (${res.status}): ${bodyText}\n` +
        "Confira E2E_* e usuário confirmado."
    );
  }

  return JSON.parse(bodyText) as SupabaseSession;
}

export async function signInViaSupabaseApi(
  page: Page,
  email = e2eEnv().email!,
  password = e2eEnv().password!
): Promise<SupabaseSession> {
  const { supabaseUrl } = e2eEnv();
  const session = await passwordGrant(email, password);
  const projectRef = new URL(supabaseUrl!).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;

  await page.goto("/login");
  await page.evaluate(
    ({ storageKey, session }) => {
      const expiresAt =
        session.expires_at ??
        Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600);
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: expiresAt,
          expires_in: session.expires_in ?? 3600,
          token_type: session.token_type ?? "bearer",
          user: session.user,
        })
      );
    },
    { storageKey, session }
  );

  return session;
}

export async function dismissOnboardingIfPresent(page: Page) {
  const skip = page.getByRole("button", { name: /Pular/i });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }
}

export async function rest(
  path: string,
  token: string,
  init?: RequestInit & { query?: string }
) {
  const { supabaseUrl, supabaseAnonKey } = e2eEnv();
  const qs = init?.query ? `?${init.query}` : "";
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}${qs}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: init?.method === "POST" ? "return=representation" : "return=minimal",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { res, json, text };
}
