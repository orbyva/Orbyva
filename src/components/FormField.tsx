import { FormLabel } from "@/components/FormLabel";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: React.ReactNode;
  children: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  className?: string;
}

/** Campo atômico: label + controle + hint/erro. */
export function FormField({
  label,
  children,
  required,
  optional,
  hint,
  error,
  htmlFor,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <FormLabel htmlFor={htmlFor} required={required} optional={optional}>
        {label}
      </FormLabel>
      {children}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

interface FormFieldRowProps {
  children: React.ReactNode;
  className?: string;
}

/** Grid de 2 colunas para pares curtos (data/valor, marca/modelo). */
export function FormFieldRow({ children, className }: FormFieldRowProps) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)}>
      {children}
    </div>
  );
}
