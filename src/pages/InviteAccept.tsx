import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { storePendingReferral } from "@/api/referral";
import { BRAND } from "@/lib/brand";

export default function InviteAccept() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (code?.trim()) {
      storePendingReferral(code.trim());
    }
  }, [code]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-[#0c1222] px-6 text-center text-zinc-100">
      <BrandLogo variant="mark" className="size-16 rounded-2xl bg-white p-1" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Você foi convidado para o {BRAND.name}
        </h1>
        <p className="max-w-sm text-sm text-zinc-400">
          Crie sua conta para organizar finanças, hábitos, cinema e o resto da
          vida numa só órbita.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild size="lg">
          <Link to="/login">Entrar / criar conta</Link>
        </Button>
        <Button
          variant="ghost"
          className="text-zinc-300"
          onClick={() => navigate("/")}
        >
          Saber mais
        </Button>
      </div>
    </div>
  );
}
