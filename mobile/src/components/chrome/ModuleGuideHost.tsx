import { usePathname } from "expo-router";

import { ModuleGuideSheet, useFirstVisitGuide } from "@/components/ModuleGuideSheet";
import { useAuth } from "@/hooks/use-auth";
import { normalizePath } from "@/lib/nav";
import type { ModuleGuideId } from "@/lib/moduleGuides";

function moduleFromPath(path: string): ModuleGuideId | null {
  if (path.endsWith("/form") || path.endsWith("-form")) return null;
  if (path.startsWith("/finance")) return "finance";
  if (path.startsWith("/habits")) return "habits";
  if (path.startsWith("/health")) return "health";
  if (path.startsWith("/goals")) return "goals";
  if (path.startsWith("/places")) return "places";
  if (path.startsWith("/travel")) return "travel";
  if (path.startsWith("/cars")) return "car";
  if (path.startsWith("/movies")) return "movies";
  if (path.startsWith("/books")) return "books";
  if (path.startsWith("/music")) return "music";
  if (path.startsWith("/tasks")) return "tasks";
  if (path.startsWith("/notes")) return "notes";
  if (path.startsWith("/shopping")) return "shopping";
  return null;
}

export function ModuleGuideHost() {
  const pathname = usePathname();
  const { user } = useAuth();
  const moduleId = moduleFromPath(normalizePath(pathname));
  const { open, setOpen } = useFirstVisitGuide(user?.id, moduleId);
  return (
    <ModuleGuideSheet
      moduleId={moduleId}
      open={open}
      onClose={() => setOpen(false)}
    />
  );
}
