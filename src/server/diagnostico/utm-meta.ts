import "server-only";

/**
 * Auditoria de UTM dos anúncios da Meta.
 *
 * Sem UTM, o negócio chega no Kommo sem origem e a tabela "Vendas por origem"
 * fica em "Sem UTM" — o painel mostra quanto se investiu e quanto se vendeu, mas
 * não consegue ligar as duas pontas. É a diferença entre saber o custo por lead
 * e saber o custo por venda.
 *
 * Esta leitura é só leitura: ela diz o que falta, e quem corrige é quem tem
 * acesso de escrita ao Gerenciador. Marcar a URL de um anúncio no ar é mudança
 * na conta do cliente, não no painel.
 */

/** O que a Meta devolve por anúncio, no recorte que interessa aqui. */
export interface AnuncioDaMeta {
  id: string;
  name?: string;
  effective_status?: string;
  campaign?: { name?: string };
  adset?: { name?: string };
  creative?: {
    /** Parâmetros de rastreamento, o campo "Parâmetros de URL" do Gerenciador. */
    url_tags?: string;
    object_story_spec?: { link_data?: { link?: string } };
    /** Criativo dinâmico guarda os destinos noutro lugar. */
    asset_feed_spec?: { link_urls?: Array<{ website_url?: string }> };
  };
}

/** Os quatro que o painel usa. `utm_term` é opcional e não entra na conta. */
export const UTMS_ESPERADAS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;

export type Utm = (typeof UTMS_ESPERADAS)[number];

export interface LinhaDaAuditoria {
  anuncio: string;
  campanha: string;
  conjunto: string;
  status: string;
  /** O destino, sem a query — a query vira `presentes`. */
  destino: string | null;
  presentes: Utm[];
  faltando: Utm[];
  /** Valor de `utm_source`, quando existe: é onde a fragmentação aparece. */
  origem: string | null;
}

export interface Auditoria {
  total: number;
  completos: number;
  semNenhuma: number;
  /** Os valores distintos de `utm_source` encontrados, do mais usado ao menos. */
  origens: Array<{ valor: string; anuncios: number }>;
  linhas: LinhaDaAuditoria[];
}

/**
 * Os parâmetros que chegam ao site, venham da URL ou do campo de rastreamento.
 *
 * A Meta junta os dois: o que está em "Parâmetros de URL" é anexado ao destino
 * na hora do clique. Olhar só um dos lados reprova anúncio configurado certo —
 * e é o erro que faz a auditoria virar ruído em vez de lista de tarefas.
 */
function parametros(destino: string | undefined, urlTags: string | undefined): Map<string, string> {
  const mapa = new Map<string, string>();

  const absorver = (busca: string) => {
    // `URLSearchParams` aceita a string solta do campo de rastreamento, que vem
    // exatamente no formato `a=1&b=2` — sem `?`.
    for (const [chave, valor] of new URLSearchParams(busca)) {
      if (valor.trim() !== "") mapa.set(chave.toLowerCase(), valor);
    }
  };

  if (destino) {
    try {
      absorver(new URL(destino).search);
    } catch {
      // Destino inválido não invalida o resto: o campo de rastreamento pode
      // estar correto sozinho.
    }
  }
  if (urlTags) absorver(urlTags.replace(/^\?/, ""));

  return mapa;
}

function semQuery(destino: string | undefined): string | null {
  if (!destino) return null;
  try {
    const url = new URL(destino);
    return `${url.origin}${url.pathname}`;
  } catch {
    return destino;
  }
}

function destinoDoAnuncio(anuncio: AnuncioDaMeta): string | undefined {
  return (
    anuncio.creative?.object_story_spec?.link_data?.link ??
    anuncio.creative?.asset_feed_spec?.link_urls?.[0]?.website_url
  );
}

export function auditarUtms(anuncios: AnuncioDaMeta[]): Auditoria {
  const linhas: LinhaDaAuditoria[] = anuncios.map((anuncio) => {
    const destino = destinoDoAnuncio(anuncio);
    const encontrados = parametros(destino, anuncio.creative?.url_tags);

    const presentes = UTMS_ESPERADAS.filter((utm) => encontrados.has(utm));
    return {
      anuncio: anuncio.name ?? anuncio.id,
      campanha: anuncio.campaign?.name ?? "—",
      conjunto: anuncio.adset?.name ?? "—",
      status: anuncio.effective_status ?? "—",
      destino: semQuery(destino),
      presentes,
      faltando: UTMS_ESPERADAS.filter((utm) => !encontrados.has(utm)),
      origem: encontrados.get("utm_source") ?? null,
    };
  });

  // Valores distintos de `utm_source`. Mais de um significa que o mesmo canal
  // chega ao GA4 e ao CRM sob nomes diferentes, e o relatório se parte em
  // pedaços que ninguém soma de volta.
  const porOrigem = new Map<string, number>();
  for (const linha of linhas) {
    if (!linha.origem) continue;
    porOrigem.set(linha.origem, (porOrigem.get(linha.origem) ?? 0) + 1);
  }

  return {
    total: linhas.length,
    completos: linhas.filter((l) => l.faltando.length === 0).length,
    semNenhuma: linhas.filter((l) => l.presentes.length === 0).length,
    origens: [...porOrigem.entries()]
      .map(([valor, anuncios]) => ({ valor, anuncios }))
      .sort((a, b) => b.anuncios - a.anuncios),
    linhas,
  };
}
