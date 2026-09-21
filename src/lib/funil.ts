import type { FunnelBlock, TableBlock } from "./types";

/**
 * O funil lido passagem por passagem: de quem chegou a uma etapa, quantos
 * seguiram para a seguinte.
 *
 * A figura já mostra isso — é exatamente o quanto cada faixa estreita —, mas
 * mostrar não é dizer. "Onde o funil aperta" é a pergunta que o desenho existe
 * para responder, e respondê-la comparando a largura de dois trapézios é
 * chute. Aqui a passagem vira número, e a menor porcentagem da coluna aponta o
 * gargalo sem ninguém precisar medir nada com o olho.
 *
 * É outra pergunta da que a tabela "Negócios por etapa" responde. Aquela conta
 * ocupação — quantos negócios estão parados em cada etapa agora. Esta conta
 * fluxo, sobre o acumulado do `FunnelBlock`: um negócio em Negociação já passou
 * por Qualificação e conta nas duas passagens.
 *
 * Mora em `lib/` porque o conector e as fixtures precisam da mesma tabela. Se
 * cada um fizesse a sua conta, o painel de demonstração e o dado real
 * divergiriam no dia em que uma das duas mudasse.
 */
export function conversaoPorEtapa(funil: FunnelBlock): TableBlock | undefined {
  const etapas = funil.stages;

  // Com uma etapa só não há passagem para medir. E sem ninguém na boca do
  // funil, toda linha sairia "0 de 0" — uma tabela inteira de zeros que ocupa
  // a tela dizendo o que o relatório já disse: não houve negócio no período.
  if (etapas.length < 2 || (etapas[0]?.value ?? 0) === 0) return undefined;

  const rows = etapas.slice(1).map((para, i) => {
    const de = etapas[i];
    return {
      passagem: `${de.label} → ${para.label}`,
      chegaram: de.value,
      seguiram: para.value,
      // Etapa de origem vazia não tem conversão: dividir por zero daria
      // infinito, e "ninguém passou por aqui" já está dito na coluna ao lado.
      // Quatro casas porque a coluna imprime duas — arredondar antes evita que
      // o ruído de ponto flutuante apareça como 45,00000000000001%.
      conversao: de.value === 0 ? 0 : Math.round((para.value / de.value) * 10_000) / 10_000,
    };
  });

  return {
    title: "Conversão etapa a etapa",
    description:
      "De quem chegou a cada etapa, quantos seguiram para a seguinte. A menor porcentagem da coluna é o gargalo — é ali que o funil aperta. Vale a mesma ressalva da figura: negócio perdido conta só na primeira etapa, porque o Kommo guarda apenas a etapa atual.",
    columns: [
      { key: "passagem", label: "Passagem", align: "left" },
      { key: "chegaram", label: "Chegaram", format: "integer", align: "right" },
      { key: "seguiram", label: "Seguiram", format: "integer", align: "right" },
      { key: "conversao", label: "Conversão", format: "percent", align: "right" },
    ],
    rows,
  };
}
