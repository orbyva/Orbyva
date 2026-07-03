import { getErrorMessage } from "@/lib/errors";

/** Mensagem amigável para erros do assistente (Groq / Gemini / Edge Function). */
export function formatAgentErrorMessage(error: unknown): string {
  const raw = getErrorMessage(error);

  if (/429|RESOURCE_EXHAUSTED|quota|rate.?limit|rate limit/i.test(raw)) {
    if (/groq/i.test(raw)) {
      return (
        "Limite da API Groq atingido. Aguarde ~1 minuto ou confira console.groq.com. " +
        "Perguntas simples (ex.: gastos do mês) não usam IA quando possível."
      );
    }
    return (
      "Limite de uso da API de IA atingido. Aguarde ~1 minuto. " +
      "Recomendamos usar Groq (GROQ_API_KEY) em vez de Gemini."
    );
  }

  if (/403|401|API key|PERMISSION_DENIED|invalid.*key/i.test(raw)) {
    if (/groq/i.test(raw)) {
      return "Chave Groq inválida. Confira GROQ_API_KEY nos secrets da Edge Function fintrack-agent.";
    }
    return "Chave de API de IA inválida. Verifique GROQ_API_KEY ou GEMINI_API_KEY no Supabase.";
  }

  if (/GROQ_API_KEY não configurada|GEMINI_API_KEY não configurada|Nenhum provedor de IA/i.test(raw)) {
    return (
      "Assistente não configurado. Crie uma chave grátis em console.groq.com e defina GROQ_API_KEY nos secrets da Edge Function fintrack-agent."
    );
  }

  if (/Sessão expirada/i.test(raw)) {
    return raw;
  }

  if (/Edge Function|fintrack-agent|Failed to send/i.test(raw)) {
    return (
      "Não foi possível contactar o assistente. Verifique se a Edge Function fintrack-agent está publicada no Supabase."
    );
  }

  if (raw.includes('"error"') && raw.includes("generativelanguage.googleapis.com")) {
    return formatAgentErrorMessage("429 quota exceeded");
  }

  if (raw.length > 280) {
    return `${raw.slice(0, 280)}…`;
  }

  return raw;
}
