export const AGENT_SYSTEM_PROMPT = `Consultor financeiro Orbyva — ver Edge Function para prompt completo.`;

export const SUGGESTED_QUESTIONS = [
  "Qual foi meu saldo no mês?",
  "Quais foram meus maiores gastos?",
  "Quais classes mais impactaram o resultado?",
  "Existe algum ponto de atenção nos meus dados?",
  "Me dê um resumo financeiro do período",
  "Cadastre uma nova despesa",
] as const;

export const AGENT_WELCOME_MESSAGE =
  "Olá! Sou seu consultor financeiro no Orbyva.\n\n" +
  "Analiso seus dados reais — receitas, despesas, orçamento e parcelas — sempre com natureza, tipo e classe quando aplicável.\n\n" +
  "Cada resposta traz **Resumo**, **Detalhamento**, **Ponto de atenção** e **Recomendação**. " +
  "Para cadastrar, descreva valor, descrição e categoria — eu confirmo antes de gravar.\n\n" +
  "Por onde começamos?";
