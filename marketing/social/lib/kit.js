/*
 * Monta o esqueleto fixo de toda peça social: lockup, eyebrow, índice, rodapé
 * e a assinatura de órbita. Dirigido por data-attributes no .stage — assim
 * nenhuma peça reescreve o cabeçalho à mão e a identidade não desalinha.
 */

/* Traço do mark, gerado — ver mark() abaixo para o comando que regera.
   Coordenadas na saída do potrace: décimos de ponto e eixo Y invertido; os dois
   transforms em mark() levam isso para o viewBox do glifo. */
const MARK_D = [
  "M9715 16529 c-323 -18 -689 -73 -987 -149 -43 -11 -115 -29 -160 -41 -46 -11 -105 -29 -133 -39 -27 -9 -81 -27 -120 -39 -38 -12 -110 -38 -159 -57 -49 -20 -110 -42 -135 -51 -25 -8 -74 -28 -109 -44 -34 -16 -65 -29 -67 -29 -3 0 -78 -35 -168 -79 -174 -84 -372 -192 -477 -259 -36 -23 -81 -50 -100 -61 -31 -17 -103 -66 -294 -201 -88 -63 -323 -254 -438 -357 -332 -297 -684 -706 -928 -1078 -21 -31 -152 -246 -166 -270 -84 -149 -113 -204 -172 -326 -39 -79 -87 -182 -107 -229 -20 -47 -40 -94 -45 -105 -32 -70 -125 -346 -168 -495 -79 -277 -99 -367 -156 -715 -33 -196 -41 -342 -41 -720 0 -377 7 -499 40 -700 9 -49 20 -119 25 -155 20 -124 71 -385 80 -405 5 -11 18 -56 29 -100 32 -127 110 -379 146 -475 9 -25 26 -70 37 -100 36 -96 180 -424 194 -439 11 -12 42 -12 206 -2 106 6 240 16 298 21 58 5 161 14 230 20 339 29 956 105 974 121 8 7 -47 116 -88 174 -94 129 -300 542 -361 720 -7 22 -25 72 -40 110 -143 379 -235 889 -235 1295 1 154 32 452 66 625 79 403 227 802 421 1138 18 32 33 60 33 62 0 2 18 31 40 64 22 33 40 62 40 65 0 3 14 25 30 48 17 24 45 66 64 93 128 194 460 550 665 716 120 96 332 251 376 275 17 8 55 31 85 49 138 86 588 298 660 312 14 2 34 9 45 14 33 15 256 85 315 99 30 7 89 20 130 30 171 42 501 83 775 96 188 8 452 -11 715 -53 140 -22 461 -105 566 -147 50 -20 95 -36 101 -36 26 0 320 -139 472 -222 57 -32 107 -58 112 -58 5 0 9 -5 9 -10 0 -6 12 -16 28 -23 22 -9 135 -83 256 -167 187 -129 554 -479 709 -675 99 -126 287 -399 287 -417 0 -6 9 -21 19 -32 20 -22 134 -231 175 -319 13 -29 33 -72 44 -97 60 -131 82 -184 82 -199 0 -10 4 -21 9 -26 6 -6 32 -77 59 -160 46 -138 63 -198 113 -390 20 -78 52 -250 69 -365 6 -41 15 -99 21 -129 5 -30 9 -67 9 -82 0 -15 4 -30 9 -33 5 -3 35 9 68 28 187 107 260 150 273 161 8 7 22 15 30 16 20 5 777 459 940 564 19 12 59 37 88 55 59 38 59 38 33 155 -23 103 -100 395 -106 406 -3 4 -9 27 -14 51 -11 55 -148 449 -160 461 -6 6 -58 1 -134 -12 -226 -38 -500 -23 -711 40 -94 28 -227 88 -306 138 -36 22 -78 48 -95 57 -61 34 -179 139 -263 235 -108 122 -201 270 -267 421 -47 110 -95 307 -115 471 -20 172 21 465 91 640 12 28 28 70 36 92 8 21 31 66 51 98 l37 60 -40 34 c-49 42 -216 163 -305 220 -87 56 -279 173 -284 173 -2 0 -47 25 -101 55 -53 30 -99 55 -102 55 -3 0 -60 27 -127 59 -214 105 -543 229 -745 282 -42 12 -110 29 -151 40 -83 22 -271 63 -365 80 -33 6 -80 15 -105 20 -178 36 -609 70 -860 67 -85 0 -222 -5 -305 -9z",
  "M14350 15725 c-116 -17 -219 -50 -320 -102 -207 -107 -358 -260 -465 -473 -51 -101 -71 -163 -96 -294 -72 -374 90 -781 406 -1016 161 -121 314 -183 510 -206 134 -16 247 -8 385 28 224 57 475 237 598 428 141 220 198 446 173 685 -27 255 -119 458 -286 634 -95 99 -183 165 -301 224 -112 57 -180 76 -314 92 -145 17 -175 17 -290 0z",
  "M15991 14358 c-13 -35 3 -54 56 -68 84 -21 265 -91 355 -136 138 -69 217 -122 296 -198 99 -96 154 -189 183 -307 22 -90 23 -95 8 -198 -32 -217 -162 -451 -395 -705 -124 -137 -168 -181 -269 -276 -87 -80 -333 -285 -440 -365 -37 -27 -85 -65 -108 -84 -37 -30 -169 -124 -268 -191 -78 -53 -307 -205 -384 -255 -84 -55 -561 -343 -630 -380 -22 -12 -94 -52 -160 -90 -167 -94 -194 -108 -420 -225 -278 -145 -625 -316 -655 -325 -14 -4 -32 -13 -40 -20 -8 -7 -42 -25 -75 -40 -33 -15 -106 -49 -163 -76 -57 -27 -106 -49 -109 -49 -3 0 -29 -11 -57 -24 -89 -43 -188 -87 -275 -122 -46 -19 -109 -46 -140 -61 -31 -14 -94 -41 -141 -60 -47 -19 -98 -41 -115 -48 -16 -7 -61 -25 -100 -40 -38 -15 -83 -33 -100 -40 -86 -35 -140 -57 -235 -94 -214 -83 -418 -160 -530 -201 -63 -23 -131 -48 -150 -57 -19 -9 -48 -19 -65 -24 -16 -4 -66 -21 -110 -37 -159 -59 -205 -74 -510 -177 -170 -57 -371 -122 -445 -145 -74 -23 -178 -54 -230 -70 -52 -16 -122 -36 -155 -45 -33 -8 -80 -21 -105 -29 -117 -35 -466 -132 -505 -140 -16 -3 -64 -15 -105 -27 -106 -29 -532 -134 -650 -159 -25 -6 -117 -26 -205 -46 -88 -19 -185 -39 -215 -44 -30 -4 -74 -13 -98 -19 -23 -7 -70 -16 -105 -21 -34 -5 -177 -30 -317 -54 -313 -56 -371 -65 -875 -131 -368 -48 -740 -74 -1175 -82 -419 -7 -693 9 -1110 67 -113 15 -353 69 -475 107 -296 92 -513 224 -610 372 -46 70 -93 203 -102 286 -9 92 42 293 116 458 84 187 312 507 520 732 31 33 79 85 107 115 27 30 152 153 277 274 125 120 224 222 221 227 -6 11 -103 -55 -337 -232 -402 -304 -729 -605 -928 -854 -101 -127 -219 -288 -219 -298 0 -3 -12 -23 -26 -44 -49 -72 -132 -248 -168 -358 -45 -138 -60 -243 -52 -367 7 -114 23 -179 66 -279 134 -306 429 -544 890 -719 135 -51 174 -63 350 -109 116 -30 224 -51 445 -90 337 -59 747 -85 1205 -77 184 3 398 10 475 15 77 5 145 7 151 4 6 -2 77 -77 157 -167 80 -89 208 -223 284 -297 546 -530 1210 -949 1898 -1198 657 -237 1310 -338 2015 -310 387 16 766 73 1135 173 115 31 474 152 514 172 14 8 30 14 35 14 18 0 238 96 386 170 264 130 389 201 600 339 505 331 892 677 1235 1102 33 41 65 79 71 84 10 9 81 105 199 273 108 151 285 452 382 647 114 229 221 497 297 745 81 263 81 264 110 385 70 302 94 435 135 765 6 41 13 131 17 200 4 69 10 135 15 147 4 12 23 30 41 39 30 15 286 184 438 290 80 56 171 125 302 229 55 44 114 91 131 105 193 152 652 598 717 696 8 12 51 69 95 126 121 155 238 343 305 491 31 69 81 214 98 287 63 259 10 525 -143 728 -131 173 -287 282 -560 390 -142 56 -419 124 -580 141 -154 17 -184 15 -194 -11z m-2422 -4576 c-16 -48 -34 -96 -39 -107 -5 -11 -15 -36 -23 -55 -114 -269 -187 -412 -315 -620 -36 -58 -72 -116 -80 -130 -48 -80 -196 -269 -334 -427 -139 -161 -348 -349 -563 -507 -69 -51 -282 -188 -340 -220 -16 -9 -37 -20 -45 -25 -44 -27 -333 -166 -399 -193 -239 -95 -620 -204 -781 -223 -30 -3 -77 -10 -105 -15 -84 -16 -393 -40 -515 -40 -209 0 -591 40 -770 81 -261 60 -506 137 -675 212 -75 34 -341 166 -390 195 -146 84 -305 189 -305 200 0 4 19 13 43 20 44 13 245 56 332 72 61 11 271 61 595 141 251 62 296 74 530 139 74 21 153 42 175 48 22 6 92 26 155 45 63 20 192 59 285 87 203 61 684 221 880 291 256 92 314 113 455 168 58 22 119 43 135 47 17 4 35 10 40 14 6 5 87 38 180 75 274 108 467 186 510 205 22 10 60 25 85 35 72 27 402 171 555 242 220 102 234 109 340 158 55 26 141 66 190 90 158 76 205 95 217 88 4 -2 -6 -43 -23 -91z"
];

