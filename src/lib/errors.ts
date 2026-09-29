type ErrorParts = { message: string; code: string };

function extractErrorParts(error: unknown): ErrorParts {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown };
    return {
      message: error.message || "",
      code: withCode.code != null ? String(withCode.code) : "",
    };
  }
  if (typeof error === "string") {
    return { message: error, code: "" };
  }
  if (error && typeof error === "object") {
    const obj = error as { message?: unknown; code?: unknown; error?: unknown };
    const nested =
      typeof obj.error === "string"
        ? obj.error
        : obj.error && typeof obj.error === "object" && "message" in obj.error
          ? String((obj.error as { message: unknown }).message)
          : "";
    return {
      message: obj.message != null ? String(obj.message) : nested,
      code: obj.code != null ? String(obj.code) : "",
    };
  }
  return { message: "", code: "" };
}

/** Mensagens já amigáveis em PT (ou de negócio), não sobrescrever. */
function looksTechnical(message: string): boolean {
  if (!message.trim()) return true;
  return (
    /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(
      message
    ) ||
    /\b(JWT|PGRST\d*|PostgREST|RLS|supabase|stripe|oauth|TMDB)\b/i.test(message) ||
    /\b(2350[0-9]|42P01|42501|22P02|P0001)\b/.test(message) ||
    /duplicate key|unique constraint|foreign key|violates|not-null constraint|null value in column/i.test(
      message
    ) ||
    /row-level security|permission denied for|policy/i.test(message) ||
    /invalid login|email not confirmed|user already registered|refresh_token|signup requires|password should be/i.test(
      message
    ) ||
    /FunctionsHttpError|FunctionsRelayError|non-2xx|Edge Function|status code/i.test(
      message
    ) ||
    /VITE_|API[_ ]?KEY|\.env\b|not configured|classId/i.test(message) ||
    /column .+ does not exist|could not find the (table|function)|relation .+ does not exist/i.test(
      message
    ) ||
    /TypeError|Cannot read propert|undefined is not|is not a function|JSON\.parse/i.test(
      message
    ) ||
    /migrations?|tenancy/i.test(message)
  );
}

function mapKnownError(message: string, code: string): string | null {
  const text = `${code} ${message}`.trim();

  // No Orbyva, 42501 é usado como sinal de trial expirado (além de privilégio Postgres).
  if (
    code === "42501" ||
    /\b42501\b/.test(text) ||
    /acesso expirado|trial/i.test(message)
  ) {
    return "Seu período de teste acabou. Assine o Pro em Conta para continuar.";
  }

  if (
    /failed to fetch|networkerror|load failed|network request failed|fetch failed|offline/i.test(
      text
    )
  ) {
    return "Sem conexão. Verifique a internet e tente de novo.";
  }

  if (
    /invalid login credentials|invalid credentials|wrong password|invalid email or password/i.test(
      text
    )
  ) {
    return "E-mail ou senha incorretos.";
  }
  if (/email not confirmed|confirm your email|email_not_confirmed/i.test(text)) {
    return "Confirme o e-mail antes de entrar. Veja a caixa de entrada.";
  }
  if (
    /user already registered|already been registered|email address is already/i.test(
      text
    )
  ) {
    return "Já existe uma conta com este e-mail.";
  }
  if (/password should be at least|password is too short/i.test(text)) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }
  if (
    /unable to validate email|invalid email|email address.*invalid/i.test(text)
  ) {
    return "Informe um e-mail válido.";
  }
  if (
    code === "RATE_LIMITED" ||
    /for security purposes.*only request this after|over_request_rate|rate limit/i.test(
      text
    )
  ) {
    return "Aguarde um momento antes de tentar de novo.";
  }
  if (code === "ALREADY_SUBSCRIBED") {
    return "Você já tem uma assinatura ativa. Gerencie pelo portal na Conta.";
  }
  if (code === "CHECKOUT_IN_PROGRESS") {
    return "Já estamos abrindo o checkout. Tente de novo em instantes.";
  }
  if (
    /refresh_token|session.*expired|JWT expired|invalid JWT|Auth session missing|not authenticated/i.test(
      text
    ) ||
    code === "PGRST301"
  ) {
    return "Sua sessão expirou. Entre novamente.";
  }
  if (/signups not allowed|signup is disabled/i.test(text)) {
    return "Cadastro indisponível no momento.";
  }

  if (
    code === "23503" ||
    /foreign key|violates foreign key|is still referenced/i.test(text)
  ) {
    return "Não é possível excluir: ainda há itens ligados a este registro.";
  }
  if (code === "23505" || /duplicate key|unique constraint/i.test(text)) {
    return "Já existe um registro igual.";
  }
  if (code === "23502" || /not-null constraint|null value in column/i.test(text)) {
    return "Preencha todos os campos obrigatórios.";
  }
  if (
    /row-level security|permission denied for|violates.*policy/i.test(text)
  ) {
    return "Sem permissão para esta ação.";
  }
  if (code === "PGRST116" || /JSON object requested, multiple \(or no\) rows/i.test(text)) {
    return "Registro não encontrado.";
  }
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST202" ||
    /could not find the (table|function)|relation .+ does not exist/i.test(text)
  ) {
    return "Serviço temporariamente indisponível. Tente mais tarde.";
  }
  if (/column .+ does not exist/i.test(text)) {
    return "Serviço temporariamente indisponível. Tente mais tarde.";
  }

  if (
    /FunctionsHttpError|FunctionsRelayError|non-2xx|Edge Function returned/i.test(
      text
    )
  ) {
    return "Não foi possível concluir a operação. Tente de novo.";
  }

  // Antes do mapeamento genérico de `API_KEY` (catálogos): a Orb usa GEMINI_API_KEY.
  if (/Orb não configurada|GEMINI_API_KEY/i.test(text)) {
    return "A Orb não está configurada no momento. Tente mais tarde.";
  }

  if (
    /VITE_|API[_ ]?KEY|\.env\b|TMDB não configurada|TMDB \d+|SPOTIFY_NOT_CONFIGURED|Google Books|catálogo de (música|cinema|livros).*(indisponível|não configurado)/i.test(
      text
    )
  ) {
    return "Catálogo temporariamente indisponível. Tente mais tarde.";
  }

  if (/classId/i.test(text)) {
    return "Não foi possível importar o arquivo. Verifique o formato e tente de novo.";
  }

  if (/Canvas não suportado/i.test(message)) {
    return "Seu navegador não permite gerar esta imagem.";
  }

  return null;
}

export function getErrorMessage(
  error: unknown,
  fallback = "Ocorreu um erro inesperado. Tente de novo."
): string {
  const { message, code } = extractErrorParts(error);
  const mapped = mapKnownError(message, code);
  if (mapped) return mapped;

  if (message && !looksTechnical(message)) {
    return message;
  }

  return fallback;
}

/** Converte erro PostgREST/`unknown` em Error (evita unhandledrejection de objeto cru). */
export function toAppError(
  error: unknown,
  fallback = "Ocorreu um erro inesperado. Tente de novo."
): Error {
  if (error instanceof Error) {
    const friendly = getErrorMessage(error, fallback);
    if (friendly !== error.message) return new Error(friendly);
    return error;
  }
  return new Error(getErrorMessage(error, fallback));
}
