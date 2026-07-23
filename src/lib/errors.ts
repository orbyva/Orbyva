export function getErrorMessage(error: unknown, fallback = "Ocorreu um erro inesperado."): string {
  if (error instanceof Error) {
    if (/acesso expirado|42501|trial/i.test(error.message)) {
      return "Seu período de teste acabou. Assine o Pro em Conta para continuar.";
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
    const msg = String((error as { message: unknown }).message);
    if (/acesso expirado|42501|trial/i.test(msg)) {
      return "Seu período de teste acabou. Assine o Pro em Conta para continuar.";
    }
    return msg || fallback;
  }
  return fallback;
}
