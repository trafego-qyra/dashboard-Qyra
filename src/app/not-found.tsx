import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Fica na raiz, fora do grupo `(painel)`: o Next só usa este arquivo para
 * endereços que não casam com segmento nenhum, e ali não há casca para
 * herdar. Por isso ele traz o próprio enquadramento.
 */
export default function NotFound() {
  return (
    <div id="conteudo" className="flex min-h-dvh items-center justify-center px-4 py-16">
      <EmptyState
        title="Página não encontrada"
        description="O endereço acessado não existe neste painel."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/">Voltar para a visão geral</Link>
          </Button>
        }
      />
    </div>
  );
}
