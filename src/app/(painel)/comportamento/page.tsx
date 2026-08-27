import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ClarityPanel } from "@/components/report/clarity-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { getClarityResumo } from "@/server/reports";

export const metadata: Metadata = { title: "Comportamento" };

/**
 * Sem isto o Next pré-renderiza esta rota na compilação — ela não lê
 * `searchParams`, então nada a marca como dinâmica sozinha. O HTML nasceria
 * com o estado do build, quando não há credencial, e serviria "não
 * configurado" para sempre.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Comportamento na página.
 *
 * Tela própria, e não uma seção do Analytics, porque a pergunta é outra: o
 * Analytics responde quantos vieram e de onde; aqui é o que fizeram depois de
 * chegar. Juntas na mesma tela, a segunda ficava no rodapé da primeira — o
 * lugar que ninguém rola até.
 */
export default async function Page() {
  const resumo = await getClarityResumo();

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Comportamento"
        description="Até onde as pessoas leem e onde a página não responde — pelo Microsoft Clarity"
      />

      {resumo ? (
        <ClarityPanel resumo={resumo} />
      ) : (
        <EmptyState
          title="Clarity não configurado"
          description="Cadastre CLARITY_API_TOKEN e CLARITY_PROJECT_ID para esta tela ler os dados de rolagem e atrito. Sem eles não há o que mostrar."
        />
      )}
    </div>
  );
}
