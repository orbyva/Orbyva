# Extensão Chrome do Orbyva

Painel lateral: tarefas do dia, contadores, hábitos, restante do orçamento, “está dentro do orçamento?” em páginas de produto e captura para links, compras, cinema, livros, música e lugares.

A UI vive no app (`/ext`). A extensão só extrai a aba e abre o side panel.

## Carregar no Chrome (desenvolvimento)

1. Suba o app (`npm run dev` ou o deploy em `orbyva.app`).
2. Se for local, em `extension/config.js` troque `ORBYVA_ORIGIN` para `http://localhost:5173`.
3. Chrome → `chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação → pasta `extension/`.
4. Clique no ícone Orbyva. O painel abre à direita.

Entre na mesma conta do app no Chrome. A sessão do `orbyva.app` (ou localhost) vale no iframe.

## O que faz

- Contadores: atrasadas, hoje, compras pendentes, links para consumir, hábitos restantes
- Tarefas de hoje e atrasadas: concluir no toque; criar já com o URL da aba
- Check-in de hábitos
- Restante do orçamento do mês
- Em produto (Amazon, Mercado Livre, Magalu…): **Adicionar à lista** (título + link do fornecedor) + veredito **Está dentro do orçamento?** e simulação **E se parcelar?**
- Em qualquer outra página: **Salvar em Links** (artigo/vídeo/site; YouTube vira vídeo)
- **Já está em…** quando o mesmo URL (ou o título no catálogo) já foi salvo
- Compra: escolher categoria; tarefa: escolher projeto
- **Clipar em nota**: título + URL + descrição da aba
- Próxima dose pendente (hoje ou atrasada) com um toque para marcar
- Salvar catálogo: IMDb/Letterboxd → cinema; Goodreads/ISBN → livros; Spotify → música; Maps/Booking/Airbnb → lugares
- Menu de contexto “Abrir painel Orbyva”
- Chip flutuante em páginas de produto
