import "server-only";

import {
  autorizacao,
  baseDaApi,
  type ComCamposPersonalizados,
  campo,
} from "@/server/connectors/kommo";
import { httpJson } from "@/server/lib/http";

/**
 * Quanto dos negócios recentes chega com identificador de clique.
 *
 * O placar da tela de Vendas diz quantos eventos a Meta conseguiu casar; este
 * diz **por que**. São perguntas diferentes: o placar mede o resultado, e aqui
 * se mede a causa — se o formulário da landing page está mesmo gravando o
 * `fbc` no negócio.
 *
 * Sem isso, a única forma de saber se a captura funcionou seria abrir negócios
 * um a um no Kommo e procurar o campo.
 */

/** Onde o identificador de clique pode ter sido gravado. */
const CLIQUE = ["fbc", "_fbc", "fbclid", "click id", "clickid"];
const NAVEGADOR = ["fbp", "_fbp"];
const ORIGEM = ["utm_source", "utm source", "origem"];

/** Quantos negócios recentes são olhados. Cabe numa página da API. */
const AMOSTRA = 50;

interface LeadDaAmostra extends ComCamposPersonalizados {
  id: number;
}

export interface Captura {
  /** Quantos negócios foram olhados. Zero quer dizer conta vazia, não falha. */
  amostra: number;
  comClique: number;
  comNavegador: number;
  comUtm: number;
  /** Campos personalizados que existem nos negócios, para conferir a grafia. */
  camposVistos: string[];
}

/**
 * Confere a captura nos negócios mais recentes.
 *
 * Devolve também **os nomes dos campos encontrados**. É o que resolve o erro
 * mais chato desta configuração: o formulário grava num campo chamado
 * `fb_click_id`, o conector procura por `fbc`, e os dois lados parecem certos
 * enquanto nada funciona. Vendo a lista, a diferença aparece na hora.
 */
export async function conferirCaptura(): Promise<Captura> {
  const url = new URL(`${baseDaApi()}/leads`);
  url.searchParams.set("limit", String(AMOSTRA));
  url.searchParams.set("order[created_at]", "desc");

  const resposta = await httpJson<{ _embedded?: { leads?: LeadDaAmostra[] } }>(url.toString(), {
    headers: autorizacao(),
  });
  const leads = resposta._embedded?.leads ?? [];

  const camposVistos = new Set<string>();
  for (const lead of leads) {
    for (const item of lead.custom_fields_values ?? []) {
      const nome = item.field_code ?? item.field_name;
      if (nome) camposVistos.add(nome);
    }
  }

  return {
    amostra: leads.length,
    comClique: leads.filter((l) => campo(l, CLIQUE) !== null).length,
    comNavegador: leads.filter((l) => campo(l, NAVEGADOR) !== null).length,
    comUtm: leads.filter((l) => campo(l, ORIGEM) !== null).length,
    camposVistos: [...camposVistos].sort(),
  };
}
