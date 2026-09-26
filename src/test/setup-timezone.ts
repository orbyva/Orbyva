/**
 * Agenda, time-tracking e `format(..., "yyyy-MM-dd")` usam o fuso do processo.
 * Os testes (e o produto) são Brasília. Sem isso o CI (Ubuntu/UTC) lê `10:00-03:00`
 * como 13:00 e vira o dia 10 em 11.
 */
process.env.TZ = "America/Sao_Paulo";
