import { Link } from "react-router-dom";

/** Aviso quando o Tipo selecionado ainda não tem classes — evita select em branco. */
export function NoClassesForTypeHint({ typeName }: { typeName?: string | null }) {
  const label = typeName?.trim() || "este tipo";
  return (
    <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{label}</span> ainda não tem
      classes.{" "}
      <Link
        to="/finance/dimensions"
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        Cadastre em Dimensões
      </Link>
      .
    </p>
  );
}
