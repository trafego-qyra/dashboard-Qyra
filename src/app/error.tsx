"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Fronteira de erro da aplicação.
 *
 * Mostra o que houve e a ação de recuperação; o detalhe técnico fica no
 * console e no Sentry, não na tela do usuário.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] erro na renderização", error);
  }, [error]);

  return (
    <div className="py-16">
      <EmptyState
        icon={<TriangleAlert />}
        title="Não foi possível carregar os dados"
        description="Uma das integrações não respondeu. Isso costuma ser instabilidade temporária da plataforma de origem — tente novamente em alguns instantes."
        action={
          <Button variant="primary" size="sm" onClick={reset}>
            <RotateCw className="size-4" aria-hidden="true" />
            Tentar novamente
          </Button>
        }
      />
      {error.digest ? (
        <p className="mt-4 text-center text-[11px] text-ink-muted">
          Código do erro: <span className="tabular">{error.digest}</span>
        </p>
      ) : null}
    </div>
  );
}
