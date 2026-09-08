import { Link } from "react-router-dom";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { AgendaGrid } from "./AgendaGrid";

export default function AgendaCalendar() {
  return (
    <PageShell
      title="Agenda"
      description="Tarefas com prazo, tarefas pontuais, eventos de projeto e pagamentos vinculados, num calendário só."
      eyebrow="Produtividade"
      actions={
        // Feature 102: a página deixou de ser um beco alcançado só pela URL e virou destino da
        // sidebar — sem este link, o caminho de volta para a lista dependia do botão do navegador.
        <Button variant="outline" asChild>
          <Link to="/tasks">Ir para Tarefas</Link>
        </Button>
      }
    >
      <AgendaGrid />
    </PageShell>
  );
}
