import { Trophy } from "lucide-react";

import { LightBlock } from "@/components/brand/light-block";
import { formatMetric } from "@/lib/format";
import type { FunnelBlock, FunnelStage } from "@/lib/types";

/**
 * O funil comercial, em figura.
 *
 * Lâminas empilhadas, no formato de diagrama de apresentação: cada etapa é uma
 * lâmina própria, com folga entre elas, e a diferença de largura de uma para a
 * outra é a perda. Caixa de rótulo à esquerda, caixa de números à direita, fio
 * ligando as duas à lâmina — o desenho que o comercial reconhece de slide, com
 * a paleta da casa no lugar do arco-íris de banco de imagem.
 *
 * **A aresta de cima de cada lâmina é o número da etapa.** É a única codificação
 * de grandeza. Cada lâmina ainda estreita um pouco sozinha, de um valor fixo e
 * igual para todas — isso é desenho, não dado, e é o que dá o empilhamento em
 * vez de um cone contínuo. O que informa é o degrau **entre** lâminas.
 *
 * **Mora no slab escuro da marca, nos dois temas.** Não é escolha de gosto: uma
 * rampa de um hue só precisa de superfície fixa para ter contraste garantido, e
 * alternar a superfície obrigaria a manter duas rampas validadas em vez de uma.
 * O slab é o mesmo da navegação e da tela de entrada.
 *
 * **Sem tooltip, de propósito.** Etapa, contagem, porcentagem e queda estão
 * todas escritas ao lado da forma; um tooltip repetiria o visível e esconderia
 * o dado de quem navega por teclado.
 */

/**
 * A rampa, do topo do funil para a base.
 *
 * Validada contra `#2f2535`, que é a superfície onde ela sempre aparece. Sobre
 * fundo escuro quem tem mais volume precisa de mais luz, então a ordem vai do
 * passo mais claro para o mais fechado.
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
 * O passo escuro da rampa não tem contraste para virar texto.
 *
 * Clarear o mesmo hue mantém a caixa visivelmente da cor da lâmina — que é o
 * que amarra rótulo e forma — sem depender de um passo que, em corpo pequeno,
 * ninguém lê.
 */
function paraTexto(cor: string): string {
  return `color-mix(in oklab, ${cor} 62%, white)`;
}

/** A boca do funil não encosta na borda do slab. */
const BOCA = 96;

/**
 * Piso de largura da aresta.
 *
 * Etapa zerada continua sendo uma lâmina visível em vez de sumir: "ninguém
 * chega aqui" é informação, e largura zero levaria o rótulo junto. O número ao
 * lado continua dizendo zero — a figura nunca é a fonte do valor.
 */
const PISO = 7;

/**
 * O quanto cada lâmina estreita sozinha, de cima para baixo.
 *
 * Constante e igual para todas: é o que faz a peça parecer empilhada em vez de
 * um cone liso, e por ser a mesma em todas não mexe na proporção entre etapas.
 */
const CHANFRO = 0.84;

function largura(valor: number, topo: number): number {
  if (topo <= 0) return PISO;
  return Math.max(PISO, (valor / topo) * BOCA);
}

