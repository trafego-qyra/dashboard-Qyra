import { Trophy } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatMetric } from "@/lib/format";
import type { FunnelBlock, FunnelStage } from "@/lib/types";

/**
 * O funil comercial, em figura.
 *
 * Uma pilha de trapézios: a largura de cada aresta é o número daquela etapa, e
 * a inclinação entre duas arestas é a perda entre elas. Ler o estrangulamento
 * vira ver onde a figura aperta — que é a única coisa que um funil desenhado
 * faz melhor que a tabela ao lado.
 *
 * **Sem tooltip, de propósito.** A regra da casa é que gráfico em HTML tem
 * camada de hover; a exceção aqui é que não há nada escondido para revelar —
 * etapa, contagem, porcentagem e queda estão todas escritas na tela, ao lado
 * da forma. Um tooltip repetiria o que já está visível e ainda esconderia o
 * dado de quem navega por teclado.
 *
 * A largura é a única codificação de grandeza. A cor apenas ordena, na rampa
 * de um hue só — e o desfecho, que não é etapa de passagem, sai da rampa e vem
 * com ícone e rótulo, nunca só com a cor trocada.
 */

/** Passos da rampa ordinal, do topo do funil para a base. */
const RAMPA = [
  "var(--qy-funnel-1)",
  "var(--qy-funnel-2)",
  "var(--qy-funnel-3)",
  "var(--qy-funnel-4)",
  "var(--qy-funnel-5)",
];

/**
 * Uma cor da rampa para cada etapa, distribuídas de ponta a ponta.
 *
 * Com três etapas o funil usa o primeiro, o do meio e o último passo — e não
 * os três primeiros. Assim a diferença entre a boca e o fim é sempre a mesma,
 * independentemente de quantas etapas a clínica tenha criado no CRM.
 */
function corDaEtapa(indice: number, total: number): string {
  if (total <= 1) return RAMPA[0];
  const posicao = Math.round((indice / (total - 1)) * (RAMPA.length - 1));
  return RAMPA[posicao];
}

/**
 * Largura da aresta, em porcentagem da boca do funil.
 *
 * O piso de 3% existe para etapa zerada continuar sendo uma linha visível em
 * vez de sumir: "ninguém chega aqui" é informação, e uma forma de largura zero
 * some junto com a linha inteira, levando o rótulo embora. O número ao lado
 * continua dizendo zero — a figura nunca é a fonte do valor.
 */
const PISO = 3;

/**
 * A boca do funil não encosta na borda do cartão.
 *
 * Sem folga a primeira faixa termina rente ao corte da superfície e passa a
 * ler como forma cortada, e não como forma larga — o desenho parece um erro de
 * layout justamente na etapa mais importante.
 */
const BOCA = 92;

function largura(valor: number, topo: number): number {
  if (topo <= 0) return PISO;
  return Math.max(PISO, (valor / topo) * BOCA);
}

/**
 * Porcentagem em número inteiro.
 *
 * O formatador da casa leva duas casas, que é o certo para uma taxa de
 * conversão comparada mês a mês. Aqui não: "−59,22%" ao lado de uma forma
 * geométrica finge uma precisão que a figura não tem, e o que se lê é a ordem
 * de grandeza da queda.
 */
function porcento(fracao: number): string {
  return `${Math.round(fracao * 100)}%`;
}

function trapezio(cima: number, baixo: number): string {
  const a = (100 - cima) / 2;
  const b = (100 + cima) / 2;
  const c = (100 + baixo) / 2;
  const d = (100 - baixo) / 2;
  return `polygon(${a}% 0%, ${b}% 0%, ${c}% 100%, ${d}% 100%)`;
}

