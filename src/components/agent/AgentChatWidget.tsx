import { useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import { cn } from "@/lib/utils";

export function AgentChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className={cn(
            "fixed z-40 h-12 w-12 rounded-full shadow-lg sm:h-14 sm:w-14",
            "bottom-[max(1rem,env(safe-area-inset-bottom))]",
            "right-[max(1rem,env(safe-area-inset-right))]",
            "md:bottom-6 md:right-6"
          )}
          aria-label="Abrir assistente FinTrack"
        >
          <Bot className="h-5 w-5 sm:h-6 sm:w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex h-[100dvh] w-full max-w-full flex-col gap-0 p-0 sm:max-w-md md:max-w-lg [&>button]:top-3 [&>button]:right-3"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Assistente FinTrack</SheetTitle>
        </SheetHeader>
        <AgentChatPanel variant="sheet" />
      </SheetContent>
    </Sheet>
  );
}
