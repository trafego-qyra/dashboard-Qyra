import { Trophy } from "lucide-react";

import { LightBlock } from "@/components/brand/light-block";
import { cn } from "@/lib/cn";
import { formatMetric } from "@/lib/format";
import type { FunnelBlock, FunnelStage } from "@/lib/types";

/**
 * O funil comercial, em figura.
 *
 * Faixas separadas, cada uma um trapézio: a aresta de cima é o número da etapa,
 * a de baixo é o da próxima, e o quanto ela estreita é a perda entre as duas.
 * Onde a forma aperta é onde o processo trava — que é a única coisa que um
 * funil desenhado faz melhor que a tabela ao lado.
 *
 * **Mora no slab escuro da marca, nos dois temas.** Não é escolha de gosto: uma
 * rampa de um hue só precisa de uma superfície fixa para ter contraste
 * garantido, e alternar a superfície obrigaria a manter duas rampas validadas
 * em vez de uma. O slab é o mesmo da navegação e da tela de entrada, então a
 * peça mais chamativa do painel continua sendo a marca, e não uma exceção.
 *
 * **Sem tooltip, de propósito.** A regra da casa é que gráfico em HTML tem
 * camada de hover; a exceção aqui é que não há nada escondido para revelar —
 * etapa, contagem, porcentagem e queda estão todas escritas ao lado da forma.
 * Um tooltip repetiria o visível e ainda esconderia o dado de quem navega por
 * teclado.
 *
 * A largura é a única codificação de grandeza. A cor apenas ordena — e o
 * desfecho, que não é etapa de passagem, sai da rampa e vem com ícone e
 * rótulo, nunca só com a cor trocada.
 */

/**
 * A rampa, do topo do funil para a base.
 *
 * Validada contra `#2f2535`, que é a superfície onde ela sempre aparece. Sobre
 * fundo escuro quem tem mais volume precisa de mais luz, não de menos: a
 * ordem é do passo mais claro para o mais fechado.
 */
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
 * Com três etapas o funil usa o primeiro, o do meio e o último passo — e não os
 * três primeiros. Assim a diferença entre a boca e o fim é sempre a mesma,
 * independentemente de quantas etapas a clínica tenha criado no CRM.
 */
function corDaEtapa(indice: number, total: number): string {
  if (total <= 1) return RAMPA[0];
  const posicao = Math.round((indice / (total - 1)) * (RAMPA.length - 1));
  return RAMPA[posicao];
}

/**
 * A boca do funil não encosta na borda do slab.
 *
 * Sem folga a primeira faixa termina rente ao corte da superfície e passa a ler
 * como forma cortada, e não como forma larga — o desenho parece um erro de
 * layout justamente na etapa mais importante.
 */
const BOCA = 94;

/**
 * Piso de largura da aresta.
 *
 * Etapa zerada continua sendo uma faixa visível em vez de sumir: "ninguém chega
 * aqui" é informação, e largura zero levaria o rótulo junto. O número ao lado
 * continua dizendo zero — a figura nunca é a fonte do valor.
 */
const PISO = 6;

function largura(valor: number, topo: number): number {
  if (topo <= 0) return PISO;
  return Math.max(PISO, (valor / topo) * BOCA);
}

function trapezio(cima: number, baixo: number): string {
  const a = (100 - cima) / 2;
  const b = (100 + cima) / 2;
  const c = (100 + baixo) / 2;
  const d = (100 - baixo) / 2;
  return `polygon(${a}% 0%, ${b}% 0%, ${c}% 100%, ${d}% 100%)`;
}

/** Porcentagem em número inteiro: a figura não tem duas casas de precisão. */
function porcento(fracao: number): string {
  return `${Math.round(fracao * 100)}%`;
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
  const recorte = trapezio(cima, baixo);

  return (
    <div
      aria-hidden="true"
      className="relative h-full w-full transition-transform duration-[var(--duration-base)] ease-[var(--ease-out-soft)] group-hover:scale-[1.02]"
    >
      <div
        className="absolute inset-0"
        style={{
          clipPath: recorte,
          // Um degradê dentro do mesmo passo: dá volume à faixa sem introduzir
          // uma segunda cor, que quebraria a leitura de rampa.
          background: `linear-gradient(115deg, ${cor} 0%, color-mix(in oklab, ${cor} 74%, #17111b) 100%)`,
        }}
      />
      {/* Fio de luz na aresta de cima — o mesmo brilho do slab da marca, que é
          o que dá a impressão de peça empilhada. */}
      <div
        className="absolute inset-0 opacity-45"
        style={{
          clipPath: recorte,
          background: "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, transparent 34%)",
        }}
      />
      {etapa.outcome === "ganho" ? (
        <div className="absolute inset-0 grid place-items-center" style={{ clipPath: recorte }}>
          <Trophy className="size-5 text-plum-900" />
        </div>
      ) : null}
    </div>
  );
}

