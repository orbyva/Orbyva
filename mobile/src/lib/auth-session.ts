import * as QueryParams from "expo-auth-session/build/QueryParams";

import { supabase } from "./supabase";

/**
 * Scheme fixo do app.json. Não usamos `Linking.createURL` / `exp://` no OAuth:
 * no Expo Go isso vira `exp://IP:porta/--/…`, o Supabase raramente aceita na
 * allowlist e cai no Site URL (orbyva.app). O ASWebAuthenticationSession do iOS
 * intercepta `orbyva://` sozinho — não precisa o Expo Go registrar o scheme.
 */
export const AUTH_REDIRECT_URI = "orbyva://auth/callback";

export function authRedirectUri(): string {
  return AUTH_REDIRECT_URI;
}

export function googleRedirectConfigHint(redirectTo: string): string {
  return `O Google ainda está voltando para o site. No Supabase: Authentication → URL Configuration → Redirect URLs, cadastre exatamente:\n${redirectTo}\n\nWildcard que também vale: orbyva://**\nNão use exp:// — o Site URL (orbyva.app) continua só para o web.`;
}

/**
 * Troca o deep link (OAuth / magic link) por sessão persistida no SecureStore.
 */
export async function createSessionFromUrl(url: string): Promise<boolean> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) {
    throw new Error(errorCode);
  }

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  const code = params.code;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return true;
  }

  return false;
}

export function urlLooksLikeWebsiteFallback(url: string): boolean {
  return /orbyva\.app/i.test(url) && !/^orbyva:/i.test(url);
}
