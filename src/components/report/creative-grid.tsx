"use client";

import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, Images, Play } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { formatMetric } from "@/lib/format";
import type { ContentCard } from "@/lib/types";

/** Régua de retenção: quanto do vídeo cada faixa de gente assistiu. */
function Retencao({ video }: { video: NonNullable<ContentCard["video"]> }) {
  const marcas = [
    { rotulo: "25%", valor: video.p25 },
    { rotulo: "50%", valor: video.p50 },
    { rotulo: "75%", valor: video.p75 },
    { rotulo: "fim", valor: video.p100 },
  ];

  return (
    <div className="mt-3 border-line border-t pt-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] text-ink-muted">Retenção do vídeo</p>
        <p className="text-[11px] text-ink-secondary tabular">
          {formatMetric(video.reproducoes, "integer")} reproduções
        </p>
      </div>
      <div className="mt-2 flex gap-1.5">
        {marcas.map(({ rotulo, valor }) => (
          <div key={rotulo} className="min-w-0 flex-1">
            {/* A barra é a leitura rápida; o número embaixo é a conferência. */}
            <div
              className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
              role="presentation"
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, Math.max(0, valor * 100))}%` }}
              />
            </div>
            {/* Duas porcentagens na mesma linha ("25% · 46%") se leem como um
                valor só. A marca fica acima, muda, e o valor abaixo. */}
            <p className="mt-1 text-[10px] text-ink-muted leading-tight">{rotulo}</p>
            <p className="font-medium text-[11px] text-ink tabular leading-tight">
              {formatMetric(valor, "percent")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Uma arte no quadro, inteira e sem corte.
 *
 * `object-cover` num quadro fixo decapitava Reels: 9:16 dentro de 5:4 perde
 * mais da metade da peça, e o que sobra costuma ser o meio do vídeo — sem
 * a headline, que é justamente o que se quer avaliar.
 *
 * `object-contain` mostra tudo, e a mesma imagem desfocada preenche o fundo
 * para a sobra não virar barra preta. É o mesmo arquivo, então o navegador
 * baixa uma vez só.
 */
function Quadro({ src, alt, prioridade }: { src: string; alt: string; prioridade?: boolean }) {
  const [falhou, setFalhou] = useState(false);

  // Uma arte que não carrega deixaria o slide em branco, e no carrossel isso
  // se lê como "acabou" — pior que dizer que faltou.
  if (falhou) return <SemArte dentroDoQuadro />;

  return (
    <>
      {/* Fundo: mesma imagem, borrada e ampliada. Preenche a sobra sem
          inventar cor e sem competir com a peça. */}
      {/* biome-ignore lint/performance/noImgElement: servida pelo proxy do próprio domínio */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full scale-110 object-cover blur-xl saturate-150"
      />
      {/* biome-ignore lint/performance/noImgElement: servida pelo proxy do próprio domínio */}
      <img
        src={src}
        alt={alt}
        loading={prioridade ? undefined : "lazy"}
        decoding="async"
        onError={() => setFalhou(true)}
        className="relative size-full object-contain"
      />
    </>
  );
}

/** `dentroDoQuadro`: já existe um quadro em volta (slide do carrossel), então não repete a proporção. */
function SemArte({ dentroDoQuadro }: { dentroDoQuadro?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-surface-sunken",
        dentroDoQuadro ? "size-full" : "aspect-[4/5]",
      )}
    >
      <ImageOff className="size-6 text-ink-muted" aria-hidden="true" />
      <span className="sr-only">Arte indisponível</span>
    </div>
  );
}

const SETA = cn(
  "-translate-y-1/2 absolute top-1/2 grid size-7 place-items-center rounded-full",
  "bg-white/90 text-plum-800 shadow-[0_2px_10px_-4px_rgba(47,37,53,0.6)]",
  "transition-[opacity,background-color] duration-[var(--duration-fast)]",
  "hover:bg-white disabled:pointer-events-none disabled:opacity-0",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
  // O círculo tem 28px para não tapar a arte, mas o dedo precisa de 44px.
  // A área invisível cresce em volta sem mudar o desenho.
  "after:absolute after:-inset-2 after:content-['']",
);

/**
 * O carrossel do post, com todas as artes.
 *
 * A Meta entrega o álbum como uma mídia só, e por isso o cartão mostrava
 * apenas a primeira imagem — quem monta carrossel põe o argumento nas de
 * dentro, então o que aparecia era a capa e mais nada.
 *
 * A rolagem é nativa, com encaixe: dedo e trackpad já funcionavam sozinhos, e
 * as setas existem porque no desktop com mouse não há gesto equivalente. O
 * contador diz quantas artes existem antes de a pessoa tentar rolar — sem ele
 * o carrossel se confunde com uma imagem parada.
 */
function Carrossel({ artes, titulo }: { artes: string[]; titulo: string }) {
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);

  function irPara(indice: number) {
    const elemento = trilho.current;
    if (!elemento) return;
    const destino = Math.min(artes.length - 1, Math.max(0, indice));
    elemento.scrollTo({ left: destino * elemento.clientWidth, behavior: "smooth" });
  }

  function aoRolar() {
    const elemento = trilho.current;
    if (!elemento || elemento.clientWidth === 0) return;
    // Arredondar em vez de dividir seco: no meio do gesto o valor é fracionário,
    // e o marcador ficaria trocando de lugar durante a rolagem.
    setAtual(Math.round(elemento.scrollLeft / elemento.clientWidth));
  }

  return (
    <div className="group/carrossel relative aspect-[4/5] w-full overflow-hidden bg-plum-800">
      <div
        ref={trilho}
        onScroll={aoRolar}
        className="qy-sem-barra flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        // A região rola: sem foco pelo teclado, quem não usa mouse fica sem as
        // artes de dentro mesmo com as setas ao lado.
        // biome-ignore lint/a11y/noNoninteractiveTabindex: região rolável precisa receber foco
        tabIndex={0}
        role="group"
        aria-label={`Carrossel com ${artes.length} artes: ${titulo}`}
      >
        {artes.map((arte, indice) => (
          <div key={arte} className="relative size-full shrink-0 snap-center">
            <Quadro
              src={arte}
              alt={`Arte ${indice + 1} de ${artes.length}: ${titulo}`}
              prioridade={indice === 0}
            />
          </div>
        ))}
      </div>

      <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-plum-800/85 px-2 py-1 font-medium text-[10px] text-white tabular">
        <Images className="size-3" aria-hidden="true" />
        {atual + 1}/{artes.length}
      </span>

      <button
        type="button"
        onClick={() => irPara(atual - 1)}
        disabled={atual === 0}
        className={cn(SETA, "left-2")}
        aria-label="Arte anterior"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => irPara(atual + 1)}
        disabled={atual >= artes.length - 1}
        className={cn(SETA, "right-2")}
        aria-label="Próxima arte"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>

      {/* Acima de dez artes os marcadores viram uma fileira de pontinhos
          ilegível — aí o contador sozinho informa melhor. */}
      {artes.length <= 10 ? (
        <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden="true">
          {artes.map((arte, indice) => (
            <span
              key={arte}
              className={cn(
                "h-1.5 rounded-full bg-white transition-[width,opacity] duration-[var(--duration-fast)]",
                indice === atual ? "w-4 opacity-95" : "w-1.5 opacity-50",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A peça do cartão: carrossel quando o post tem mais de uma arte, quadro único quando não. */
function Arte({ criativo }: { criativo: ContentCard }) {
  const [falhou, setFalhou] = useState(false);
  const ehVideo = criativo.video !== undefined;
  const galeria = criativo.galeria;

  if (galeria && galeria.length > 1) {
    // Sem `<a>` por fora: o link engoliria o gesto de arrastar e cada tentativa
    // de rolar abriria o Instagram. O botão embaixo do cartão faz esse papel.
    return <Carrossel artes={galeria} titulo={criativo.title} />;
  }

  if (!criativo.imageUrl || falhou) return <SemArte />;

  const arte = (
    <div className="relative aspect-[4/5] w-full overflow-hidden bg-plum-800">
      {/* biome-ignore lint/performance/noImgElement: servida pelo proxy do próprio domínio */}
      <img
        src={criativo.imageUrl}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full scale-110 object-cover blur-xl saturate-150"
      />
      {/* biome-ignore lint/performance/noImgElement: servida pelo proxy do próprio domínio */}
      <img
        src={criativo.imageUrl}
        alt={`Arte de ${criativo.title}`}
        loading="lazy"
        decoding="async"
        onError={() => setFalhou(true)}
        className="relative size-full object-contain"
      />

      {ehVideo ? (
        <span
          className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-plum-800/85 px-2 py-1 font-medium text-[10px] text-white"
          aria-hidden="true"
        >
          <Play className="size-3 fill-current" />
          vídeo
        </span>
      ) : null}
    </div>
  );

  if (!criativo.link) return arte;

  return (
    <a
      href={criativo.link}
      target="_blank"
      rel="noreferrer"
      className="group/arte relative block"
      aria-label={`${criativo.linkLabel ?? "Abrir peça"}: ${criativo.title}`}
    >
      {arte}
      <span className="absolute inset-0 flex items-center justify-center bg-plum-800/0 opacity-0 transition-[background-color,opacity] duration-[var(--duration-base)] group-hover/arte:bg-plum-800/55 group-hover/arte:opacity-100">
        <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 font-medium text-[11px] text-plum-800">
          <ExternalLink className="size-3.5" aria-hidden="true" />
          {criativo.linkLabel ?? "Abrir"}
        </span>
      </span>
    </a>
  );
}

/**
 * Os anúncios que trouxeram resultado, com a arte.
 *
 * Numa reunião, a pergunta que vem depois de "quanto gastou" é "qual criativo
 * puxou isso" — e ela não se responde com nome de anúncio numa linha de tabela.
 */
export function CreativeGrid({ criativos }: { criativos: ContentCard[] }) {
  return (
    <ul className="qy-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {criativos.map((criativo, posicao) => (
        <li
          key={criativo.id || criativo.title}
          className={cn(
            "overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface",
            "transition-[border-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out-soft)]",
            "hover:border-line-strong hover:shadow-[0_8px_28px_-20px_rgba(47,37,53,0.4)]",
          )}
        >
          <div className="relative">
            <Arte criativo={criativo} />
            <span
              className="absolute top-2 left-2 rounded-full bg-plum-800/85 px-2 py-0.5 font-medium text-[11px] text-white tabular"
              aria-hidden="true"
            >
              {posicao + 1}
            </span>
          </div>

          <div className="p-3.5">
            {criativo.link ? (
              <a
                href={criativo.link}
                target="_blank"
                rel="noreferrer"
                className="block truncate font-semibold text-ink text-sm hover:underline"
                title={criativo.title}
              >
                {criativo.title}
              </a>
            ) : (
              <p className="truncate font-semibold text-ink text-sm" title={criativo.title}>
                {criativo.title}
              </p>
            )}
            {criativo.subtitle ? (
              <p className="truncate text-[11px] text-ink-muted" title={criativo.subtitle}>
                {criativo.subtitle}
              </p>
            ) : null}

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {criativo.metrics.map(({ label, value, format }) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] text-ink-muted leading-tight">{label}</dt>
                  <dd className="truncate font-medium text-ink text-sm tabular">
                    {formatMetric(value, format)}
                  </dd>
                </div>
              ))}
            </dl>

            {criativo.video ? <Retencao video={criativo.video} /> : null}

            {/* Botão explícito: o link no título passava despercebido, e o
                overlay da arte só aparece no hover — que não existe no celular. */}
            {criativo.link ? (
              <a
                href={criativo.link}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "mt-3 flex w-full items-center justify-center gap-1.5 rounded-full",
                  "border border-line-strong bg-surface px-3 py-2",
                  "font-medium text-[11px] text-ink-secondary",
                  "transition-colors duration-[var(--duration-fast)]",
                  "hover:bg-surface-sunken hover:text-ink",
                )}
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                {criativo.linkLabel ?? "Abrir peça"}
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
