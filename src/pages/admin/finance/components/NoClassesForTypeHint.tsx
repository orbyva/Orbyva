import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type DimensionsEmptyHintProps = {
  /** Nome em destaque (natureza ou tipo). */
  subject?: string | null;
  /** O que falta cadastrar. */
  missing: "tipos" | "classes" | "naturezas";
};

/** Aviso quando a lista de classificação está vazia — evita select em branco. */
export function DimensionsEmptyHint({
  subject,
  missing,
}: DimensionsEmptyHintProps) {
  const label = subject?.trim();

  let message: ReactNode;
  if (missing === "naturezas") {
    message = (
      <>
        Ainda não há naturezas cadastradas.{" "}
      </>
    );
  } else if (missing === "tipos") {
    message = label ? (
      <>
        <span className="font-medium text-foreground">{label}</span> ainda não
        tem tipos.{" "}
      </>
    ) : (
      <>Ainda não há tipos nesta natureza. </>
    );
  } else {
    message = label ? (
      <>
        <span className="font-medium text-foreground">{label}</span> ainda não
        tem classes.{" "}
      </>
    ) : (
      <>Este tipo ainda não tem classes. </>
    );
  }

  return (
    <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      {message}
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

/** @deprecated use DimensionsEmptyHint missing="classes" */
export function NoClassesForTypeHint({ typeName }: { typeName?: string | null }) {
  return <DimensionsEmptyHint subject={typeName} missing="classes" />;
}
