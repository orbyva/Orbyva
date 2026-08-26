# Produção social do Orbyva

Peças de Instagram e TikTok escritas em HTML/CSS com os tokens reais do produto e renderizadas em headless Chromium. Nada de editor gráfico: a arte é código, então dá para revisar em diff, corrigir um número e re-renderizar tudo em segundos.

O planejamento (copy, legendas, ordem de publicação, perfil) está em [`docs/social-media.md`](../../docs/social-media.md).

## Render

```bash
cd marketing/social
node render.mjs all           # tudo
node render.mjs posts         # out/posts/*.png        1080×1350
node render.mjs videos        # out/videos/*.mp4       1080×1920 + capa
node render.mjs profile       # out/profile/*.png      1080×1080
node render.mjs highlights    # out/highlights/*.png   1080×1920
node render.mjs videos v5     # filtra pelo nome do arquivo
node render.mjs contact       # remonta out/feed-grid.png
```

Requisitos: `playwright` (já no projeto) e `ffmpeg` no PATH.

Se o Playwright não achar o Chromium, o script procura o binário no cache e usa o que encontrar; para apontar à mão, use `ORBYVA_CHROMIUM=/caminho/do/binario`.

## Estrutura

| Caminho | O que é |
|---|---|
| `lib/orbyva.css` | design system: superfícies, esqueleto, tipografia, fragmentos de UI |
| `lib/anim.css` | camada de animação dos vídeos (fade, slide, scale, barra, contagem, traço) |
| `lib/kit.js` | injeta lockup, rodapé, assinatura de órbita, ícones, heatmap e números |
| `lib/mark.svg` | mark oficial vetorizado de `public/logo-mark.png` (o traço também vive em `kit.js`, com o comando que o regera) |
| `posts/` | 12 peças de feed |
| `videos/` | 8 peças verticais; `<meta name="duration">` define a duração |
| `highlights/` | 8 capas de Destaques |
| `profile/` | foto de perfil |
| `out/` | saída renderizada (não versionar) |

## Como o vídeo é gerado

As animações partem todas do tempo 0 e se posicionam por `animation-delay`. O render pausa a timeline pela Web Animations API, avança `currentTime` quadro a quadro a 30fps, tira um screenshot de cada quadro e junta tudo com ffmpeg. O resultado é determinístico — não é gravação de tela, e o mesmo commit sempre produz o mesmo MP4.

Cada vídeo também exporta `-capa.png`, o quadro a 93% da duração, para usar como capa do Reel.

## Ao editar uma peça

- Termos de módulo, submódulo e rótulo vêm da interface. O glossário obrigatório está no § 0 do documento de planejamento.
- `render.mjs` avisa quando algum elemento estoura a área útil do palco — trate o aviso como erro.
- Superfícies são três (`s-ink`, `s-paper`, `s-sky`) e alternam conforme a ordem de publicação; não crie uma quarta.
