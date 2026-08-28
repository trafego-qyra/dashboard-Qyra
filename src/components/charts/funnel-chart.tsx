import { Trophy } from "lucide-react";

import { LightBlock } from "@/components/brand/light-block";
import { formatMetric } from "@/lib/format";
import type { FunnelBlock } from "@/lib/types";

/**
 * O funil comercial, em figura.
 *
 * **O número mora dentro da faixa.** Foi a correção que faltava em três
 * tentativas anteriores: com nome e contagem empurrados para caixas nas
 * laterais, as faixas ficavam vazias e o meio da peça virava enfeite. Num funil
 * de marketing é a faixa que carrega o peso — ela é o dado, não a moldura dele.
 *
 * **Mora no slab escuro da marca, nos dois temas.** Superfície fixa é o que
 * permite validar uma rampa de um hue só uma vez, em vez de manter duas. E o
 * texto corre escuro sobre faixa clara: é o par que dá contraste alto em todos
 * os passos, enquanto branco falharia justo nos dois primeiros.
 *
 * **Sem tooltip, de propósito.** Etapa, contagem e queda estão escritas na
 * própria faixa; um tooltip repetiria o visível e esconderia o dado de quem
 * navega por teclado.
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
  return RAMPA[Math.round((indice / (total - 1)) * (RAMPA.length - 1))];
}

/** Largura da boca, em porcentagem da coluna. */
const BOCA = 84;

/**
 * Largura mínima de faixa, em porcentagem da coluna.
 *
 * Não é folga estética: abaixo disso "VENDA GANHA 48" não cabe dentro da faixa,
 * e o rótulo teria de sair para fora — que é exatamente o desenho que esta
 * versão veio corrigir.
 */
const PISO = 36;

/**
 * Expoente da escala de largura.
 *
 * **A largura não é proporcional à contagem, e isso é deliberado.** Um funil
 * real cai forte no começo — de 358 para 146 são 59% a menos —, e em escala
 * linear a primeira faixa vira uma prancha e as três seguintes viram tocos: o
 * desenho deixa de parecer funil e passa a parecer defeito.
 *
 * A escala comprimida preserva o que a figura precisa dizer — a ordem e a
 * noção de quanto se perde a cada etapa — e devolve as faixas de baixo ao
 * tamanho em que ainda se lê o que está escrito nelas. A precisão fica onde ela
 * pertence: no número impresso dentro da faixa, e na ressalva embaixo da peça.
 */
const COMPRESSAO = 0.6;

