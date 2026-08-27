import type { ChannelId } from "./types";

export interface ChannelMeta {
  id: ChannelId;
  label: string;
  /** Rota da tela do canal. */
  href: string;
  /** Slot fixo na paleta categórica — a cor segue o canal, sempre. */
  slot: 1 | 2 | 3 | 4 | 5;
  description: string;
}

export const CHANNELS: readonly ChannelMeta[] = [
  {
    id: "meta-ads",
    label: "Meta Ads",
    href: "/meta-ads",
    slot: 1,
    description: "Campanhas pagas no Facebook e Instagram",
  },
  {
    id: "google-ads",
    label: "Google Ads",
    href: "/google-ads",
    slot: 2,
    description: "Search, Performance Max e Display",
  },
  {
    id: "ga4",
    label: "Analytics",
    href: "/analytics",
    slot: 3,
    description: "Sessões, engajamento e conversões do GA4",
  },
  {
    id: "organico",
    label: "Orgânico",
    href: "/organico",
    slot: 4,
    description: "Instagram e Facebook sem mídia paga",
  },
] as const;

/**
 * Vendas: o que acontece depois do lead.
 *
 * Fora de `CHANNELS` de propósito — a visão geral consolida investimento e
 * conversão de mídia, e receita não pertence àquela soma. Mas é um relatório
 * completo, com as mesmas peças das telas de canal.
 */
export const VENDAS: ChannelMeta = {
  id: "vendas",
  label: "Vendas",
  href: "/vendas",
  slot: 5,
  description: "Negócios fechados, receita e conversão de lead em venda, pelo Kommo",
};

/** Tudo que tem tela de relatório, canal de aquisição ou não. */
export const RELATORIOS: readonly ChannelMeta[] = [...CHANNELS, VENDAS];

const BY_ID = new Map(RELATORIOS.map((c) => [c.id, c]));

export function getChannel(id: ChannelId): ChannelMeta {
  const meta = BY_ID.get(id);
  if (!meta) throw new Error(`Canal desconhecido: ${id}`);
  return meta;
}
