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
  const clarity = await getClarityResumo();

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Comportamento"
        description="Até onde as pessoas leem e onde a página não responde — pelo Microsoft Clarity"
      />

      {clarity.estado === "ok" ? <ClarityPanel resumo={clarity.resumo} /> : null}

      {clarity.estado === "sem-credencial" ? (
        <EmptyState
          title="Clarity não configurado"
          description="Cadastre CLARITY_API_TOKEN e CLARITY_PROJECT_ID para esta tela ler os dados de rolagem e atrito. Sem eles não há o que mostrar."
        />
      ) : null}

      {/* Estado próprio, e não o mesmo "não configurado" de antes. Mandar
          cadastrar uma variável que já está cadastrada faz quem lê procurar o
          problema no lugar errado — e o motivo mais provável aqui é a cota
          diária da API, que é de poucas chamadas e não avisa antes de acabar. */}
      {clarity.estado === "falhou" ? (
        <EmptyState
          title="O Clarity está configurado, mas não respondeu"
          description={`A credencial está cadastrada — o que falhou foi a consulta. A causa mais comum é a cota diária da API do Clarity, que é de poucas chamadas por dia e se recompõe sozinha no dia seguinte. Detalhe técnico: ${clarity.motivo}`}
        />
      ) : null}
    </div>
  );
}
