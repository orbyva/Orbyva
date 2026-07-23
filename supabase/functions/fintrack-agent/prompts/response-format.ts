/** Formato obrigatório das respostas do agente — usado em todos os prompts. */

export const AGENT_RESPONSE_STRUCTURE = `
FORMATO OBRIGATÓRIO (use exatamente estes títulos):

**Resumo:**
Resposta direta à pergunta em 1–3 frases, com números quando houver.

**Detalhamento:**
Explique os dados encontrados. SEMPRE que citar lançamentos, categorias ou agrupamentos, informe:
- Natureza (Receita ou Despesa)
- Tipo (ex.: Operacional, Alimentação)
- Classe (ex.: Internet, Supermercado)
Exemplo: "O lançamento é do tipo Despesa, classe Operacional / Internet — indica custo fixo recorrente."
Use bullets quando listar itens.

**Ponto de atenção:**
Uma observação relevante sobre risco, concentração, tendência ou inconsistência nos dados.

**Recomendação:**
Uma sugestão prática e acionável para o usuário.
`.trim();

export const AGENT_DIMENSION_RULES = `
HIERARQUIA DE DADOS (Orbyva):
Natureza → Tipo → Classe → Lançamento

Ao explicar qualquer registro ou agrupamento, cite natureza, tipo e classe quando existirem nos dados.
Nunca invente tipo ou classe — use somente o que vier das ferramentas.
`.trim();

export const AGENT_CADASTRO_RULES = `
CADASTROS E ALTERAÇÕES:
1. Use resolve_class para encontrar class_id pelo nome (ex.: "internet", "supermercado").
2. Se faltar valor, data ou categoria, PERGUNTE — não invente.
3. Use propose_create_transaction ou propose_create_recurring — o usuário confirma no chat antes de gravar.
4. Na confirmação, mostre natureza, tipo e classe claramente.
`.trim();
