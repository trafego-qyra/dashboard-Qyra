import { describe, expect, it } from "vitest";

import { atencaoDoVideo, tabelaDeAtencao } from "@/lib/video";

describe("atenção de vídeo", () => {
  it("não divide por zero sem impressão nem visualização", () => {
    expect(
      atencaoDoVideo({ impressoes: 0, visualizacoes3s: 0, thruplays: 0, tempoMedio: 0 }),
    ).toEqual({ gancho: 0, segurou: 0, tempoMedio: 0 });
  });

  it("ordena pelo vídeo que mais apareceu", () => {
    const tabela = tabelaDeAtencao([
      {
        nome: "pouco",
        fim: 0.1,
        bruto: { impressoes: 100, visualizacoes3s: 30, thruplays: 10, tempoMedio: 5 },
      },
      {
        nome: "muito",
        fim: 0.1,
        bruto: { impressoes: 900, visualizacoes3s: 90, thruplays: 9, tempoMedio: 3 },
      },
    ]);
    expect(tabela?.rows.map((r) => r.nome)).toEqual(["muito", "pouco"]);
  });

  it("sem vídeo entregue não há tabela", () => {
    expect(
      tabelaDeAtencao([
        {
          nome: "x",
          fim: 0,
          bruto: { impressoes: 100, visualizacoes3s: 0, thruplays: 0, tempoMedio: 0 },
        },
      ]),
    ).toBeNull();
  });
});