/*
 * Mark oficial da marca, vetorizado a partir de `public/logo-mark.png` — o
 * mesmo arquivo que o produto usa. Igual em `lib/mark.svg`; para regerar:
 *
 *   magick public/logo-mark.png -channel R -separate +channel \
 *     -resize 2048x2048 -threshold 55% -morphology close disk:1 pgm:- \
 *     | potrace --svg --turdsize 4 --alphamax 1.0 --opttolerance 0.15 -
 *
 * Chapado em `currentColor` de propósito: precisa virar branco no Sky e sky no
 * Ink/Paper. O degradê do PNG original não sobreviveria a essa troca.
 */
const MARK_PATHS = MARK_D.map((d) => `<path d="${d}"/>`).join("");
const mark = () =>
  `<svg viewBox="0 0 1528 1094" fill="currentColor" preserveAspectRatio="xMidYMid meet">
  <g transform="translate(-224,-392)"><g transform="translate(0,2048) scale(0.1,-0.1)">${MARK_PATHS}</g></g>
</svg>`;

/*
 * Assinatura de fundo: duas órbitas concêntricas na inclinação do mark.
 * Só duas — com três, os tracejados se cruzam e viram rabisco no canto.
 */
const SIG = `<svg viewBox="0 0 400 400" fill="none" stroke="currentColor">
  <g transform="rotate(-24 200 200)">
    <ellipse cx="200" cy="200" rx="196" ry="67" stroke-width="2.2" stroke-dasharray="16 20"/>
    <ellipse cx="200" cy="200" rx="132" ry="45" stroke-width="1.8" opacity="0.55"/>
  </g>
</svg>`;

