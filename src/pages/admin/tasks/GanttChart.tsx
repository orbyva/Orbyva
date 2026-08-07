import { useEffect, useState } from "react";
import { Gantt, Willow, WillowDark } from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/all.css";
import { buildGanttNodes, type GanttProjectInput, type GanttTaskInput } from "@/domain/tasks";

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains("dark"));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export function GanttChart({
  tasks,
  projects = [],
}: {
  tasks: GanttTaskInput[];
  projects?: GanttProjectInput[];
}) {
  const isDark = useIsDarkMode();
  const { nodes, untimedCount } = buildGanttNodes(projects, tasks);
  const ThemeWrapper = isDark ? WillowDark : Willow;

  if (nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma tarefa com prazo ou início definido para mostrar no Gantt.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {untimedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {untimedCount} tarefa(s) sem prazo/início não aparecem aqui.
        </p>
      )}
      <div className="h-[600px] overflow-hidden rounded-lg border">
        <ThemeWrapper>
          <Gantt tasks={nodes} readonly zoom />
        </ThemeWrapper>
      </div>
    </div>
  );
}