function lamina(cima: number): string {
  const baixo = cima * CHANFRO;
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

function Lamina({ etapa, cima, cor }: { etapa: FunnelStage; cima: number; cor: string }) {
  const recorte = lamina(cima);

  return (
    <div
      aria-hidden="true"
      className="relative h-full w-full transition-transform duration-[var(--duration-base)] ease-[var(--ease-out-soft)] group-hover:scale-[1.03]"
    >
      <div
        className="absolute inset-0"
        style={{
          clipPath: recorte,
          // Degradê dentro do mesmo passo, na diagonal: dá volume à lâmina sem
          // introduzir uma segunda cor, que quebraria a leitura de rampa.
          background: `linear-gradient(105deg, color-mix(in oklab, ${cor} 82%, white) 0%, ${cor} 46%, color-mix(in oklab, ${cor} 68%, #17111b) 100%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          clipPath: recorte,
          background: "linear-gradient(180deg, rgba(255,255,255,0.5) 0%, transparent 30%)",
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

export function FunnelChart({ block }: { block: FunnelBlock }) {
  const etapas = block.stages;
  if (etapas.length === 0) return null;

  const topo = etapas[0]?.value ?? 0;

  return (
    <figure className="qy-fade relative overflow-hidden rounded-[var(--radius-slab)] bg-plum-800 px-4 py-6 text-white sm:px-7 sm:py-9">
      <LightBlock className="opacity-70" />

      <figcaption className="sr-only">
        {block.title}
        {block.description ? `. ${block.description}` : ""}
      </figcaption>

      <ol className="relative space-y-2.5">
        {etapas.map((etapa, i) => {
          const cima = largura(etapa.value, topo);
          const doTopo = topo === 0 ? 0 : etapa.value / topo;
          const anterior = etapas[i - 1]?.value;
          const queda =
            anterior === undefined || anterior === 0 ? null : 1 - etapa.value / anterior;
          const cor =
            etapa.outcome === "ganho" ? "var(--qy-funnel-ganho)" : corDaEtapa(i, etapas.length);
          const tinta = paraTexto(cor);

          return (
            <li
              key={etapa.label}
              className="group grid grid-cols-2 items-center gap-x-2 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,1fr)] sm:gap-x-0"
            >
              {/* Caixa de rótulo na cor da lâmina, com o fio ligando à forma —
                  o texto fica fora do trapézio, onde nome comprido não cabe e o
                  contraste mudaria a cada passo da rampa. */}
              <div className="flex items-center">
                <div
                  className="min-w-0 flex-1 rounded-lg border px-3 py-2.5"
                  style={{
                    borderColor: `color-mix(in oklab, ${cor} 55%, transparent)`,
                    background: `color-mix(in oklab, ${cor} 9%, transparent)`,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {etapa.outcome === "ganho" ? (
                      <Trophy
                        aria-hidden="true"
                        className="size-4 shrink-0"
                        style={{ color: tinta }}
                      />
                    ) : null}
                    {/* Sem truncar: "Venda gan…" é etapa que ninguém identifica. */}
                    <span
                      className="font-bold text-[13px] uppercase leading-tight tracking-wider"
                      style={{ color: tinta }}
                    >
                      {etapa.label}
                    </span>
                  </div>
                </div>
                <span
                  aria-hidden="true"
                  className="hidden h-px w-5 shrink-0 sm:block"
                  style={{ background: `color-mix(in oklab, ${cor} 55%, transparent)` }}
                />
              </div>

              {/* A forma. Some no telefone: com a tela estreita a lâmina fica
                  rasa demais para dizer alguma coisa, e o que sobra — nome,
                  contagem e queda — já é o funil em texto. */}
              <div className="col-span-2 hidden h-[4.5rem] sm:col-span-1 sm:block">
                <Lamina etapa={etapa} cima={cima} cor={cor} />
              </div>

              <div className="flex items-center">
                <span
                  aria-hidden="true"
                  className="hidden h-px w-5 shrink-0 sm:block"
                  style={{ background: `color-mix(in oklab, ${cor} 55%, transparent)` }}
                />
                <div
                  className="flex flex-1 items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  style={{
                    borderColor: `color-mix(in oklab, ${cor} 55%, transparent)`,
                    background: `color-mix(in oklab, ${cor} 9%, transparent)`,
                  }}
                >
                  <span
                    className="font-bold text-xl leading-none tabular-nums"
                    style={{ color: tinta }}
                  >
                    {formatMetric(etapa.value, "integer")}
                  </span>
                  {/* Duas linhas curtas, e não tudo numa: nesta largura "da
                      etapa anterior" quebra no meio e o número perde o rótulo. */}
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
