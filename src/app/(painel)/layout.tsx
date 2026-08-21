import { Suspense } from "react";

import { AppShell } from "@/components/layout/app-shell";

/**
 * A casca com navegação, para tudo que é painel.
 *
 * Ela saiu do layout raiz quando a tela de login apareceu: login não tem canal
 * para navegar, e mostrar a barra lateral ali convidaria a clicar em algo que
 * o porteiro devolveria para a mesma tela.
 */
export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    // Barra lateral e filtro de período leem searchParams: Suspense evita
    // que a página inteira caia para renderização no cliente.
    <Suspense fallback={null}>
      <AppShell>
        <div id="conteudo">{children}</div>
      </AppShell>
    </Suspense>
  );
}
