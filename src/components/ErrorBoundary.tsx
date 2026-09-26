import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro não tratado na aplicação:", error, info);
    void import("@/lib/sentry").then(({ Sentry }) => {
      Sentry.captureException(error, {
        extra: { componentStack: info.componentStack },
      });
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Algo deu errado</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Ocorreu um erro inesperado. Recarregue a página para tentar novamente.
          </p>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
            onClick={() => window.location.reload()}
          >
            Recarregar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
