import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useOrb } from "@/hooks/useOrb";
import { OrbChat } from "@/components/orb/OrbChat";

export function OrbSheet() {
  const { open, closeOrb } = useOrb();

  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? closeOrb() : undefined)}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b px-4 py-3 text-left">
          <SheetTitle>Orb</SheetTitle>
          <SheetDescription>
            Cinema, livros e música — só digitar.
          </SheetDescription>
        </SheetHeader>
        <OrbChat />
      </SheetContent>
    </Sheet>
  );
}