function Faixa({
  etapa,
  cima,
  baixo,
  cor,
}: {
  etapa: FunnelStage;
  cima: number;
  baixo: number;
  cor: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="relative h-full w-full transition-transform duration-[var(--duration-base)] ease-[var(--ease-out-soft)] group-hover:scale-y-[1.04]"
    >
      <div
        className="absolute inset-0"
        style={{ clipPath: trapezio(cima, baixo), background: cor }}
      />
      {/* Recorte de luz do brandbook, o mesmo da navegação: dá volume à forma
          sem inventar uma segunda cor. */}
      <div
        className="absolute inset-0 opacity-[0.18] mix-blend-overlay"
        style={{
          clipPath: trapezio(cima, baixo),
          background: "linear-gradient(160deg, #ffffff 0%, transparent 55%)",
        }}
      />
      {etapa.outcome === "ganho" ? (
        <div
          className="absolute inset-0 grid place-items-center"
          style={{ clipPath: trapezio(cima, baixo) }}
        >
          <Trophy className="size-4 text-white/90" />
        </div>
      ) : null}
    </div>
  );
}

export function FunnelChart({ block }: { block: FunnelBlock }) {
  const etapas = block.stages;
  if (etapas.length === 0) return null;

  const topo = etapas[0]?.value ?? 0;

  return (
    <figure className="qy-fade">
      <figcaption className="sr-only">
        {block.title}
        {block.description ? `. ${block.description}` : ""}
      </figcaption>

      <ol className="space-y-0">
        {etapas.map((etapa, i) => {
          const proxima = etapas[i + 1];
          const cima = largura(etapa.value, topo);
          const baixo = largura(proxima?.value ?? etapa.value, topo);
          const doTopo = topo === 0 ? 0 : etapa.value / topo;
          // Queda em relação à etapa anterior, que é a leitura que interessa:
          // "de Qualificação para Negociação some metade".
          const anterior = etapas[i - 1]?.value;
          const queda =
            anterior === undefined || anterior === 0 ? null : 1 - etapa.value / anterior;

          return (
            <li
              key={etapa.label}
              className="group grid grid-cols-[1fr_auto] items-stretch gap-3 sm:grid-cols-[minmax(0,11rem)_1fr_auto] sm:gap-4"
            >
              {/* Rótulo fora da forma: nome de etapa longo não cabe dentro de
                  um trapézio estreito, e texto sobre a rampa perderia contraste
                  justamente nos passos claros. */}
              <div className="flex flex-col justify-center py-1 sm:py-0">
                <div className="flex items-center gap-1.5">
                  {etapa.outcome === "ganho" ? (
                    <Trophy aria-hidden="true" className="size-3.5 shrink-0 text-positive" />
                  ) : null}
                  <span
                    className={cn(
                      "font-medium text-sm",
                      etapa.outcome === "ganho" ? "text-positive" : "text-ink",
                    )}
                  >
                    {etapa.label}
                  </span>
                </div>
                {queda !== null && queda > 0 ? (
                  <span className="text-[11px] text-ink-muted tabular-nums">
                    −{porcento(queda)} da etapa anterior
                  </span>
                ) : null}
              </div>

              {/* A forma. Some no telefone: com a tela estreita o trapézio fica
                  raso demais para dizer alguma coisa, e o que sobra — nome,
                  contagem e queda — já é o funil em texto. */}
              <div className="hidden h-16 py-[2px] sm:block">
                <Faixa
                  etapa={etapa}
                  cima={cima}
                  baixo={baixo}
                  cor={
                    etapa.outcome === "ganho"
                      ? "var(--color-positive)"
                      : corDaEtapa(i, etapas.length)
                  }
                />
              </div>

              <div className="flex flex-col items-end justify-center py-1 sm:py-0">
                <span className="font-semibold text-base text-ink tabular-nums">
                  {formatMetric(etapa.value, "integer")}
                </span>
                <span className="text-[11px] text-ink-muted tabular-nums">
                  {porcento(doTopo)} do topo
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {block.caveat ? (
        <p className="mt-4 border-line border-t pt-3 text-[11px] text-ink-muted leading-relaxed">
          {block.caveat}
        </p>
      ) : null}
    </figure>
  );
}
