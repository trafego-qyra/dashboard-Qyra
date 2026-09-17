import { TriangleAlert } from "lucide-react";
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

/** Data e hora em português, para o carimbo de "lido em". */
function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** Faixa de aviso, no mesmo tom das demais do painel. */
function Aviso({ texto }: { texto: string }) {
  return (
    <p className="flex items-start gap-2 rounded-[var(--radius-card)] border border-line bg-surface-sunken px-4 py-3 text-ink-secondary text-xs leading-relaxed">
      <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0 text-warning" />
      {texto}
    </p>
  );
}

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

      {/* Dado velho rotulado como velho vale mais que tela de erro. A cota da
          API é de dez chamadas por dia e não avisa antes de acabar; quando
          acabar, a tela mostra a última leitura boa e diz de quando ela é. */}
      {clarity.estado === "ok" && clarity.defasado ? (
        <Aviso
          texto={`A cota diária da API do Clarity acabou. Estes números são da última leitura que deu certo, de ${quando(clarity.atualizadoEm)} — a cota se recompõe sozinha no dia seguinte.`}
        />
      ) : null}

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