/** Fio que liga a caixa de texto à faixa, como num diagrama de apresentação. */
function Fio({ lado }: { lado: "esquerda" | "direita" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "hidden h-px w-4 shrink-0 sm:block",
        lado === "esquerda"
          ? "bg-gradient-to-r from-transparent to-white/25"
          : "bg-gradient-to-l from-transparent to-white/25",
      )}
    />
  );
}

export function FunnelChart({ block }: { block: FunnelBlock }) {
  const etapas = block.stages;
  if (etapas.length === 0) return null;

  const topo = etapas[0]?.value ?? 0;

  return (
    <figure className="qy-fade relative overflow-hidden rounded-[var(--radius-slab)] bg-plum-800 px-4 py-6 text-white sm:px-6 sm:py-8">
      <LightBlock className="opacity-70" />

      <figcaption className="sr-only">
        {block.title}
        {block.description ? `. ${block.description}` : ""}
      </figcaption>

      <ol className="relative space-y-2">
        {etapas.map((etapa, i) => {
          const proxima = etapas[i + 1];
          const cima = largura(etapa.value, topo);
          const baixo = largura(proxima?.value ?? etapa.value, topo);
          const doTopo = topo === 0 ? 0 : etapa.value / topo;
          const anterior = etapas[i - 1]?.value;
          const queda =
            anterior === undefined || anterior === 0 ? null : 1 - etapa.value / anterior;
          const cor =
            etapa.outcome === "ganho" ? "var(--qy-funnel-ganho)" : corDaEtapa(i, etapas.length);

          return (
            <li
              key={etapa.label}
              className="group grid grid-cols-2 items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] sm:gap-x-4"
            >
              {/* Caixa de rótulo com filete da cor da faixa: é o que amarra o
                  texto à forma sem escrever nada por cima do trapézio, onde
                  nome comprido não cabe e o contraste muda a cada passo. */}
              <div className="flex items-center">
                <div
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 py-2 pr-3 pl-3"
                  style={{ borderLeft: `3px solid ${cor}` }}
                >
                  <div className="flex items-center gap-1.5">
                    {etapa.outcome === "ganho" ? (
                      <Trophy aria-hidden="true" className="size-3.5 shrink-0 text-white" />
                    ) : null}
                    {/* Sem truncar: "Venda ganha" já cortava no telefone, e
                        nome de etapa cortado é etapa que ninguém identifica. */}
                    <span className="font-semibold text-[13px] text-white uppercase leading-tight tracking-wide">
                      {etapa.label}
                    </span>
                  </div>
                </div>
                <Fio lado="esquerda" />
              </div>

              {/* A forma. Some no telefone: com a tela estreita o trapézio fica
                  raso demais para dizer alguma coisa, e o que sobra — nome,
                  contagem e queda — já é o funil em texto. */}
              <div className="col-span-2 hidden h-16 sm:col-span-1 sm:block">
                <Faixa etapa={etapa} cima={cima} baixo={baixo} cor={cor} />
              </div>

              <div className="flex items-center justify-end">
                <Fio lado="direita" />
                <div className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2">
                  <span className="font-semibold text-lg text-white tabular-nums">
                    {formatMetric(etapa.value, "integer")}
                  </span>
                  {/* Duas linhas curtas, e não três informações numa só: na
                      largura desta coluna "da etapa anterior" quebra no meio e
                      o número perde o rótulo. */}
                  <span className="text-right text-[11px] text-plum-200 leading-tight tabular-nums">
                    <span className="block whitespace-nowrap">{porcento(doTopo)} do topo</span>
                    {queda !== null && queda > 0 ? (
                      <span className="block whitespace-nowrap text-plum-300">
                        −{porcento(queda)} da anterior
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {block.caveat ? (
        <p className="relative mt-6 border-white/10 border-t pt-4 text-[11px] text-plum-300 leading-relaxed">
          {block.caveat}
        </p>
      ) : null}
    </figure>
  );
}
