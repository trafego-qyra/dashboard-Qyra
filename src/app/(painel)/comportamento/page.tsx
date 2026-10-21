import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

import { FunnelChart } from "@/components/charts/funnel-chart";
import { PageHeader } from "@/components/layout/page-header";
import { ClarityPanel } from "@/components/report/clarity-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRange } from "@/lib/date-range";
import type { FunilDaLpEstado } from "@/server/funil/lp";
import { getClarityResumo, getFunilDaLp } from "@/server/reports";

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
/**
 * O funil do questionário das LPs de planos.
 *
 * Mora aqui, e não em Vendas, pela mesma pergunta que abre esta tela: o que as
 * pessoas fazem depois de chegar. Vendas começa quando o negócio já existe no
 * Kommo; este funil é o caminho até ele.
 */
function FunilDaLp({ funil }: { funil: FunilDaLpEstado }) {
  if (funil.estado === "sem-banco") {
    return (
      <EmptyState
        title="Funil das LPs sem banco"
        description="Cadastre SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para o painel guardar as etapas que as LPs de planos mandam."
      />
    );
  }

  if (funil.estado === "falhou") {
    return (
      <EmptyState
        title="O banco não respondeu ao funil das LPs"
        description={`Se a tabela ainda não existe, rode docs/sql/funil-lp.sql no SQL Editor do Supabase. Detalhe técnico: ${funil.motivo}`}
      />
    );
  }

  if (funil.estado === "vazio") {
    return (
      <EmptyState
        title="Nenhuma visita às LPs de planos ainda"
        description={`Nada chegou entre ${formatRange(funil.periodo)}. O funil enche sozinho assim que as LPs de planos.qyra.com.br começarem a mandar as etapas.`}
      />
    );
  }

  const { bloco, periodo, saidas, pagos } = funil.funil;
  const encerrados = saidas.imcBaixo + saidas.imcAdequado + saidas.reprovado;

  return (
    <Card className="qy-rise">
      <CardHeader>
        <div>
          <CardTitle>{bloco.title}</CardTitle>
          <CardDescription>
            {bloco.description}, de {formatRange(periodo)}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <FunnelChart block={bloco} />
        {pagos > 0 ? (
          <p className="text-ink-secondary text-xs leading-relaxed">
            Pagamentos aprovados na própria LP: {pagos}.
          </p>
        ) : null}
        {encerrados > 0 ? (
          <p className="text-ink-secondary text-xs leading-relaxed">
            Encerrados pelo próprio questionário: {saidas.imcBaixo} com IMC abaixo de 18,5,{" "}
            {saidas.imcAdequado} com IMC adequado e {saidas.reprovado} pelas condições de saúde.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function Page() {
  const [clarity, funil] = await Promise.all([getClarityResumo(), getFunilDaLp()]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Comportamento"
        description="Até onde as pessoas leem, onde a página não responde e em qual pergunta do questionário das LPs elas desistem"
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

      <FunilDaLp funil={funil} />
    </div>
  );
}
