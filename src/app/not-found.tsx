import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="py-16">
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
