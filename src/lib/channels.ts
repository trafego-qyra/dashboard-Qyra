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

const BY_ID = new Map(CHANNELS.map((c) => [c.id, c]));

export function getChannel(id: ChannelId): ChannelMeta {
  const meta = BY_ID.get(id);
  if (!meta) throw new Error(`Canal desconhecido: ${id}`);
  return meta;
}
