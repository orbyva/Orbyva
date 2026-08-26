# Extensão Chrome do Orbyva

Painel lateral fixo: hábitos do dia, restante do orçamento, “está dentro do orçamento?” em páginas de produto e captura para cinema, livros, música e lugares.

A UI vive no app (`/ext`). A extensão só extrai a aba e abre o side panel.

## Carregar no Chrome (desenvolvimento)

1. Suba o app (`npm run dev` ou o deploy em `orbyva.app`).
2. Se for local, em `extension/config.js` troque `ORBYVA_ORIGIN` para `http://localhost:5173`.
3. Chrome → `chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação → pasta `extension/`.
4. Clique no ícone Orbyva. O painel abre à direita.

Entre na mesma conta do app no Chrome. A sessão do `orbyva.app` (ou localhost) vale no iframe.

## O que o v1 faz

- Check-in de hábitos
- Restante do orçamento do mês
- Em produto (Amazon, Mercado Livre, Magalu…): veredito **Está dentro do orçamento?** (à vista) e simulação **E se parcelar?** (1ª parcela vs restante do mês + calendário nos meses seguintes; usa a oferta Nx da página quando houver)
- Salvar: IMDb/Letterboxd → cinema; Goodreads/ISBN → livros; Spotify → música; Maps/Booking/Airbnb → lugares
- Menu de contexto “Abrir painel Orbyva”
- Chip flutuante em páginas de produto

## Fora do v1 (módulos ainda não prontos no app)

Read Later / artigos, lista de compras, tarefas/projetos, coleções de sites.
