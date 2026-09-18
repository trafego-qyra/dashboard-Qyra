import type { Captura } from "@/server/kommo/captura";

/**
 * A frase que o diagnóstico do Kommo abre dizendo o que ainda falta.
 *
 * Existia no lugar dela um texto fixo — "escolha a etapa e cadastre o id em
 * `KOMMO_ETAPA_QUALIFICADO`" — que continuava aparecendo **depois** de a etapa
 * estar cadastrada e correta. Quem abrisse a rota para conferir outra coisa
 * saía convencido de que faltava configurar algo que já estava feito.
 *
 * Um diagnóstico que não olha o próprio estado não diagnostica: decora.
 */

/** Um funil do Kommo, com suas etapas, como a rota o entrega. */
export interface FunilDoKommo {
  id: number;
  nome: string;
  etapas: Array<{ id: number; nome: string }>;
}

/** O que a ponte de captura resolveu, quando ela está em uso. */
export interface ResumoDaPonte {
  guardadas: number;
  comClique: number;
}

/** Só o que a conclusão precisa saber do ambiente. */
export interface EstadoConfigurado {
  pipelineId: string | undefined;
  etapaQualificado: string | undefined;
  temSegredoDoWebhook: boolean;
}

/**
 * Descreve a configuração em uma frase, parando no primeiro problema.
 *
 * A ordem é a de dependência, não a de importância: sem funil, a etapa não
 * tem onde ser conferida; sem etapa, o webhook não tem o que anunciar; sem
 * webhook, a captura nunca chega a ser exercitada. Apontar o terceiro degrau
 * quando o primeiro está quebrado manda a pessoa para o lugar errado.
 */
export function montarConclusao(
  estado: EstadoConfigurado,
  funis: FunilDoKommo[],
  captura: Captura | null,
  ponte: ResumoDaPonte | null = null,
): string {
  if (!estado.pipelineId) {
    return "Cadastre KOMMO_PIPELINE_ID com o id do funil de vendas. Sem ele, a etapa 142 de qualquer funil viraria venda — inclusive o arquivamento de um cliente.";
  }

  const funil = funis.find((f) => String(f.id) === estado.pipelineId);
  if (!funil) {
    return `KOMMO_PIPELINE_ID=${estado.pipelineId} não corresponde a nenhum funil desta conta. Corrija com um dos ids listados em funis.`;
  }

  if (!estado.etapaQualificado) {
    return `Escolha a etapa de "${funil.nome}" que representa lead qualificado e cadastre o id dela em KOMMO_ETAPA_QUALIFICADO.`;
  }

  const etapa = funil.etapas.find((e) => String(e.id) === estado.etapaQualificado);
  if (!etapa) {
    return `KOMMO_ETAPA_QUALIFICADO=${estado.etapaQualificado} não existe em "${funil.nome}". Corrija com um dos ids listados nas etapas desse funil.`;
  }

  const base = `Qualificado = "${etapa.nome}" em "${funil.nome}".`;

  if (!estado.temSegredoDoWebhook) {
    return `${base} Falta KOMMO_WEBHOOK_SECRET — sem ele o Kommo não tem por onde avisar as mudanças de etapa.`;
  }

  // Amostra vazia é conta sem negócio recente, não captura quebrada. Dizer que
  // falta `fbc` numa conta sem lead nenhum seria acusar o inocente.
  if (captura && captura.amostra > 0 && captura.comClique === 0) {
    // A ponte resolve o clique pelo `cliente_id`, sem passar pelo campo do
    // negócio — então campo vazio com ponte trabalhando é o esperado, não
    // falha. Dizer o contrário mandaria alguém consertar o que está de pé.
    if (ponte && ponte.comClique > 0) {
      return `${base} O campo não vem preenchido no negócio, mas a ponte de captura já ligou ${ponte.comClique} cliente(s) ao clique — ver docs/ponte-captura.md.`;
    }

    return `${base} Nenhum dos ${captura.amostra} negócios recentes traz identificador de clique: confira em camposVistos se o campo existe com outra grafia, e se a landing page está mesmo gravando o fbc.`;
  }

  return `${base} Configuração completa.`;
}