function largura(valor: number, topo: number): number {
  if (topo <= 0 || valor <= 0) return PISO;
  return Math.max(PISO, (valor / topo) ** COMPRESSAO * BOCA);
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

/**
 * Altura da tampa arredondada, em pixels.
 *
 * Recorte poligonal não aceita raio, e quina viva no meio de uma interface
 * arredondada em todo o resto lê como peça de outro projeto. A boca e a bica
 * ganham uma tampa própria — retângulo de raio total na mesma largura da
 * aresta, encaixado sem costura.
 */
const TAMPA = 16;

function Faixa({
  cima,
  baixo,
  cor,
  vazia,
  primeira,
  ultima,
}: {
  cima: number;
  baixo: number;
  cor: string;
  vazia: boolean;
  primeira: boolean;
  ultima: boolean;
}) {
  // Horizontal: tampa e corpo são elementos separados, e um degradê com
  // componente vertical mudaria de tom entre os dois, deixando emenda visível
  // justo na aresta que deveria ser lisa.
  const fundo = vazia
    ? // Etapa sem ninguém sai vazada, não pintada. Ela ocupa a largura mínima
      // como todas as outras, e preenchê-la faria zero parecer volume.
      `repeating-linear-gradient(115deg, color-mix(in oklab, ${cor} 26%, transparent) 0 6px, transparent 6px 12px)`
    : `linear-gradient(90deg, color-mix(in oklab, ${cor} 92%, white) 0%, ${cor} 60%, color-mix(in oklab, ${cor} 82%, #17111b) 100%)`;

  return (
    <div aria-hidden="true" className="absolute inset-0">
      {primeira ? (
        <div className="absolute inset-x-0 top-0 flex justify-center" style={{ height: TAMPA }}>
          <div className="h-full rounded-t-full" style={{ width: `${cima}%`, background: fundo }} />
        </div>
      ) : null}

      <div
        className="absolute inset-x-0"
        style={{
          top: primeira ? TAMPA : 0,
          // Dois pixels de superfície entre faixas, como em toda marca colada do
          // painel: é o respiro que separa uma etapa da seguinte sem contorno.
          bottom: ultima ? TAMPA : 2,
          clipPath: trapezio(cima, baixo),
          background: fundo,
        }}
      />

      {ultima ? (
        <div className="absolute inset-x-0 bottom-0 flex justify-center" style={{ height: TAMPA }}>
          <div
            className="h-full rounded-b-full"
            style={{ width: `${baixo}%`, background: fundo }}
          />
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
    <figure className="qy-fade relative overflow-hidden rounded-[var(--radius-slab)] bg-plum-800 px-4 py-6 sm:px-8 sm:py-8">
      <LightBlock className="opacity-70" />

      <figcaption className="sr-only">
        {block.title}
        {block.description ? `. ${block.description}` : ""}
      </figcaption>

      <ol className="relative">
        {etapas.map((etapa, i) => {
          const proxima = etapas[i + 1];
          const primeira = i === 0;
          const ultima = proxima === undefined;
          const cima = largura(etapa.value, topo);
          // Na última faixa não há próxima etapa para medir: o estreitamento é
          // desenho, e é o que fecha a peça como bica em vez de tarugo cortado.
          const baixo = ultima ? cima * 0.88 : largura(proxima.value, topo);
          const anterior = etapas[i - 1]?.value;
          const queda =
            anterior === undefined || anterior === 0 ? null : 1 - etapa.value / anterior;
          const cor =
            etapa.outcome === "ganho" ? "var(--qy-funnel-ganho)" : corDaEtapa(i, etapas.length);

          return (
            <li key={etapa.label} className="relative">
              {/* Só a partir de `sm`: numa tela estreita a faixa não tem largura
                  para o texto caber dentro, e o que sobra — a lista abaixo — já
                  é o funil em palavras. */}
              <div className="relative hidden h-[4.25rem] sm:block">
                <Faixa
                  cima={cima}
                  baixo={baixo}
                  cor={cor}
                  vazia={etapa.value === 0}
                  primeira={primeira}
                  ultima={ultima}
                />

                {/* O conteúdo é o centro da peça, não a moldura dela. Fica numa
                    caixa da largura da aresta de baixo, que é a parte estreita:
                    assim o texto nunca invade o chanfro. */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="flex items-center justify-between gap-4 px-2"
                    style={{ width: `${baixo}%` }}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-[var(--qy-funnel-tinta)]">
                      {etapa.outcome === "ganho" ? <Trophy className="size-4 shrink-0" /> : null}
                      <span className="truncate font-bold text-[13px] uppercase tracking-wide">
                        {etapa.label}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2 text-[var(--qy-funnel-tinta)]">
                      <span className="font-bold text-xl tabular-nums leading-none">
                        {formatMetric(etapa.value, "integer")}
                      </span>
                      {queda !== null && queda > 0 ? (
                        <span className="text-[11px] tabular-nums opacity-70">
                          −{porcento(queda)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </div>
              </div>

              {/* O funil em palavras, no telefone. */}
              <div className="flex items-center justify-between gap-3 border-white/10 border-b py-2.5 text-white last:border-0 sm:hidden">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: cor }}
                  />
                  <span className="font-semibold text-[13px] uppercase tracking-wide">
                    {etapa.label}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="font-bold text-base tabular-nums">
                    {formatMetric(etapa.value, "integer")}
                  </span>
                  <span className="text-[11px] text-plum-300 tabular-nums">
                    {porcento(topo === 0 ? 0 : etapa.value / topo)}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="relative mt-5 border-white/10 border-t pt-4 text-[11px] text-plum-300 leading-relaxed">
        A largura acompanha o volume em escala comprimida, para as etapas menores continuarem
        legíveis — os números dentro de cada faixa são exatos.
        {block.caveat ? ` ${block.caveat}` : ""}
      </p>
    </figure>
  );
}
