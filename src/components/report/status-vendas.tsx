import { cn } from "@/lib/cn";
import { formatMetric } from "@/lib/format";
import type { EtapaDoStatus, StatusDeVendas } from "@/lib/types";

/**
 * O status comercial numa tela.
 *
 * Substitui o slide que era montado à mão a cada ciclo. A diferença que
 * importa não é o desenho: é que cada bloco declara **a que janela se refere**.
 * O slide precisava de asterisco porque juntava "89 leads gerados" (um período)
 * com "22 em qualificação" (a base inteira, hoje) sem dizer qual era qual, e
 * quem lia somava os dois.
 *
 * Duas perguntas, dois blocos, cada um com o seu rótulo:
 *
 * - **No período** — o que entrou e o que se decidiu no intervalo escolhido,
 *   contra a meta do ciclo.
 * - **A base agora** — onde estão os negócios que existem, etapa por etapa,
 *   sem recorte de data. Um negócio de março parado em reabordagem conta aqui
 *   igual ao de ontem, e é exatamente o que a tela precisa mostrar.
 */

/** Um número grande com rótulo, no formato dos cartões do painel. */
function Cartao({
  titulo,
  subtitulo,
  children,
  destaque = false,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative @container overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5",
        "transition-[border-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out-soft)]",
        "hover:border-line-strong hover:shadow-[0_8px_28px_-20px_rgba(47,37,53,0.4)]",
      )}
    >
      {destaque ? (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
      ) : null}
      <p className="font-medium text-ink-secondary text-xs">{titulo}</p>
      {children}
      {subtitulo ? (
        <p className="mt-2 text-[11px] text-ink-muted leading-tight">{subtitulo}</p>
      ) : null}
    </div>
  );
}

function Numero({ valor, formato }: { valor: number; formato: "integer" | "currency" }) {
  return (
    <p className="mt-3 font-semibold text-[clamp(1.25rem,11cqw,2.25rem)] text-ink tracking-tight">
      {formatMetric(valor, formato)}
    </p>
  );
}

/**
 * Quanto do alvo já foi feito.
 *
 * A barra passa de 100% sem quebrar o desenho — bater a meta não é erro —, e o
 * texto ao lado repete o número, porque barra sozinha não sobrevive a leitor
 * de tela nem a impressão em preto e branco.
 */
function Meta({
  feito,
  alvo,
  formato,
}: {
  feito: number;
  alvo: number;
  formato: "integer" | "currency";
}) {
  if (alvo <= 0) return null;
  const fracao = feito / alvo;
  const pct = Math.min(100, Math.max(0, fracao * 100));
  const bateu = fracao >= 1;

  return (
    <div className="mt-3">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
        role="img"
        aria-label={`${formatMetric(fracao, "percent")} da meta de ${formatMetric(alvo, formato)}`}
      >
        <div
          className={cn("h-full rounded-full", bateu ? "bg-positive" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-ink-muted leading-tight tabular-nums">
        {formatMetric(fracao, "percent")} da meta de {formatMetric(alvo, formato)}
      </p>
    </div>
  );
}

/** Ganho e perdido não são lugares onde o negócio espera: são o fim da linha. */
function corDoDesfecho(desfecho: EtapaDoStatus["desfecho"]): string {
  if (desfecho === "ganho") return "var(--qy-funnel-ganho)";
  if (desfecho === "perdido") return "var(--color-ink-muted)";
  return "var(--color-accent)";
}

export function StatusDeVendasView({ status }: { status: StatusDeVendas }) {
  const { metas } = status;
  // Só o que ainda pode virar venda. Somar ganho e perdido aqui responderia
  // "quantos registros existem", que é outra pergunta — e a de cima já é essa.
  const emJogo = status.etapas
    .filter((e) => e.desfecho === undefined)
    .reduce((acc, e) => acc + e.negocios, 0);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold text-ink text-sm">No período</h2>
          <p className="text-[11px] text-ink-muted">
            {status.range.from.split("-").reverse().join("/")} a{" "}
            {status.range.to.split("-").reverse().join("/")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cartao titulo="Leads gerados" subtitulo="Negócios criados no período">
            <Numero valor={status.gerados} formato="integer" />
          </Cartao>

          <Cartao titulo="Vendas ganhas" subtitulo="Fechadas no período" destaque>
            <Numero valor={status.ganhos} formato="integer" />
            <Meta feito={status.ganhos} alvo={metas.vendas} formato="integer" />
          </Cartao>

          <Cartao titulo="Valor de vendas ganhas" subtitulo="Soma do valor dos negócios ganhos">
            <Numero valor={status.receita} formato="currency" />
            <Meta feito={status.receita} alvo={metas.receita} formato="currency" />
          </Cartao>

          <Cartao titulo="Perdidos" subtitulo="Negócios encerrados sem venda no período">
            <Numero valor={status.perdidos} formato="integer" />
          </Cartao>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-semibold text-ink text-sm">A base agora</h2>
          <p className="text-[11px] text-ink-muted tabular-nums">
            {formatMetric(status.baseTotal, "integer")} negócios no funil ·{" "}
            {formatMetric(emJogo, "integer")} ainda em jogo
          </p>
        </div>
        <p className="max-w-2xl text-ink-muted text-xs leading-relaxed">
          Onde estão os negócios que existem hoje, etapa por etapa — sem recorte de data. Um negócio
          parado há meses conta aqui igual ao de ontem, que é o ponto: etapa que engorda sem
          esvaziar é fila, não passagem.
        </p>

        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {status.etapas.map((etapa) => (
            <li
              key={etapa.nome}
              className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
              style={{ borderLeft: `3px solid ${corDoDesfecho(etapa.desfecho)}` }}
            >
              <p
                className="truncate font-medium text-ink-secondary text-xs uppercase tracking-wide"
                title={etapa.nome}
              >
                {etapa.nome}
              </p>
              <p className="mt-2 font-semibold text-ink text-2xl tabular-nums">
                {formatMetric(etapa.negocios, "integer")}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
