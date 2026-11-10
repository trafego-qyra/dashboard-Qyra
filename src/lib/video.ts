/**
 * Métricas de atenção de vídeo, no vocabulário de quem compra mídia.
 *
 * Mora em `lib/`, e não no conector, porque a demonstração e a tela usam a
 * mesma conta e o mesmo texto de explicação. Quando cada lado calculava o seu,
 * o mock anunciava uma regra e o dado real seguia outra.
 */

import type { TableBlock } from "@/lib/types";

/** Os números crus que a Meta devolve para um anúncio ou uma conta. */
export interface VideoBruto {
  impressoes: number;
  /** Vezes em que o vídeo passou de 3 segundos (`video_view`). */
  visualizacoes3s: number;
  /** Vezes em que assistiram 15 s, ou o vídeo inteiro se ele for mais curto. */
  thruplays: number;
  /** Tempo médio assistido por reprodução, em segundos. */
  tempoMedio: number;
}

export interface AtencaoDoVideo {
  /** Hook rate: de quem viu o anúncio passar, a fração que parou 3 segundos. */
  gancho: number;
  /** Hold rate: de quem parou 3 segundos, a fração que chegou ao ThruPlay. */
  segurou: number;
  /** Segundos assistidos, em média. */
  tempoMedio: number;
}

export function atencaoDoVideo(v: VideoBruto): AtencaoDoVideo {
  return {
    gancho: v.impressoes === 0 ? 0 : v.visualizacoes3s / v.impressoes,
    segurou: v.visualizacoes3s === 0 ? 0 : v.thruplays / v.visualizacoes3s,
    tempoMedio: v.tempoMedio,
  };
}

/**
 * Explicação para quem não vive de tráfego pago.
 *
 * Fica numa frase por termo, com o nome em inglês entre parênteses: é o nome
 * que a agência e a Meta usam, e quem lê precisa reconhecê-lo numa conversa.
 */
const COMO_LER_VIDEO =
  "Gancho (hook rate): de cada 100 pessoas que viram o anúncio passar, quantas pararam pelo menos 3 segundos — mede se o começo prende. " +
  "Segurou (hold rate): de quem parou, quantas assistiram 15 segundos ou o vídeo inteiro — mede se o meio sustenta. " +
  "Tempo médio: quanto tempo cada pessoa assistiu, em média. " +
  "Viu até o fim: de quem começou, quantos chegaram ao último segundo. " +
  "Gancho baixo pede outro começo; gancho bom com segurou baixo pede um meio mais curto.";

/** Um vídeo na tabela de atenção. */
export interface VideoDoAnuncio {
  nome: string;
  bruto: VideoBruto;
  /** Fração de quem começou e chegou ao fim. Entre 0 e 1. */
  fim: number;
}

/**
 * A tabela "onde as pessoas param", um vídeo por linha.
 *
 * Ordena por impressões: o vídeo que mais apareceu é o que mais pesa no
 * resultado, e é por ele que a leitura começa. Sem vídeo no período, não há
 * tabela — uma grade de zeros sugere que o vídeo foi mal, quando nem rodou.
 */
export function tabelaDeAtencao(videos: VideoDoAnuncio[]): TableBlock | null {
  const comEntrega = videos.filter((v) => v.bruto.impressoes > 0 && v.bruto.visualizacoes3s > 0);
  if (comEntrega.length === 0) return null;
  return {
    title: "Vídeos: onde as pessoas param",
    description: COMO_LER_VIDEO,
    columns: [
      { key: "nome", label: "Vídeo", align: "left" },
      { key: "impressoes", label: "Impressões", format: "integer", align: "right" },
      { key: "gancho", label: "Gancho", format: "percent", align: "right" },
      { key: "segurou", label: "Segurou", format: "percent", align: "right" },
      { key: "tempoMedio", label: "Tempo médio", format: "duration", align: "right" },
      { key: "fim", label: "Viu até o fim", format: "percent", align: "right" },
    ],
    rows: [...comEntrega]
      .sort((a, b) => b.bruto.impressoes - a.bruto.impressoes)
      .map((v) => {
        const a = atencaoDoVideo(v.bruto);
        return {
          nome: v.nome,
          impressoes: v.bruto.impressoes,
          gancho: a.gancho,
          segurou: a.segurou,
          tempoMedio: a.tempoMedio,
          fim: v.fim,
        };
      }),
  };
}
