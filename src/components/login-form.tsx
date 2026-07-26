import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND } from "@/lib/brand";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { getErrorMessage } from "@/lib/errors";

type AuthMode = "login" | "signup";

function modeFromSearch(raw: string | null): AuthMode {
  return raw === "signup" || raw === "register" || raw === "criar"
    ? "signup"
    : "login";
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  useEffect(() => {
    setMode(modeFromSearch(searchParams.get("mode")));
  }, [searchParams]);

  function switchMode(next: AuthMode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setMessage(null);
    setPassword("");
    const params = new URLSearchParams(searchParams);
    if (next === "signup") params.set("mode", "signup");
    else params.delete("mode");
    setSearchParams(params, { replace: true });
  }

  async function handleGoogleLogin(event: React.FormEvent | React.MouseEvent) {
    event.preventDefault();
    track(isSignup ? "signup_google_click" : "login_google_click");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/home`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
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
        navigate("/home", { replace: true });
        return;
      }

      track("signup_email_submit");
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/home`,
        },
      });
      if (signUpError) throw signUpError;
      if (data.session) {
        navigate("/home", { replace: true });
        return;
      }
      setMessage(
        "Conta criada. Se o Supabase exigir confirmação, verifique seu e-mail."
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
              <h1 className="text-2xl font-bold tracking-tight">
                {isSignup ? "Crie sua conta" : "Bem-vindo de volta"}
              </h1>
              <p className="mt-1 text-balance text-sm text-muted-foreground">
                {isSignup
                  ? "7 dias grátis com tudo liberado. Sem cartão no início."
                  : `${BRAND.tagline}. Entre para continuar.`}
              </p>
            </div>

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

            {isSignup ? (
              <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-center text-xs text-muted-foreground">
                Novo por aqui — em poucos segundos você entra no Life OS com
                orçamento, parcelas e o resto dos módulos.
              </p>
            ) : null}

            <Button
              type="button"
              className="w-full"
              onClick={handleGoogleLogin}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="mr-2 h-4 w-4"
                aria-hidden
              >
                <path
                  d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                  fill="currentColor"
                />
              </svg>
              {isSignup ? "Criar conta com Google" : "Continuar com Google"}
            </Button>

            <div className="relative text-center text-xs text-muted-foreground">
              <span className="bg-card relative z-10 px-2">
                {isSignup ? "ou cadastre com e-mail" : "ou e-mail"}
              </span>
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
            </div>

            <form
              className="grid gap-3"
              onSubmit={(e) => void handleEmailAuth(e)}
            >
              <div className="grid gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">
                  {isSignup ? "Crie uma senha" : "Senha"}
                </Label>
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
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
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
            </form>

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
                  Comece agora — orçamento, parcelas e o resto da vida na mesma
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
