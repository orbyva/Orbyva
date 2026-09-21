import { PageShell } from "@/components/PageShell";
import { OrbChat } from "@/components/orb/OrbChat";

/**
 * Altura por flexbox, não por conta de viewport. O `h-[calc(100dvh-6rem)]` de antes chutava a
 * moldura do `AdminLayout` e errava no mobile: lá o cabeçalho tem 3rem e o contêiner do conteúdo
 * ainda reserva 3.75rem + safe-area para a barra inferior — mais que as 6rem descontadas, então o
 * composer terminava atrás da barra. Como `SidebarInset` é `min-h-svh` e esse contêiner é
 * `flex flex-1 flex-col`, `flex-1 min-h-0` herda exatamente a altura que sobrou, já com o desconto
 * da barra inferior, e o composer nunca passa dela.
 */
const ALTURA_DA_PAGINA = "flex min-h-0 flex-1 flex-col";

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
