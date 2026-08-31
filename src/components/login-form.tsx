import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/BrandLogo";
import { FormField } from "@/components/FormField";
import { BRAND } from "@/lib/brand";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { getErrorMessage } from "@/lib/errors";
import { authCallbackUrl, safeNextPath } from "@/lib/nextPath";

type AuthMode = "login" | "signup" | "forgot" | "recovery";

function modeFromSearch(raw: string | null): AuthMode {
  if (raw === "signup" || raw === "register" || raw === "criar") return "signup";
  if (raw === "forgot" || raw === "reset") return "forgot";
  if (raw === "recovery") return "recovery";
  return "login";
}

function AuthErrorCallout({ message }: { message: string }) {
  return (
    <div
      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      {message}
    </div>
  );
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>(() =>
    modeFromSearch(searchParams.get("mode"))
  );
  // Destino pós-login. Vem de `?next=` (o link de convite manda o usuário deslogado para
  // `/login?next=/events/invite/<token>`) e é saneado contra open redirect.
  const nextPath = safeNextPath(searchParams.get("next"));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const isRecovery = mode === "recovery";

  useEffect(() => {
    setMode(modeFromSearch(searchParams.get("mode")));
  }, [searchParams]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("recovery");
        setSearchParams({ mode: "recovery" }, { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [setSearchParams]);

  function switchMode(next: AuthMode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setMessage(null);
    setPassword("");
    const params = new URLSearchParams(searchParams);
    if (next === "login") params.delete("mode");
    else params.set("mode", next);
    setSearchParams(params, { replace: true });
  }

  async function handleGoogleLogin(event: React.FormEvent | React.MouseEvent) {
    event.preventDefault();
    track(isSignup ? "signup_google_click" : "login_google_click");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authCallbackUrl(window.location.origin, nextPath),
      },
    });
    if (oauthError) {
      setError(
        getErrorMessage(oauthError, "Não foi possível entrar com o Google.")
      );
    }
  }

  async function handleMagicLink() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      track("login_magic_link_submit");
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: authCallbackUrl(window.location.origin, nextPath),
          shouldCreateUser: false,
        },
      });
      if (otpError) throw otpError;
      setMessage("Enviamos um link de login para o seu e-mail.");
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível enviar o link."));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      track("password_reset_request");
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/login?mode=recovery` }
      );
      if (resetError) throw resetError;
      setMessage(
        "Se existir uma conta com este e-mail, enviamos o link para redefinir a senha."
      );
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível enviar o reset."));
    } finally {
      setBusy(false);
    }
  }

  async function handleNewPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      track("password_reset_complete");
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível salvar a nova senha."));
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailAuth(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "login") {
        track("login_email_submit");
        const { error: signError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signError) throw signError;
        navigate(nextPath, { replace: true });
        return;
      }

      track("signup_email_submit");
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: authCallbackUrl(window.location.origin, nextPath),
        },
      });
      if (signUpError) throw signUpError;
      if (data.session) {
        navigate(nextPath, { replace: true });
        return;
      }
      setMessage(
        "Conta criada. Confirme o e-mail que acabamos de enviar para entrar."
      );
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          isSignup ? "Não foi possível criar a conta." : "Não foi possível entrar."
        )
      );
    } finally {
      setBusy(false);
    }
  }

  const title = isRecovery
    ? "Nova senha"
    : isForgot
      ? "Recuperar senha"
      : isSignup
        ? "Crie sua conta"
        : "Bem-vindo de volta";

  const subtitle = isRecovery
    ? "Defina uma senha nova para continuar."
    : isForgot
      ? "Enviamos um link seguro para o seu e-mail."
      : isSignup
        ? "7 dias grátis com tudo liberado. Sem cartão no início."
        : `${BRAND.tagline}. Entre para continuar.`;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div
            key={mode}
            className="flex flex-col gap-6 p-6 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 md:p-8"
          >
            <div className="flex flex-col items-center text-center">
              <p className="mb-1 text-sm font-medium text-muted-foreground">
                {BRAND.name}
              </p>
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              <p className="mt-1 text-balance text-sm text-muted-foreground">
                {subtitle}
              </p>
            </div>

            {!isForgot && !isRecovery ? (
              <div
                role="tablist"
                aria-label="Tipo de acesso"
                className="grid grid-cols-2 rounded-lg bg-muted p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isSignup}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    !isSignup
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => switchMode("login")}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isSignup}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isSignup
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => switchMode("signup")}
                >
                  Criar conta
                </button>
              </div>
            ) : null}

            {!isForgot && !isRecovery ? (
              <Button
                type="button"
                className="w-full"
                onClick={handleGoogleLogin}
              >
                {isSignup ? "Criar conta com Google" : "Continuar com Google"}
              </Button>
            ) : null}

            {!isForgot && !isRecovery ? (
              <div className="relative text-center text-xs text-muted-foreground">
                <span className="bg-card relative z-10 px-2">
                  {isSignup ? "ou cadastre com e-mail" : "ou e-mail"}
                </span>
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
              </div>
            ) : null}

            {isRecovery ? (
              <form
                className="grid gap-3"
                onSubmit={(e) => void handleNewPassword(e)}
              >
                <FormField label="Nova senha" required htmlFor="password">
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                </FormField>
                {error ? <AuthErrorCallout message={error} /> : null}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "Aguarde…" : "Salvar senha"}
                </Button>
              </form>
            ) : isForgot ? (
              <form className="grid gap-3" onSubmit={(e) => void handleForgot(e)}>
                <FormField label="E-mail" required htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                  />
                </FormField>
                {error ? <AuthErrorCallout message={error} /> : null}
                {message ? (
                  <p className="text-sm text-muted-foreground">{message}</p>
                ) : null}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "Aguarde…" : "Enviar link de reset"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => switchMode("login")}
                >
                  Voltar ao login
                </Button>
              </form>
            ) : (
              <form
                className="grid gap-3"
                onSubmit={(e) => void handleEmailAuth(e)}
              >
                <FormField label="E-mail" required htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                  />
                </FormField>
                <FormField
                  label={isSignup ? "Crie uma senha" : "Senha"}
                  required
                  htmlFor="password"
                >
                  <div className="space-y-1.5">
                    {!isSignup ? (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                          onClick={() => switchMode("forgot")}
                        >
                          Esqueci a senha
                        </button>
                      </div>
                    ) : null}
                    <Input
                      id="password"
                      type="password"
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isSignup ? "Mínimo 6 caracteres" : undefined}
                    />
                  </div>
                </FormField>
                {error ? <AuthErrorCallout message={error} /> : null}
                {message ? (
                  <p className="text-sm text-muted-foreground">{message}</p>
                ) : null}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy
                    ? "Aguarde…"
                    : isSignup
                      ? "Criar minha conta"
                      : "Entrar com e-mail"}
                </Button>
                {!isSignup ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !email.trim()}
                    className="w-full"
                    onClick={() => void handleMagicLink()}
                  >
                    Entrar só com link no e-mail
                  </Button>
                ) : null}
              </form>
            )}

            <p className="text-center text-xs text-muted-foreground">
              Ao continuar, você aceita os{" "}
              <a href="/terms" className="underline underline-offset-2">
                Termos
              </a>{" "}
              e a{" "}
              <a href="/privacy" className="underline underline-offset-2">
                Privacidade
              </a>
              .
            </p>
          </div>

          <div
            className={cn(
              "relative hidden items-center justify-center md:flex",
              isSignup
                ? "bg-gradient-to-br from-sky-50 via-white to-sky-100"
                : "bg-white"
            )}
          >
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <BrandLogo
                variant="full"
                className="max-h-[70%] max-w-[80%]"
              />
              {isSignup ? (
                <p className="max-w-[16rem] text-sm text-muted-foreground">
                  Comece agora: orçamento, parcelas e o resto da vida na mesma
                  órbita.
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