/* embrulho dos paths do Lucide com os atributos padrão da biblioteca */
const lucide = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const ICONS = {
  arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5L2.5 9.5l6.6-.9Z"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/></svg>`,

  /* Lucide, exatamente os mesmos ícones que cada módulo usa no app */
  wallet: lucide(`<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>`),
  piggy: lucide(`<path d="M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z"/><path d="M16 10h.01"/><path d="M2 8v1a2 2 0 0 0 2 2h1"/>`),
  repeat: lucide(`<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>`),
  flame: lucide(`<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`),
  target: lucide(`<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`),
  plane: lucide(`<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>`),
  sparkles: lucide(`<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>`),
};

const MODULE_VARS = {
  hub: "--m-hub",
  finance: "--m-finance",
  life: "--m-life",
  travel: "--m-travel",
  cinema: "--m-cinema",
  car: "--m-car",
};

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

document.querySelectorAll(".stage").forEach((stage) => {
  const d = stage.dataset;

  if (d.module && MODULE_VARS[d.module]) {
    stage.style.setProperty("--mod", `var(${MODULE_VARS[d.module]})`);
  }

  const sig = d.sig || "br";
  if (sig !== "none") {
    stage.prepend(el(`<div class="orbit-sig orbit-sig--${sig}">${SIG}</div>`));
  }
  stage.prepend(el(`<div class="atmo"></div>`));

  if (d.head !== "none") {
    stage.prepend(
      el(`<div class="head-row">
        <div class="lockup">
          <div class="mark">${mark()}</div>
          <div class="wordmark"><i>O</i>RBYV<i>Λ</i></div>
        </div>
        ${d.eyebrow ? `<div class="eyebrow">${d.eyebrow}</div>` : ""}
        ${d.idx ? `<div class="idx">${d.idx}</div>` : ""}
      </div>`)
    );
  }

  if (d.foot !== "none") {
    stage.append(
      el(`<div class="foot">
        <span>orbyva.app</span>
        <span class="dot"></span>
        <span>@orbyva</span>
        ${d.cta ? `<span class="cta">${d.cta}${ICONS.arrow}</span>` : ""}
      </div>`)
    );
  }
});

