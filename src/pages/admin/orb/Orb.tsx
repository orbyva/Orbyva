import { PageShell } from "@/components/PageShell";
import { OrbChat } from "@/components/orb/OrbChat";

/**
 * O `SidebarInset` é `min-h-svh` — piso, não teto. Com só `flex-1 min-h-0`, a página cresce junto
 * com a resposta (carrossel de pôsteres, listas longas) e o composer desce para baixo da dobra:
 * parece que a caixa de pergunta sumiu. O teto em `dvh` trava a página na altura útil; a lista
 * rola por dentro e o campo fica sempre à vista.
 *
 * Cabeçalho do AdminLayout: `h-12` (3rem) no mobile, `sm:h-14` (3.5rem) no desktop. A reserva da
 * barra inferior mobile (`pb-[3.75rem+safe-area]` no contêiner do Outlet) fica FORA deste teto —
 * ela empurra o shell para cima da barra, sem a gente descontar de novo e esconder o composer.
 */
const ALTURA_DA_PAGINA =
  // Largura quase total: o `max-w-7xl` do PageShell deixa a conversa estreita demais nesta tela.
  "max-w-none " +
  "flex min-h-0 flex-1 flex-col overflow-hidden " +
  "max-h-[calc(100dvh-3.5rem)] max-md:max-h-[calc(100dvh-3rem)] " +
  "[&>section]:shrink-0";

export default function Orb() {
  return (
    <PageShell
      eyebrow="Orb"
      title="Converse com a Orb"
      description="A IA do Orbyva, com acesso de leitura aos seus dados."
      className={ALTURA_DA_PAGINA}
    >
      <OrbChat />
    </PageShell>
  );
}
