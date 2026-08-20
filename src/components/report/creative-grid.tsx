"use client";

import { ExternalLink, ImageOff, Play } from "lucide-react";
import { useState } from "react";

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
 * A arte inteira, sem corte.
 *
 * `object-cover` num quadro fixo decapitava Reels: 9:16 dentro de 5:4 perde
 * mais da metade da peça, e o que sobra costuma ser o meio do vídeo — sem
 * a headline, que é justamente o que se quer avaliar.
 *
 * `object-contain` mostra tudo, e a mesma imagem desfocada preenche o fundo
 * para a sobra não virar barra preta. É o mesmo arquivo, então o navegador
 * baixa uma vez só.
 */
function Arte({ criativo }: { criativo: ContentCard }) {
  const [falhou, setFalhou] = useState(false);
  const ehVideo = criativo.video !== undefined;

  if (!criativo.imageUrl || falhou) {
    return (
      <div className="flex aspect-[4/5] items-center justify-center bg-surface-sunken">
        <ImageOff className="size-6 text-ink-muted" aria-hidden="true" />
        <span className="sr-only">Arte indisponível</span>
      </div>
    );
  }

  const arte = (
    <div className="relative aspect-[4/5] w-full overflow-hidden bg-plum-800">
      {/* Fundo: mesma imagem, borrada e ampliada. Preenche a sobra sem
          inventar cor e sem competir com a peça. */}
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
