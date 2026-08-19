"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { formatMetric } from "@/lib/format";
import type { CreativeCard } from "@/lib/types";

/** Régua de retenção: quanto do vídeo cada faixa de gente assistiu. */
function Retencao({ video }: { video: NonNullable<CreativeCard["video"]> }) {
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

function Arte({ criativo }: { criativo: CreativeCard }) {
  const [falhou, setFalhou] = useState(false);

  if (!criativo.imageUrl || falhou) {
    return (
      <div className="flex aspect-[5/4] items-center justify-center bg-surface-sunken">
        <ImageOff className="size-6 text-ink-muted" aria-hidden="true" />
        <span className="sr-only">Arte indisponível</span>
      </div>
    );
  }

  return (
    // `img` puro, não `next/image`: a arte é servida pela própria rota de
    // proxy, já dimensionada pela Meta, e o otimizador só acrescentaria um
    // segundo salto para o mesmo byte.
    // biome-ignore lint/performance/noImgElement: servida pelo proxy do próprio domínio
    <img
      src={criativo.imageUrl}
      alt={`Arte do anúncio ${criativo.name}`}
      loading="lazy"
      decoding="async"
      onError={() => setFalhou(true)}
      className="aspect-[5/4] w-full bg-surface-sunken object-cover"
    />
  );
}

/**
 * Os anúncios que trouxeram resultado, com a arte.
 *
 * Numa reunião, a pergunta que vem depois de "quanto gastou" é "qual criativo
 * puxou isso" — e ela não se responde com nome de anúncio numa linha de tabela.
 */
export function CreativeGrid({ criativos }: { criativos: CreativeCard[] }) {
  return (
    <ul className="qy-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {criativos.map((criativo, posicao) => (
        <li
          key={criativo.id || criativo.name}
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
            <p className="truncate font-semibold text-ink text-sm" title={criativo.name}>
              {criativo.name}
            </p>
            {criativo.campaign ? (
              <p className="truncate text-[11px] text-ink-muted" title={criativo.campaign}>
                {criativo.campaign}
              </p>
            ) : null}

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {[
                { rotulo: "Investimento", valor: criativo.spend, formato: "currency" as const },
                { rotulo: "Leads", valor: criativo.leads, formato: "integer" as const },
                { rotulo: "CPL", valor: criativo.cpl, formato: "currency" as const },
                { rotulo: "CTR", valor: criativo.ctr, formato: "percent" as const },
                { rotulo: "CPM", valor: criativo.cpm, formato: "currency" as const },
                {
                  rotulo: "Impressões",
                  valor: criativo.impressions,
                  formato: "integer" as const,
                },
              ].map(({ rotulo, valor, formato }) => (
                <div key={rotulo} className="min-w-0">
                  <dt className="text-[11px] text-ink-muted leading-tight">{rotulo}</dt>
                  <dd className="truncate font-medium text-ink text-sm tabular">
                    {formatMetric(valor, formato)}
                  </dd>
                </div>
              ))}
            </dl>

            {criativo.video ? <Retencao video={criativo.video} /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
