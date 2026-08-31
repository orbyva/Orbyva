import { PageShell } from "@/components/PageShell";
import { AgendaGrid } from "./AgendaGrid";

export default function AgendaCalendar() {
  return (
    <PageShell
      title="Agenda"
      description="Tarefas, eventos de projeto e pagamentos vinculados, num calendário só."
      eyebrow="Produtividade"
    >
      <AgendaGrid />
    </PageShell>
  );
}
