import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  countReferrals,
  ensureReferralCode,
  inviteUrlForCode,
} from "@/api/referral";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

export function InviteFriendsCard() {
  const { toast } = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [c, n] = await Promise.all([
          ensureReferralCode(),
          countReferrals(),
        ]);
        if (cancelled) return;
        setCode(c);
        setCount(n);
        const url = inviteUrlForCode(c);
        const dataUrl = await QRCode.toDataURL(url, {
          width: 180,
          margin: 1,
          color: { dark: "#0c1222", light: "#ffffff" },
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Convite indisponível",
            description: getErrorMessage(
              error,
              "Não foi possível gerar o link de convite."
            ),
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const url = code ? inviteUrlForCode(code) : "";

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado", duration: 2000 });
    } catch {
      toast({
        title: "Não foi possível copiar",
        variant: "destructive",
      });
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Users className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Convidar amigos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compartilhe o link ou o QR. Quando alguém criar conta, contamos aqui.
            {loading ? "" : ` · ${count} convidado${count === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>
      {loading ? (
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-muted" />
      ) : (
        <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR Code de convite"
              className="size-40 rounded-xl border bg-white p-2"
            />
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <Input readOnly value={url} className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={() => void copyLink()}>
              <Copy className="mr-2 size-4" />
              Copiar link
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
