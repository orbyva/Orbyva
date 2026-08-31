import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/FormField";
import { FormLabel } from "@/components/FormLabel";
import { BrandWordmark } from "@/components/BrandWordmark";
import { BRAND } from "@/lib/brand";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { getErrorMessage } from "@/lib/errors";
import { authCallbackUrl, safeNextPath } from "@/lib/nextPath";

type AuthMode = "login" | "signup" | "forgot" | "recovery";

const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";

const inputClass =
  "h-11 rounded-xl border-white/20 bg-white/[0.06] text-zinc-100 shadow-none placeholder:text-zinc-500 focus-visible:border-sky-400/60 focus-visible:ring-sky-400/35";

function modeFromSearch(raw: string | null): AuthMode {
  if (raw === "signup" || raw === "register" || raw === "criar") return "signup";
  if (raw === "forgot" || raw === "reset") return "forgot";
  if (raw === "recovery") return "recovery";
  return "login";
}

function AuthErrorCallout({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
      role="alert"
    >
      {message}
    </div>
  );
}

function AuthPrimaryButton({
  children,
  busy,
}: {
  children: string;
  busy: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className={cn(
        "group inline-flex h-11 w-full items-center justify-center gap-3 rounded-full bg-sky-400 pl-5 pr-1.5 text-sm font-semibold text-sky-950",
        "transition-[transform,background-color] duration-300",
        EASE,
        "hover:bg-sky-300 active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-50"
      )}
    >
      <span className="flex-1 text-center">{busy ? "Aguarde…" : children}</span>
      <span
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-950/15 transition-transform duration-300",
          EASE,
          "group-hover:translate-x-0.5"
        )}
        aria-hidden
      >
        <ArrowRight className="size-4" strokeWidth={2} />
      </span>
    </button>
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
        : "Entre para continuar na órbita.";

  return (
    <div className={cn("flex flex-col", className)} {...props}>
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="grid overflow-hidden rounded-[calc(2rem-0.375rem)] border border-white/[0.08] md:grid-cols-[1.05fr_0.95fr]">
          <div
            key={mode}
            className="flex flex-col gap-6 bg-[var(--landing-bg)]/85 p-6 md:p-8"
          >
            <div>
              <h1 className="text-balance font-display text-3xl font-semibold tracking-tighter text-zinc-50 sm:text-4xl">
                {title}
              </h1>
              <p className="mt-2 max-w-[65ch] text-pretty text-sm leading-relaxed text-zinc-400">
                {subtitle}
              </p>
            </div>

            {!isForgot && !isRecovery ? (
              <div
                role="tablist"
                aria-label="Tipo de acesso"
                className="grid grid-cols-2 rounded-full border border-white/10 bg-white/[0.04] p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isSignup}
                  className={cn(
                    "rounded-full px-3 py-2 text-sm font-medium transition-colors duration-300",
                    EASE,
                    !isSignup
                      ? "bg-white/10 text-white ring-1 ring-white/10"
                      : "text-zinc-400 hover:text-zinc-100"
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
                    "rounded-full px-3 py-2 text-sm font-medium transition-colors duration-300",
                    EASE,
                    isSignup
                      ? "bg-white/10 text-white ring-1 ring-white/10"
                      : "text-zinc-400 hover:text-zinc-100"
                  )}
                  onClick={() => switchMode("signup")}
                >
                  Criar conta
                </button>
              </div>
            ) : null}

            {!isForgot && !isRecovery ? (
              <button
                type="button"
                onClick={handleGoogleLogin}
                className={cn(
                  "inline-flex h-11 w-full items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-sm font-medium text-zinc-100",
                  "transition-[transform,background-color] duration-300",
                  EASE,
                  "hover:bg-white/[0.08] active:scale-[0.98]"
                )}
              >
                {isSignup ? "Criar conta com Google" : "Continuar com Google"}
              </button>
            ) : null}

            {!isForgot && !isRecovery ? (
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span className="h-px flex-1 bg-white/10" />
                {isSignup ? "ou cadastre com e-mail" : "ou e-mail"}
                <span className="h-px flex-1 bg-white/10" />
              </div>
            ) : null}

            {isRecovery ? (
              <form
                className="grid gap-4"
                aria-busy={busy}
                onSubmit={(e) => void handleNewPassword(e)}
              >
                <FormField
                  label="Nova senha"
                  required
                  htmlFor="password"
                  className="[&_label]:text-zinc-200"
                >
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className={inputClass}
                  />
                </FormField>
                {error ? <AuthErrorCallout message={error} /> : null}
                <AuthPrimaryButton busy={busy}>Salvar senha</AuthPrimaryButton>
              </form>
            ) : isForgot ? (
              <form
                className="grid gap-4"
                aria-busy={busy}
                onSubmit={(e) => void handleForgot(e)}
              >
                <FormField
                  label="E-mail"
                  required
                  htmlFor="email"
                  className="[&_label]:text-zinc-200"
                >
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className={inputClass}
                  />
                </FormField>
                {error ? <AuthErrorCallout message={error} /> : null}
                {message ? (
                  <p className="text-sm text-sky-300">{message}</p>
                ) : null}
                <AuthPrimaryButton busy={busy}>
                  Enviar link de reset
                </AuthPrimaryButton>
                <button
                  type="button"
                  className="text-center text-sm text-zinc-400 transition-colors duration-300 hover:text-zinc-200"
                  onClick={() => switchMode("login")}
                >
                  Voltar ao login
                </button>
              </form>
            ) : (
              <form
                className="grid gap-4"
                aria-busy={busy}
                onSubmit={(e) => void handleEmailAuth(e)}
              >
                <FormField
                  label="E-mail"
                  required
                  htmlFor="email"
                  className="[&_label]:text-zinc-200"
                >
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className={inputClass}
                  />
                </FormField>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <FormLabel
                      htmlFor="password"
                      required
                      className="text-zinc-200"
                    >
                      {isSignup ? "Crie uma senha" : "Senha"}
                    </FormLabel>
                    {!isSignup ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-sky-400 underline-offset-4 transition-colors duration-300 hover:text-sky-300 hover:underline"
                        onClick={() => switchMode("forgot")}
                      >
                        Esqueci a senha
                      </button>
                    ) : null}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignup ? "Mínimo 6 caracteres" : undefined}
                    className={inputClass}
                  />
                </div>
                {error ? <AuthErrorCallout message={error} /> : null}
                {message ? (
                  <p className="text-sm text-sky-300">{message}</p>
                ) : null}
                <AuthPrimaryButton busy={busy}>
                  {isSignup ? "Criar minha conta" : "Entrar com e-mail"}
                </AuthPrimaryButton>
                {!isSignup ? (
                  <button
                    type="button"
                    disabled={busy || !email.trim()}
                    className="text-center text-sm text-zinc-400 transition-colors duration-300 hover:text-zinc-200 disabled:opacity-40"
                    onClick={() => void handleMagicLink()}
                  >
                    Entrar só com link no e-mail
                  </button>
                ) : null}
              </form>
            )}

            <p className="text-xs leading-relaxed text-zinc-500">
              Ao continuar, você aceita os{" "}
              <Link
                to="/terms"
                className="text-zinc-300 underline underline-offset-2 hover:text-white"
              >
                Termos
              </Link>{" "}
              e a{" "}
              <Link
                to="/privacy"
                className="text-zinc-300 underline underline-offset-2 hover:text-white"
              >
                Privacidade
              </Link>
              .
            </p>
          </div>

          <div className="relative hidden flex-col items-start justify-center overflow-hidden border-l border-white/10 bg-sky-950/40 p-8 md:flex">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-12 top-0 size-56 rounded-full bg-sky-400/15 blur-3xl"
            />
            <img
              src={BRAND.logoMarkSky}
              alt=""
              width={763}
              height={548}
              decoding="async"
              draggable={false}
              className="relative mb-6 w-24 h-auto object-contain"
            />
            <BrandWordmark size="lg" showSubtitle={false} />
            <p className="mt-4 max-w-[22ch] text-pretty text-sm leading-relaxed text-zinc-400">
              {isSignup
                ? "Orçamento, parcelas e o resto da vida na mesma órbita."
                : BRAND.wedge}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