/* Mark em qualquer lugar: <div class="mark"></div>, <div class="mk"></div>, [data-mark] */
document
  .querySelectorAll(".constel .mk, [data-mark]")
  .forEach((n) => {
    if (!n.querySelector("svg")) n.innerHTML = mark();
  });

/* Ícones declarativos: <span data-icon="alert"></span> */
document.querySelectorAll("[data-icon]").forEach((n) => {
  n.innerHTML = ICONS[n.dataset.icon] || "";
});

/* Estrelas declarativas: <span class="stars" data-stars="4"></span> (de 5) */
document.querySelectorAll("[data-stars]").forEach((n) => {
  const filled = Number(n.dataset.stars);
  n.innerHTML = Array.from({ length: 5 }, (_, i) =>
    i < filled ? ICONS.star : `<span class="off">${ICONS.star}</span>`
  ).join("");
});

/* Heatmap declarativo: data-heat="pattern" onde d=feito p3/p2=parcial m=falhou .=vazio f=futuro N=hoje */
document.querySelectorAll("[data-heat]").forEach((n) => {
  const map = { d: "d", "3": "p3", "2": "p2", m: "m", ".": "", f: "f", N: "d now" };
  // data-heat-anim="início,passo" (em segundos) faz as células entrarem em cascata
  const [start, step] = (n.dataset.heatAnim || "").split(",").map(Number);
  const staggered = Number.isFinite(start) && Number.isFinite(step);

  n.innerHTML = n.dataset.heat
    .replace(/\s/g, "")
    .split("")
    .map((c, i) => {
      const cls = [map[c] ?? "", staggered ? "a" : ""].filter(Boolean).join(" ");
      const style = staggered ? ` style="--d:${(start + i * step).toFixed(3)}s"` : "";
      return `<i class="${cls}"${style}></i>`;
    })
    .join("");
});

/* Faixa da semana: data-week="1101100" com data-week-now="0" (índice de hoje) */
document.querySelectorAll("[data-week]").forEach((n) => {
  const now = Number(n.dataset.weekNow ?? -1);
  const days = ["S", "T", "Q", "Q", "S", "S", "D"];
  n.innerHTML = n.dataset.week
    .split("")
    .map(
      (c, i) =>
        `<span class="${c === "1" ? "on" : ""}${i === now ? " now" : ""}">${days[i]}</span>`
    )
    .join("");
});

/*
 * Números animados. O CSS anima só o progresso (--n, de 0 a 1) porque counter()
 * não formata milhar nem centavo; a formatação em pt-BR fica aqui.
 *
 *   <span data-count="8880.10" data-count-fmt="brl" style="--d:2.6s">
 *
 * O render.mjs chama __orbyvaTick() depois de fixar a timeline em cada quadro.
 */
const FMT = {
  brl: (v) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  int: (v) => Math.round(v).toLocaleString("pt-BR"),
  pct: (v) => Math.round(v) + "%",
  frac: (v, el) => `${Math.round(v)}/${el.dataset.countTotal || 5}`,
};

const counters = [...document.querySelectorAll("[data-count]")];

window.__orbyvaTick = () => {
  counters.forEach((el) => {
    const target = Number(el.dataset.count);
    const n = Number(getComputedStyle(el).getPropertyValue("--n")) || 0;
    const fmt = FMT[el.dataset.countFmt || "int"];
    el.textContent = fmt(target * n, el);
  });
};

window.__orbyvaTick();
window.__orbyvaKitReady = true;
