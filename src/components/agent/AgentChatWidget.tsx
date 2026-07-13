import { useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export function AgentChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="icon"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-40 h-12 w-12 rounded-full shadow-lg sm:h-14 sm:w-14",
          "bottom-[max(1rem,env(safe-area-inset-bottom))]",
          "right-[max(1rem,env(safe-area-inset-right))]",
          "md:bottom-6 md:right-6"
        )}
        aria-label="Abrir consultor FinTrack"
      >
        <Bot className="h-5 w-5 sm:h-6 sm:w-6" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        {open && (
          <SheetContent
            side="right"
            className={cn(
              "flex h-[100dvh] w-full max-w-full flex-col gap-0 border-0 p-0 sm:max-w-md md:max-w-lg",
              "[&>button]:hidden"
            )}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Consultor FinTrack</SheetTitle>
            </SheetHeader>
            <div className="relative flex min-h-0 flex-1 flex-col">
              <SheetClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-3 top-3 z-[70] h-9 w-9 shrink-0 rounded-full bg-background/90 shadow-sm backdrop-blur-sm"
                  aria-label="Fechar consultor"
                >
                  <X className="h-4 w-4" />
                </Button>
              </SheetClose>
              <AgentChatPanel variant="sheet" />
            </div>
          </SheetContent>
        )}
      </Sheet>
    </>
  );
}
