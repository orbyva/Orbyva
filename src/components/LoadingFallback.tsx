import { BRAND } from "@/lib/brand";

export default function LoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background gap-4">

      <div className="relative">
        <div className="w-10 h-10 border-2 border-primary/30 rounded-full" />
        <div className="absolute inset-0 w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>

      <span className="text-lg font-semibold text-primary tracking-wide">
        {BRAND.name}
      </span>

      <p className="text-sm text-muted-foreground">
        Carregando seus dados...
      </p>
    </div>
  );
}
