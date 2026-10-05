// Antes do React: pinta o fundo com o tema salvo (mesma chave do Header / NavUser), senão quem usa
// o claro vê o fundo escuro do index.html piscar no reload. Arquivo e não inline por causa da CSP.
(function () {
  try {
    if (localStorage.getItem("theme") === "light") {
      document.documentElement.classList.add("theme-boot-light");
    }
  } catch (e) {}
})();
