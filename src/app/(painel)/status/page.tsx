import type { Metadata } from "next";

import { DateRangePicker } from "@/components/layout/date-range-picker";
import { Notices } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { StatusDeVendasView } from "@/components/report/status-vendas";
import { avisosVisiveis } from "@/lib/avisos";
import { parseRange } from "@/lib/date-range";
import { getStatusDeVendas } from "@/server/reports";

export const metadata: Metadata = { title: "Status de vendas" };

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Status de vendas.
 *
 * Tela própria, e não uma seção de Vendas, porque a pergunta é outra. Vendas
 * mede o período — quanto entrou, quanto fechou, em quantos dias. Aqui a
 * pergunta é o estado: onde a base está hoje e o quanto falta para a meta do
 * ciclo. Juntas, a segunda vira rodapé da primeira, e rodapé ninguém rola até.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { range, preset } = parseRange(await searchParams);
  const status = await getStatusDeVendas(range);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Status de vendas"
        source={status.source}
        actions={<DateRangePicker range={range} preset={preset} />}
      />
      <Notices notices={avisosVisiveis(status.notices)} />
      <StatusDeVendasView status={status} />
    </div>
  );
}
