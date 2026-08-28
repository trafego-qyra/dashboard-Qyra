import "server-only";

import { GOOGLE_ADS_SNAPSHOT as S } from "@/data/google-ads-snapshot";
import type { ChannelReport, DateRange } from "@/lib/types";

/**
 * Relatório do Google Ads a partir do snapshot exportado da plataforma.
 *
 * É dado REAL da conta, congelado no período do export — não é demonstração.
 * Existe porque o token de desenvolvedor da API aguarda aprovação de acesso
 * básico, e a operação precisa dos números antes disso.
 *
 * Duas escolhas que valem registro:
 *
 * **A série é por hora do dia, não por data.** O relatório de programação traz
 * dia-da-semana × hora; no período de 14 dias cada dia da semana ocorre duas
 * vezes, e o export não diz como o total se divide entre as duas ocorrências.
 * Uma série diária seria invenção. A quebra por hora é o recorte que o dado
 * sustenta — e responde a pergunta que a conta faz: em que horário o
 * investimento rende.
 *
 * **O período não acompanha o filtro de datas.** O snapshot tem o intervalo do
 * export e mais nada; recortá-lo em 7 dias exigiria uma divisão que o dado não
 * autoriza. A tela declara o período real.
 */
export function buildGoogleAdsSnapshotReport(
  range: DateRange,
  fetchedAt = new Date().toISOString(),
): ChannelReport {
  const t = S.totais;

  return {
    channel: "google-ads",
    label: "Google Ads",
    source: "snapshot",
    range,
    periodLabel: S.periodoRotulo,
    fetchedAt,
    seriesAxis: "hour",

    kpis: [
      { key: "cost", label: "Investimento", value: t.custo, format: "currency" },
      { key: "clicks", label: "Cliques", value: t.cliques, format: "integer" },
      {
        key: "cpc",
        label: "CPC médio",
        value: t.cpc,
        format: "currency",
        lowerIsBetter: true,
      },
      { key: "ctr", label: "CTR", value: t.ctr, format: "percent" },
      { key: "impressions", label: "Impressões", value: t.impressoes, format: "integer" },
      {
        key: "conversions",
        label: "Conversões",
        value: t.conversoes,
        format: "integer",
        hint: "Conversões registradas pelo Google Ads no período do export.",
      },
    ],

    series: S.porHora.map((p) => ({
      date: String(p.hora).padStart(2, "0"),
      cost: p.custo,
      clicks: p.cliques,
      impressions: p.impressoes,
      conversions: p.conversoes,
    })),
    seriesDefs: [
      { key: "cost", label: "Investimento", format: "currency", slot: 1 },
      { key: "clicks", label: "Cliques", format: "integer", slot: 2 },
    ],

    tables: [
      {
        title: "Campanhas",
        description: "Todas as campanhas ativas no período, com orçamento diário.",
        columns: [
          { key: "campanha", label: "Campanha", align: "left" },
          { key: "status", label: "Status", align: "left" },
          { key: "orcamentoDiario", label: "Orçamento/dia", format: "currency", align: "right" },
          { key: "custo", label: "Investimento", format: "currency", align: "right" },
          { key: "cliques", label: "Cliques", format: "integer", align: "right" },
          { key: "ctr", label: "CTR", format: "percent", align: "right" },
          { key: "cpc", label: "CPC", format: "currency", align: "right" },
          { key: "conversoes", label: "Conversões", format: "integer", align: "right" },
        ],
        rows: [...S.campanhas],
      },
      {
        title: "Grupos de anúncios",
        description: "Ordenados por investimento. É aqui que se vê onde o orçamento realmente foi.",
        columns: [
          { key: "grupo", label: "Grupo", align: "left" },
          { key: "impressoes", label: "Impressões", format: "integer", align: "right" },
          { key: "cliques", label: "Cliques", format: "integer", align: "right" },
          { key: "ctr", label: "CTR", format: "percent", align: "right" },
          { key: "custo", label: "Investimento", format: "currency", align: "right" },
          { key: "cpc", label: "CPC", format: "currency", align: "right" },
          { key: "conversoes", label: "Conversões", format: "integer", align: "right" },
        ],
        rows: [...S.grupos],
      },
      {
        title: "Termos de pesquisa",
        description: `O que as pessoas realmente digitaram. Os ${S.termos.length} com mais cliques, de ${S.termos.length + S.termosRestantes} termos no período.`,
        columns: [
          { key: "termo", label: "Termo", align: "left" },
          { key: "grupo", label: "Grupo", align: "left" },
          { key: "impressoes", label: "Impressões", format: "integer", align: "right" },
          { key: "cliques", label: "Cliques", format: "integer", align: "right" },
          { key: "ctr", label: "CTR", format: "percent", align: "right" },
          { key: "custo", label: "Investimento", format: "currency", align: "right" },
        ],
        rows: [...S.termos],
      },
      {
        title: "Palavras-chave",
        description: "Ordenadas por investimento.",
        columns: [
          { key: "palavra", label: "Palavra-chave", align: "left" },
          { key: "correspondencia", label: "Correspondência", align: "left" },
          { key: "impressoes", label: "Impressões", format: "integer", align: "right" },
          { key: "cliques", label: "Cliques", format: "integer", align: "right" },
          { key: "ctr", label: "CTR", format: "percent", align: "right" },
          { key: "custo", label: "Investimento", format: "currency", align: "right" },
          { key: "cpc", label: "CPC", format: "currency", align: "right" },
        ],
        rows: [...S.palavras],
      },
      {
        title: "Dispositivos",
        description: "Participação de cada dispositivo no investimento.",
        columns: [
          { key: "dispositivo", label: "Dispositivo", align: "left" },
          { key: "impressoes", label: "Impressões", format: "integer", align: "right" },
          { key: "cliques", label: "Cliques", format: "integer", align: "right" },
          { key: "ctr", label: "CTR", format: "percent", align: "right" },
          { key: "custo", label: "Investimento", format: "currency", align: "right" },
          {
            key: "participacaoDoCusto",
            label: "% do investimento",
            format: "percent",
            align: "right",
          },
        ],
        rows: [...S.dispositivos],
      },
      {
        title: "Desempenho por dia da semana",
        description: "A campanha entregou apenas nos dias listados.",
        columns: [
          { key: "dia", label: "Dia", align: "left" },
          { key: "impressoes", label: "Impressões", format: "integer", align: "right" },
          { key: "cliques", label: "Cliques", format: "integer", align: "right" },
          { key: "ctr", label: "CTR", format: "percent", align: "right" },
          { key: "custo", label: "Investimento", format: "currency", align: "right" },
          { key: "conversoes", label: "Conversões", format: "integer", align: "right" },
        ],
        rows: [...S.porDiaDaSemana],
      },
      {
        title: "Locais",
        description: `Os ${S.locais.length} de maior investimento, de ${S.locais.length + S.locaisRestantes} localidades alcançadas.`,
        columns: [
          { key: "local", label: "Local", align: "left" },
          { key: "impressoes", label: "Impressões", format: "integer", align: "right" },
          { key: "cliques", label: "Cliques", format: "integer", align: "right" },
          { key: "ctr", label: "CTR", format: "percent", align: "right" },
          { key: "custo", label: "Investimento", format: "currency", align: "right" },
        ],
        rows: [...S.locais],
      },
      // As porcentagens saem como TEXTO, na notação da própria plataforma. O
      // Google publica faixas em vez de valores quando o volume é baixo — o
      // "< 10%" que aparece na linha "Você" — e converter isso em número diria
      // "nenhuma impressão" onde o dado real é "menos de dez por cento".
      ...(S.leilao.length > 0
        ? [
            {
              title: "Quem disputa as mesmas buscas",
              description:
                'Anunciantes que apareceram nos mesmos leilões. A linha "Você" é a conta da QYRA — comparar as duas colunas de parcela mostra quanto do espaço disponível cada um leva.',
              columns: [
                { key: "dominio", label: "Anunciante", align: "left" as const },
                {
                  key: "parcelaImpressoes",
                  label: "Parcela de impressões",
                  align: "right" as const,
                },
                { key: "sobreposicao", label: "Sobreposição", align: "right" as const },
                { key: "posicaoSuperior", label: "Ficou acima", align: "right" as const },
                { key: "topoDaPagina", label: "Topo da página", align: "right" as const },
                { key: "parcelaVitorias", label: "Parcela de vitórias", align: "right" as const },
              ],
              rows: [...S.leilao],
            },
          ]
        : []),
    ],

    // Sem aviso: o cabeçalho da tela já estampa "Período fixo · <intervalo>", e
    // no resumo por canal o rótulo sai como "Google Ads · período fixo". Uma
    // faixa amarela repetindo isso só rouba a primeira dobra.
    notices: [],
  };
}
