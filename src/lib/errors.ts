export function getErrorMessage(error: unknown, fallback = "Ocorreu um erro inesperado."): string {
  if (error instanceof Error) {
    if (/acesso expirado|42501|trial/i.test(error.message)) {
      return "Seu período de teste acabou. Assine o Pro em Conta para continuar.";
    }
    if (/23503|foreign key|referenced|vinculad/i.test(error.message)) {
      return "Não é possível excluir: ainda há registros vinculados.";
    }
    return error.message;
  }
  if (typeof error === "string") {
    if (/acesso expirado|42501|trial/i.test(error)) {
      return "Seu período de teste acabou. Assine o Pro em Conta para continuar.";
    }
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const code =
      "code" in error ? String((error as { code: unknown }).code) : "";
    const msg = String((error as { message: unknown }).message);
    if (code === "23503" || /foreign key|referenced/i.test(msg)) {
      return "Não é possível excluir: ainda há registros vinculados.";
    }
    if (/acesso expirado|42501|trial/i.test(msg)) {
      return "Seu período de teste acabou. Assine o Pro em Conta para continuar.";
    }
    return msg || fallback;
  }
  return fallback;
}

/** Converte erro PostgREST/`unknown` em Error (evita unhandledrejection de objeto cru). */
export function toAppError(
  error: unknown,
  fallback = "Ocorreu um erro inesperado."
): Error {
  if (error instanceof Error) return error;
  return new Error(getErrorMessage(error, fallback));
}
