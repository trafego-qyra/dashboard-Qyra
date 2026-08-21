import { DateRangePicker } from "@/components/layout/date-range-picker";
import { ChannelView } from "@/components/report/channel-view";
import { ClarityPanel } from "@/components/report/clarity-panel";
import { getChannel } from "@/lib/channels";
import { parseRange } from "@/lib/date-range";
import type { ChannelId } from "@/lib/types";
import { getChannelReport, getClarityResumo } from "@/server/reports";

export interface ChannelPageProps {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}

/**
 * Server component de uma tela de canal.
 *
 * Vive em `app/_shared` (pasta privada, fora do roteamento) e não em
 * `components/`: ele importa a camada de servidor, e o contrato de arquitetura
 * proíbe esse import dentro de `components/` — é o que impede uma credencial de
 * ir parar no bundle do cliente.
 *
 * Busca no servidor: o segredo não sai do backend e o HTML chega pronto — sem
 * cascata de fetch no cliente. O `loading.tsx` de cada rota cobre a espera.
 */
export async function ChannelPage({
  channel,
  searchParams,
}: ChannelPageProps & { channel: ChannelId }) {
  const meta = getChannel(channel);
  const { range, preset } = parseRange(await searchParams);

  // O Clarity só complementa a tela do Analytics, e é opcional: sem token, sem
  // seção. A busca vai em paralelo para não somar latência ao relatório.
  const [report, clarity] = await Promise.all([
    getChannelReport(channel, range),
    channel === "ga4" ? getClarityResumo() : Promise.resolve(null),
  ]);

  return (
    <ChannelView
      report={report}
      description={meta.description}
      actions={<DateRangePicker range={range} preset={preset} />}
      extra={clarity ? <ClarityPanel resumo={clarity} /> : null}
    />
  );
}
