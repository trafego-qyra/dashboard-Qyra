import { describe, expect, it } from "vitest";

import { type AnuncioDaMeta, auditarUtms } from "@/server/diagnostico/utm-meta";

/**
 * Auditoria de UTM da Meta.
 *
 * O erro caro aqui não é deixar de achar um problema — é apontar problema onde
 * não há. Uma lista com anúncios corretos marcados como quebrados faz quem
 * opera parar de olhar a lista, e aí ela deixa de servir para qualquer coisa.
 */

const COMPLETA = "utm_source=meta&utm_medium=paid_social&utm_campaign=x&utm_content=y";

function anuncio(parcial: Partial<AnuncioDaMeta> & { id: string }): AnuncioDaMeta {
  return { name: parcial.id, ...parcial };
}

function comDestino(id: string, link: string, urlTags?: string): AnuncioDaMeta {
  return anuncio({
    id,
    creative: { url_tags: urlTags, object_story_spec: { link_data: { link } } },
  });
}

describe("auditarUtms", () => {
  it("reconhece UTM que vem na própria URL de destino", () => {
    const { linhas } = auditarUtms([comDestino("a", `https://qyra.com.br/lp?${COMPLETA}`)]);

    expect(linhas[0].faltando).toEqual([]);
    expect(linhas[0].origem).toBe("meta");
  });

  it("reconhece UTM que vem do campo de parâmetros do Gerenciador", () => {
    const { linhas } = auditarUtms([comDestino("a", "https://qyra.com.br/lp", COMPLETA)]);

    // A Meta anexa o campo de rastreamento ao destino no clique. Olhar só a URL
    // reprovaria um anúncio configurado certo — e lista com falso alarme é
    // lista que ninguém lê.
    expect(linhas[0].faltando).toEqual([]);
  });

  it("soma os dois lados quando cada um traz uma parte", () => {
    const { linhas } = auditarUtms([
      comDestino(
        "a",
        "https://qyra.com.br/lp?utm_source=meta&utm_medium=paid_social",
        "utm_campaign=x&utm_content=y",
      ),
    ]);

    expect(linhas[0].faltando).toEqual([]);
  });

  it("aponta exatamente o que falta, e não só que falta algo", () => {
    const { linhas } = auditarUtms([
      comDestino("a", "https://qyra.com.br/lp?utm_source=meta&utm_medium=paid_social"),
    ]);

    // "Está incompleto" manda alguém abrir o anúncio para descobrir o quê.
    expect(linhas[0].faltando).toEqual(["utm_campaign", "utm_content"]);
    expect(linhas[0].presentes).toEqual(["utm_source", "utm_medium"]);
  });

  it("parâmetro com valor vazio conta como ausente", () => {
    const { linhas } = auditarUtms([
      comDestino("a", "https://qyra.com.br/lp?utm_source=&utm_medium=paid_social"),
    ]);

    // `utm_source=` chega ao GA4 como origem em branco: presente na URL, inútil
    // no relatório.
    expect(linhas[0].faltando).toContain("utm_source");
  });

  it("lê o destino do criativo dinâmico, que guarda a URL noutro lugar", () => {
    const { linhas } = auditarUtms([
      anuncio({
        id: "a",
        creative: {
          asset_feed_spec: { link_urls: [{ website_url: `https://qyra.com.br/lp?${COMPLETA}` }] },
        },
      }),
    ]);

    expect(linhas[0].faltando).toEqual([]);
  });

  it("destino inválido não derruba a leitura do campo de rastreamento", () => {
    const { linhas } = auditarUtms([comDestino("a", "não é uma url", COMPLETA)]);

    expect(linhas[0].faltando).toEqual([]);
  });

  it("anúncio sem criativo nenhum aparece como sem UTM, e não some", () => {
    const { linhas, semNenhuma } = auditarUtms([anuncio({ id: "a" })]);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].presentes).toEqual([]);
    expect(semNenhuma).toBe(1);
  });

  it("lista os valores distintos de origem, do mais usado ao menos", () => {
    const { origens } = auditarUtms([
      comDestino("a", "https://q.com/?utm_source=meta"),
      comDestino("b", "https://q.com/?utm_source=meta"),
      comDestino("c", "https://q.com/?utm_source=ig"),
    ]);

    // Mais de um valor significa o mesmo canal chegando ao GA4 e ao CRM sob
    // nomes diferentes — o relatório se parte em pedaços que ninguém soma.
    expect(origens).toEqual([
      { valor: "meta", anuncios: 2 },
      { valor: "ig", anuncios: 1 },
    ]);
  });

  it("conta quantos estão completos e quantos estão zerados", () => {
    const { total, completos, semNenhuma } = auditarUtms([
      comDestino("a", `https://q.com/?${COMPLETA}`),
      comDestino("b", "https://q.com/?utm_source=meta"),
      comDestino("c", "https://q.com/"),
    ]);

    expect({ total, completos, semNenhuma }).toEqual({ total: 3, completos: 1, semNenhuma: 1 });
  });

  it("guarda o destino sem a query, para a tabela ficar legível", () => {
    const { linhas } = auditarUtms([comDestino("a", `https://qyra.com.br/lp?${COMPLETA}`)]);

    expect(linhas[0].destino).toBe("https://qyra.com.br/lp");
  });
});
