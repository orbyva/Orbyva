import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrbCapabilities, OrbCapabilitiesSeal } from "@/components/orb/OrbCapabilities";
import { ORB_APP_ONLY_TOOLS, orbTools } from "../../../../supabase/functions/_shared/orb/registry.ts";

/**
 * Passo 11 do roteiro de verificação da feature 100 — "abra 'O que eu sei consultar'" — virado
 * teste, em vez de olhada no navegador.
 *
 * O que está sendo protegido não é o layout: é a **honestidade do painel**. A 100 mudou o selo de
 * "somente leitura" para "só cria com a sua confirmação" justamente porque a primeira frase virou
 * mentira quando a Orb ganhou `propose_create` — e um selo de confiança que mente é pior que selo
 * nenhum. O rodapé do painel tinha ficado para trás nessa correção (ver `## Notas` da 100).
 */
const TOTAL_ESPERADO = orbTools.filter((t) => !ORB_APP_ONLY_TOOLS.includes(t.name)).length;

describe("selo de capacidades da Orb", () => {
  it("conta as consultas SEM as duas tools que não consultam", () => {
    render(<OrbCapabilitiesSeal />);
    expect(screen.getByText(`${TOTAL_ESPERADO} consultas disponíveis`)).toBeInTheDocument();
    // O número é o do catálogo menos `open_screen` e `propose_create`: navegar e propor criação
    // não são consulta, e contá-las inflaria o número com o nome errado.
    expect(TOTAL_ESPERADO).toBe(orbTools.length - ORB_APP_ONLY_TOOLS.length);
  });

  it("promete confirmação, e não 'somente leitura'", () => {
    render(<OrbCapabilitiesSeal />);
    expect(screen.getByText("só cria com a sua confirmação")).toBeInTheDocument();
    expect(screen.queryByText(/somente leitura/i)).not.toBeInTheDocument();
  });
});

describe("painel 'O que eu sei consultar'", () => {
  function abrir() {
    return render(<OrbCapabilities open onOpenChange={() => {}} />);
  }

  it("tem o grupo de navegação, com a tool de abrir tela dentro", () => {
    abrir();
    const titulo = screen.getByText("Abrir telas do app");
    const secao = titulo.closest("section");
    expect(secao).not.toBeNull();
    expect(within(secao as HTMLElement).getByText("Abrir tela")).toBeInTheDocument();
  });

  it("tem o grupo de criação, com a tool de propor criação dentro", () => {
    abrir();
    const titulo = screen.getByText("Criar (você confirma)");
    const secao = titulo.closest("section");
    expect(secao).not.toBeNull();
    expect(within(secao as HTMLElement).getByText("Criar (com confirmação)")).toBeInTheDocument();
  });

  it("o rodapé não desmente o grupo de criação que ele tem logo acima", () => {
    abrir();
    // A regressão real: "Não crio, não edito e não apago nada" convivendo com "Criar (você
    // confirma)" na mesma tela.
    expect(screen.queryByText(/Não crio, não edito e não apago nada/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Não edito e não apago nada/i)).toBeInTheDocument();
    expect(screen.getByText(/só passa a existir depois que você confirma/i)).toBeInTheDocument();
  });

  it("continua dizendo que simulação não grava nada", () => {
    abrir();
    expect(screen.getByText(/nada do que elas mostram fica registrado/i)).toBeInTheDocument();
  });

  it("todo grupo mostrado tem pelo menos uma tool — nenhum cabeçalho vazio", () => {
    abrir();
    // O `Sheet` renderiza em portal, fora do `container` do render — a busca é no documento.
    const secoes = document.body.querySelectorAll("section");
    expect(secoes.length).toBeGreaterThan(0);
    for (const secao of secoes) {
      expect(secao.querySelectorAll("li").length).toBeGreaterThan(0);
    }
  });
});
