import "server-only";

import { avisoOperacao } from "@/lib/avisos";
import { eachDay } from "@/lib/date-range";
import { conversaoPorEtapa } from "@/lib/funil";
import type {
  ChannelReport,
  DateRange,
  EtapaDoStatus,
  FunnelBlock,
  FunnelStage,
  Notice,
  SeriesPoint,
  StatusDeVendas,
  TableBlock,
} from "@/lib/types";
import { mockStatusDeVendas, mockVendas } from "@/mocks/reports";
import { getCredentials, getEnv, isForceMock } from "@/server/env";
import { montarPlacar } from "@/server/fila/placar";
import { descreverFalha, httpJson } from "@/server/lib/http";

/**
 * Vendas, pelo Kommo.
 *
 * É a peça que fecha o ciclo: os outros conectores param no lead, e este diz
 * quanto daquilo virou dinheiro. Sem ele, "custo por lead" é o fim da linha e
 * ninguém sabe se o lead barato era lead bom.
 *
 * O Kommo herdou do amoCRM dois identificadores de etapa fixos, iguais em toda
 * conta: **142 é venda ganha e 143 é venda perdida**. Os demais `status_id`
 * são as etapas que a própria clínica criou, e variam por funil — por isso os
 * nomes vêm da API em vez de ficarem escritos aqui.
 */

export const GANHO = 142;
const PERDIDO = 143;

/** Teto da API por página. Acima disso ela ignora o valor e devolve 250. */
const POR_PAGINA = 250;

/** Trava de segurança: 20 páginas são 5.000 negócios num período. */
const MAX_PAGINAS = 20;

/**
 * Ids de contato por consulta. Cem cabem numa URL de uns 2 KB — o dobro disso
 * começa a esbarrar no limite de tamanho de URL dos servidores no caminho.
 */
const CONTATOS_POR_LOTE = 100;

/** Trava de segurança: 30 lotes são 3.000 contatos numa leitura. */
const MAX_LOTES_DE_CONTATO = 30;

/**
 * Como a cidade pode estar escrita no cadastro do contato.
 *
 * Campo criado à mão não tem `field_code`, e o nome é escolha de quem montou a
 * conta. A conta da clínica usa "Cidade"; as demais grafias estão aqui para o
 * dia em que alguém renomear ou uma segunda conta entrar no painel.
 */
const NOMES_DE_CIDADE = ["cidade", "city", "município", "municipio", "localidade"];

/** A linha que mede o buraco do cadastro, e não um lugar. */
const SEM_CIDADE = "Sem cidade registrada";

/**
 * O que a coluna Estado mostra quando não há UF a mostrar.
 *
 * Texto vazio deixaria a célula em branco, e no cartão do celular — onde o
 * rótulo "Estado" aparece por cima do valor — isso lê como defeito de
 * renderização. O travessão é o que o resto do painel usa para valor ausente.
 */
const SEM_ESTADO = "—";

/**
 * As 27 unidades da federação.
 *
 * Tag não é campo: quem opera o CRM marca ali o que quiser — nome de campanha,
 * "urgente", um lembrete para depois. Sem a lista fechada, qualquer etiqueta
 * viraria uma linha de estado num ranking de localização.
 */
const UFS = new Set([
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
]);

/**
 * O prefixo que transforma uma tag em cidade.
 *
 * Tag é campo livre: sem exigir a marcação, `urgente` ou um nome de campanha
 * viraria uma linha no ranking de localização. O prefixo é o combinado com quem
 * opera o CRM, e é o que separa marcação de lugar de marcação de qualquer outra
 * coisa.
 */
const PREFIXO_DE_CIDADE = /^\s*cidade\s*:\s*/i;

/**
 * A cidade marcada como tag do negócio, quando houver.
 *
 * Complementa o cadastro do contato, que é a fonte principal — na primeira
 * leitura real, um terço dos negócios chegou sem o campo preenchido, e essa
 * marcação manual é o que fecha o buraco.
 */
function cidadeDaTag(lead: LeadDoKommo): string | null {
  for (const tag of lead._embedded?.tags ?? []) {
    const nome = tag.name ?? "";
    if (!PREFIXO_DE_CIDADE.test(nome)) continue;

    const cidade = nome.replace(PREFIXO_DE_CIDADE, "").trim();
    // `cidade:` sem nada depois é marcação pela metade, não uma cidade nova.
    if (cidade) return cidade;
  }
  return null;
}

/**
 * A UF marcada no negócio, quando houver.
 *
 * Vem embutida no próprio negócio — diferente da cidade, que obriga passar por
 * `/contacts`. Um negócio com várias tags entrega a primeira que é sigla de
 * estado; as demais não são assunto desta tabela.
 */
function estadoDoLead(lead: LeadDoKommo): string | null {
  for (const tag of lead._embedded?.tags ?? []) {
    const nome = (tag.name ?? "").trim().toUpperCase();
    if (UFS.has(nome)) return nome;
  }
  return null;
}

/**
 * O estado de uma cidade, pela sigla mais frequente entre os negócios dela.
 *
 * Uma cidade pertence a um estado só. Agrupar pelo par cidade-e-tag partiria a
 * linha de São Paulo em duas no dia em que alguém esquecesse de taguear um
 * lead — e o ranking, que é o que se pediu, deixaria de ranquear. A maioria
 * também absorve o engano de quem marcar a UF errada num negócio isolado.
 */
function estadoDominante(estados: Map<string, number>): string {
  return (
    [...estados.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    SEM_ESTADO
  );
}

/**
 * Qualquer registro do Kommo que carregue campo personalizado.
 *
 * Negócio e contato guardam os campos na mesma forma, e parte do que o painel
 * precisa mora de cada lado — a UTM no negócio, a cidade no contato. Sem o tipo
 * compartilhado, `campo()` só saberia ler metade da conta.
 */
export interface ComCamposPersonalizados {
  custom_fields_values?: Array<{
    field_name?: string;
    field_code?: string;
    values?: Array<{ value?: string | number | boolean }>;
  }> | null;
}

interface LeadDoKommo extends ComCamposPersonalizados {
  id: number;
  name?: string;
  price?: number;
  status_id?: number;
  pipeline_id?: number;
  /** Unix em segundos, não milissegundos. */
  created_at?: number;
  closed_at?: number;
  responsible_user_id?: number;
  /**
   * O motivo de perda nativo do Kommo, quando pedido com `with=loss_reason`.
   *
   * A documentação mostra ora um objeto, ora uma lista de um item — e as duas
   * formas aparecem em contas reais. Aceitar as duas custa uma linha; supor a
   * errada faz a tabela de perdas nascer vazia sem erro nenhum.
   *
   * Os contatos vêm com `with=contacts`, e **só como id**: campo personalizado
   * de contato exige uma segunda consulta a `/contacts`.
   */
  _embedded?: {
    loss_reason?: { name?: string } | Array<{ name?: string }> | null;
    contacts?: Array<{ id: number; is_main?: boolean }> | null;
    /** As tags do negócio: onde o comercial marca a UF e a cidade. */
    tags?: Array<{ id?: number; name?: string }> | null;
  } | null;
}

interface ContatoDoKommo extends ComCamposPersonalizados {
  id: number;
}

interface RespostaDeLeads {
  _embedded?: { leads?: LeadDoKommo[] };
  _links?: { next?: { href?: string } };
}

interface RespostaDeContatos {
  _embedded?: { contacts?: ContatoDoKommo[] };
}

interface RespostaDeFunis {
  _embedded?: {
    pipelines?: Array<{
      id: number;
      name?: string;
      _embedded?: { statuses?: Array<{ id: number; name?: string; sort?: number }> };
    }>;
  };
}

export function baseDaApi(): string {
  return `https://${getEnv().KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
}

export function autorizacao(): Record<string, string> {
  return {
    authorization: `Bearer ${getEnv().KOMMO_ACCESS_TOKEN}`,
    accept: "application/json",
  };
}

/** Unix em segundos → `YYYY-MM-DD`. */
function paraDia(unix: number | undefined): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

/**
 * O valor de um campo personalizado, pelo código ou pelo nome.
 *
 * O Kommo devolve `field_code` só nos campos que ele mesmo criou; os que a
 * clínica criou à mão têm apenas `field_name`. Procurar pelos dois é o que faz
 * a UTM aparecer independentemente de como o campo entrou na conta.
 */
export function campo(registro: ComCamposPersonalizados, nomes: string[]): string | null {
  const procurados = nomes.map((n) => n.toLowerCase());
  for (const item of registro.custom_fields_values ?? []) {
    const identificadores = [item.field_code, item.field_name]
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.toLowerCase());
    if (!identificadores.some((id) => procurados.includes(id))) continue;

    const valor = item.values?.[0]?.value;
    if (valor === undefined || valor === null || valor === "") continue;
    return String(valor);
  }
  return null;
}

/**
 * Uma página por vez, seguindo `_links.next`.
 *
 * O Kommo responde **204 sem corpo** quando não há nada na página — que o
 * `httpJson` entrega como objeto vazio, e o laço encerra sozinho.
 */
function inicioDoDia(dia: string): number {
  return Date.parse(`${dia}T00:00:00Z`) / 1000;
}

function fimDoDia(dia: string): number {
  return Date.parse(`${dia}T23:59:59Z`) / 1000;
}

/**
 * Negócios de uma janela, filtrados por criação ou por fechamento.
 *
 * As duas perguntas do relatório precisam de conjuntos diferentes: "quantos
 * negócios entraram" olha a criação, "quanto vendemos" olha o fechamento. Um
 * negócio criado em julho e fechado em agosto pertence ao agosto do segundo, e
 * ao julho do primeiro.
 */
async function buscarLeads(range: DateRange, campoDeData: "created_at" | "closed_at") {
  const url = new URL(`${baseDaApi()}/leads`);
  url.searchParams.set(`filter[${campoDeData}][from]`, String(inicioDoDia(range.from)));
  url.searchParams.set(`filter[${campoDeData}][to]`, String(fimDoDia(range.to)));
  const funil = getEnv().KOMMO_PIPELINE_ID;
  // Sem funil configurado, conta a conta inteira. Com ele, só o funil de
  // vendas — `142` é etapa de ganho em **todo** funil, e um pipeline de
  // suporte com etapa de ganho entraria no faturamento sem ninguém notar.
  if (funil) url.searchParams.set("filter[pipeline_id]", funil);
  // Sem `with`, o motivo de perda não vem — e a tabela de perdas nasce vazia
  // sem nenhum sinal de que faltou pedir. `contacts` traz os ids que ligam o
  // negócio ao cadastro onde a cidade mora.
  url.searchParams.set("with", "loss_reason,contacts");
  url.searchParams.set("limit", String(POR_PAGINA));

  const todos: LeadDoKommo[] = [];
  let proxima: string | null = url.toString();

  for (let pagina = 0; pagina < MAX_PAGINAS && proxima; pagina++) {
    const resposta: RespostaDeLeads = await httpJson<RespostaDeLeads>(proxima, {
      headers: autorizacao(),
    });
    const leads = resposta._embedded?.leads ?? [];
    todos.push(...leads);
    proxima = leads.length === POR_PAGINA ? (resposta._links?.next?.href ?? null) : null;
  }

  // Confere a janela de novo em memória. Filtro que a API não reconheça é
  // ignorado em silêncio, e "ignorado em silêncio" num relatório de vendas
  // significa somar negócio de outro período sem ninguém perceber.
  const de = inicioDoDia(range.from);
  const ate = fimDoDia(range.to);
  return todos.filter((lead) => {
    const quando = lead[campoDeData];
    return typeof quando === "number" && quando >= de && quando <= ate;
  });
}

/**
 * Quantos negócios estão na área de "leads de entrada".
 *
 * O Kommo trata o que ainda não foi organizado como uma coisa à parte: esses
 * registros **não aparecem em `/leads`**, e sem contá-los o funil começa
 * mentindo — some justamente o topo, que é por onde tudo entra.
 *
 * Aqui só o número interessa. O formato desses registros difere do de um
 * negócio comum, e adivinhar a forma para extrair valor renderia um total
 * inventado.
 */
async function contarLeadsDeEntrada(range: DateRange): Promise<number> {
  try {
    const resposta = await httpJson<{ _embedded?: { unsorted?: Array<{ created_at?: number }> } }>(
      `${baseDaApi()}/leads/unsorted?limit=${POR_PAGINA}`,
      { headers: autorizacao() },
    );

    // Recortado pelo período, como todas as outras linhas da tabela. Sem isso
    // a fila inteira entrava numa tabela que promete "os negócios do período",
    // e o total não fechava com nada.
    const de = inicioDoDia(range.from);
    const ate = fimDoDia(range.to);
    return (resposta._embedded?.unsorted ?? []).filter(
      (item) =>
        typeof item.created_at === "number" && item.created_at >= de && item.created_at <= ate,
    ).length;
  } catch {
    // A área pode estar vazia (204) ou o escopo não cobrir: some da tabela.
    return 0;
  }
}

/**
 * A cidade de cada contato, por id.
 *
 * `/leads` devolve apenas o **id** do contato, mesmo com `with=contacts`: campo
 * personalizado de contato só vem por `/contacts`. Os ids vão filtrados em lote
 * porque um a um seriam 250 requisições por página de negócios, numa API que
 * aceita cerca de sete por segundo.
 *
 * Devolve `null` quando a consulta falha — e não um mapa vazio. Mapa vazio é
 * indistinguível de "ninguém preencheu cidade", e faria a tela acusar o
 * cadastro por um erro de rede.
 */
async function buscarCidades(leads: LeadDoKommo[]): Promise<Map<number, string> | null> {
  const ids = [
    ...new Set(
      leads.flatMap((lead) =>
        (lead._embedded?.contacts ?? [])
          .map((contato) => contato.id)
          .filter((id): id is number => typeof id === "number"),
      ),
    ),
  ];

  const cidades = new Map<number, string>();
  if (ids.length === 0) return cidades;

  const teto = Math.min(ids.length, CONTATOS_POR_LOTE * MAX_LOTES_DE_CONTATO);

  try {
    // Em série, de propósito: disparar os lotes juntos estoura o limite de
    // requisições do Kommo e volta 429 para todos eles de uma vez.
    for (let inicio = 0; inicio < teto; inicio += CONTATOS_POR_LOTE) {
      const url = new URL(`${baseDaApi()}/contacts`);
      for (const id of ids.slice(inicio, inicio + CONTATOS_POR_LOTE)) {
        url.searchParams.append("filter[id][]", String(id));
      }
      url.searchParams.set("limit", String(POR_PAGINA));

      const resposta = await httpJson<RespostaDeContatos>(url.toString(), {
        headers: autorizacao(),
      });

      for (const contato of resposta._embedded?.contacts ?? []) {
        const cidade = campo(contato, NOMES_DE_CIDADE)?.trim();
        if (cidade) cidades.set(contato.id, cidade);
      }
    }
  } catch {
    return null;
  }

  return cidades;
}

interface EtapaDoFunil {
  id: number;
  nome: string;
}

/**
 * As etapas do funil, **na ordem do funil e todas elas**.
 *
 * Não é só para trocar número por nome. É o esqueleto da tabela: sem ele, só
 * apareciam as etapas que tinham negócio no período, e etapa vazia sumia da
 * tela. Só que "ninguém chega em Negociação" é exatamente o que um funil
 * precisa mostrar — some a etapa, some o gargalo.
 *
 * A ordem vem do `sort` do Kommo, a mesma das colunas lá. Ordenar por volume
 * transformaria o funil numa lista de campeões, que não é o que ele é.
 */
async function buscarEtapas(): Promise<EtapaDoFunil[]> {
  try {
    const resposta = await httpJson<RespostaDeFunis>(`${baseDaApi()}/leads/pipelines`, {
      headers: autorizacao(),
    });

    const escolhido = getEnv().KOMMO_PIPELINE_ID;
    const funis = (resposta._embedded?.pipelines ?? []).filter(
      (funil) => !escolhido || String(funil.id) === escolhido,
    );

    return funis
      .flatMap((funil) => funil._embedded?.statuses ?? [])
      .filter((etapa) => Boolean(etapa.name))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map((etapa) => ({ id: etapa.id, nome: etapa.name as string }));
  } catch {
    // Sem o esqueleto o funil ainda soma o que veio, só perde as etapas vazias.
    return [];
  }
}

function montarFunil(leads: LeadDoKommo[], etapas: EtapaDoFunil[], deEntrada: number): TableBlock {
  const porEtapa = new Map<number, { negocios: number; valor: number }>();
  for (const lead of leads) {
    const id = lead.status_id ?? 0;
    const atual = porEtapa.get(id) ?? { negocios: 0, valor: 0 };
    atual.negocios += 1;
    atual.valor += lead.price ?? 0;
    porEtapa.set(id, atual);
  }

  const linha = (etapa: string, id: number) => {
    const dados = porEtapa.get(id) ?? { negocios: 0, valor: 0 };
    return { etapa, negocios: dados.negocios, valor: Math.round(dados.valor * 100) / 100 };
  };

  // A fila de entrada abre a tabela: é a porta, não uma etapa do funil.
  const rows =
    deEntrada > 0
      ? [{ etapa: "Leads de entrada (a organizar)", negocios: deEntrada, valor: 0 }]
      : [];

  // Todas as etapas, na ordem do funil, inclusive as zeradas.
  for (const etapa of etapas) rows.push(linha(etapa.nome, etapa.id));

  // O que apareceu nos negócios mas não está no esqueleto — outro funil, ou
  // etapa apagada depois de o negócio passar por ela. Vai ao fim em vez de
  // sumir da conta.
  const conhecidas = new Set(etapas.map((e) => e.id));
  for (const [id] of porEtapa) {
    if (conhecidas.has(id)) continue;
    const nome = id === GANHO ? "Venda ganha" : id === PERDIDO ? "Perdido" : `Etapa ${id}`;
    rows.push(linha(nome, id));
  }

  return {
    title: "Negócios por etapa",
    description:
      "Onde os negócios do período estão parados. Na ordem do funil, com as etapas vazias à vista — etapa sem ninguém é o gargalo.",
    columns: [
      { key: "etapa", label: "Etapa", align: "left" },
      { key: "negocios", label: "Negócios", format: "integer", align: "right" },
      { key: "valor", label: "Valor", format: "currency", align: "right" },
    ],
    rows,
  };
}

/**
 * Os nomes que a origem do negócio tem no Kommo.
 *
 * `campo` casa por **igualdade**, não por pedaço: `"origem"` não encontra um
 * campo chamado `Origem do lead`, e o negócio inteiro cai em "Sem UTM" com o
 * campo preenchido e visível na tela do CRM. Cada rótulo que a clínica usa de
 * verdade precisa estar escrito aqui.
 *
 * Por que não casar por pedaço: `"origem"` apareceria dentro de "Cidade de
 * origem" e de qualquer outro campo que mencione a palavra, e a tabela passaria
 * a agrupar por um campo que não é a origem. A lista explícita erra para menos,
 * e errar para menos aqui custa uma linha a acrescentar — errar para mais é
 * número errado na tela, que ninguém percebe.
 *
 * A lista mora aqui, e não solta em cada chamada, porque ela é lida em dois
 * lugares: a tabela e o aviso de "nenhum negócio traz UTM". Quando eram duas
 * cópias, as duas erravam juntas — a tabela mostrava "Sem UTM", o aviso
 * confirmava, e nada indicava que o problema era de leitura, não de
 * preenchimento.
 */
const CAMPOS_DE_ORIGEM = [
  "utm_source",
  "utm source",
  "origem",
  // O rótulo que o formulário da landing page grava na conta da Qyra.
  "origem do lead",
  "origem_do_lead",
];

const CAMPOS_DE_CAMPANHA = ["utm_campaign", "utm campaign", "campanha"];

/**
 * Vendas por origem — o cruzamento que justifica o painel inteiro.
 *
 * Só existe se o Kommo estiver recebendo a origem no negócio. Quando não
 * estiver, a tabela sai vazia em vez de inventar origem, e o aviso diz o que
 * configurar.
 */
function montarOrigens(criados: LeadDoKommo[], ganhos: LeadDoKommo[]): TableBlock {
  const porOrigem = new Map<string, { leads: number; vendas: number; receita: number }>();

  const chaveDaOrigem = (lead: LeadDoKommo): string => {
    const origem = campo(lead, CAMPOS_DE_ORIGEM) ?? "Sem UTM";
    const campanha = campo(lead, CAMPOS_DE_CAMPANHA);
    return campanha ? `${origem} · ${campanha}` : origem;
  };

  const linha = (chave: string) => {
    const atual = porOrigem.get(chave) ?? { leads: 0, vendas: 0, receita: 0 };
    porOrigem.set(chave, atual);
    return atual;
  };

  // Negócios contam por criação, vendas por fechamento — a mesma separação do
  // resto da tela. Por isso a coluna de conversão aqui é aproximada quando o
  // ciclo é longo, e a descrição diz isso.
  for (const lead of criados) linha(chaveDaOrigem(lead)).leads += 1;

  for (const lead of ganhos) {
    const atual = linha(chaveDaOrigem(lead));
    atual.vendas += 1;
    atual.receita += lead.price ?? 0;
  }

  return {
    title: "Vendas por origem",
    description:
      "De onde vieram os negócios, pela UTM registrada no Kommo. Negócios contam por criação e vendas por fechamento, então a conversão é aproximada quando o ciclo passa do período.",
    columns: [
      { key: "origem", label: "Origem", align: "left" },
      { key: "leads", label: "Negócios", format: "integer", align: "right" },
      { key: "vendas", label: "Ganhos", format: "integer", align: "right" },
      { key: "taxa", label: "Conversão", format: "percent", align: "right" },
      { key: "receita", label: "Receita", format: "currency", align: "right" },
    ],
    rows: [...porOrigem.entries()]
      .map(([origem, dados]) => ({
        origem,
        leads: dados.leads,
        vendas: dados.vendas,
        taxa: dados.leads === 0 ? 0 : dados.vendas / dados.leads,
        receita: Math.round(dados.receita * 100) / 100,
      }))
      .sort((a, b) => b.receita - a.receita || b.vendas - a.vendas),
  };
}

/**
 * De onde vêm os leads, pela cidade do contato.
 *
 * Responde a uma pergunta de mídia — onde concentrar verba, e até onde a área
 * de cobertura precisa crescer. Conta **negócios criados** no período, que é a
 * safra de entrada: é o ranking dos leads, não o das vendas fechadas.
 *
 * Daqui saem apenas cidade e contagem. O mesmo cadastro guarda nome, telefone,
 * endereço e dado de saúde do paciente, e nada disso tem o que fazer numa tela
 * de mídia — agregar é o que torna esta tabela publicável.
 */
function montarLocalizacoes(criados: LeadDoKommo[], cidades: Map<number, string>): TableBlock {
  const porCidade = new Map<string, { negocios: number; estados: Map<string, number> }>();

  for (const lead of criados) {
    const contatos = lead._embedded?.contacts ?? [];
    // O contato principal responde pelo negócio; sem marcação, o primeiro da
    // lista. Somar os dois contatos de um mesmo negócio contaria o lead duas
    // vezes, e o total da tabela deixaria de bater com o da tela.
    const principal = contatos.find((contato) => contato.is_main) ?? contatos[0];
    // O cadastro manda: vem do formulário preenchido pelo próprio paciente. A
    // tag é digitada à mão depois, e entra só onde o cadastro está vazio —
    // encolhe a linha de "sem cidade" sem mexer no que já estava certo.
    const cidade =
      (principal ? cidades.get(principal.id) : undefined) ?? cidadeDaTag(lead) ?? SEM_CIDADE;

    const atual = porCidade.get(cidade) ?? { negocios: 0, estados: new Map<string, number>() };
    atual.negocios += 1;
    const estado = estadoDoLead(lead);
    if (estado) atual.estados.set(estado, (atual.estados.get(estado) ?? 0) + 1);
    porCidade.set(cidade, atual);
  }

  const linhas = [...porCidade.entries()].map(([cidade, dados]) => ({
    cidade,
    // "Sem cidade" é um balde de vários lugares: não tem estado próprio.
    estado: cidade === SEM_CIDADE ? SEM_ESTADO : estadoDominante(dados.estados),
    negocios: dados.negocios,
  }));
  const semCidade = linhas.filter((linha) => linha.cidade === SEM_CIDADE);

  return {
    title: "Leads por cidade",
    description:
      "De onde vieram os negócios criados no período, pela cidade registrada no contato — ou pela tag `cidade:` quando o cadastro não traz — e pela UF marcada no negócio. Ordene por Estado para ler por região. As dez primeiras à vista; as demais, a um clique.",
    columns: [
      { key: "cidade", label: "Cidade", align: "left" },
      { key: "estado", label: "Estado", align: "left" },
      { key: "negocios", label: "Negócios", format: "integer", align: "right" },
    ],
    // Dez cidades à vista. A linha de cadastro incompleto não ocupa vaga no
    // ranking — quem pediu o top 10 quer dez lugares, não nove e um buraco.
    initialRows: semCidade.length > 0 ? 11 : 10,
    rows: [
      // Abre a tabela, como a fila de entrada abre o funil: é a medida do que
      // falta preencher, e no fim da lista ninguém veria.
      ...semCidade,
      ...linhas
        .filter((linha) => linha.cidade !== SEM_CIDADE)
        // Desempate por nome para a ordem não variar entre duas leituras iguais.
        .sort((a, b) => b.negocios - a.negocios || a.cidade.localeCompare(b.cidade, "pt-BR")),
    ],
  };
}

/**
 * Motivo da perda, venha ele de onde vier.
 *
 * O Kommo tem um motivo de perda nativo, mas nada obriga a clínica a usá-lo —
 * aqui o time montou a lista como campo do próprio negócio, com as opções
 * escritas por eles. As duas formas convivem numa mesma conta, e ler só uma
 * delas produziria uma tabela vazia sem nenhum erro para investigar.
 *
 * O campo personalizado é procurado por conteúdo do nome, não por nome exato:
 * "Motivo de perda", "Motivos da perda" e "MOTIVO DE PERDA" são a mesma coisa
 * para quem preenche, e exigir a grafia certa quebraria no dia em que alguém
 * renomeasse a etiqueta.
 */
function motivoDaPerda(lead: LeadDoKommo): string | null {
  const nativo = lead._embedded?.loss_reason;
  const primeiro = Array.isArray(nativo) ? nativo[0] : nativo;
  const doKommo = primeiro?.name?.trim();
  if (doKommo) return doKommo;

  for (const item of lead.custom_fields_values ?? []) {
    const nome = (item.field_name ?? "").toLowerCase();
    const codigo = (item.field_code ?? "").toLowerCase();
    const ehMotivo = codigo === "loss_reason" || (nome.includes("motivo") && nome.includes("perd"));
    if (!ehMotivo) continue;

    const valor = item.values?.[0]?.value;
    if (valor === undefined || valor === null || valor === "") continue;
    return String(valor).trim();
  }

  return null;
}

/**
 * Perda que ainda pode virar venda.
 *
 * Decisão do comercial, não do código: preço, tempo e área de cobertura são as
 * três que voltam — o orçamento muda, a agenda abre, a cobertura cresce. As
 * demais ("preferiu concorrente", "não elegível", "não respondeu") entram para
 * o arquivo.
 *
 * A classificação é por conteúdo do texto, e não por uma lista fechada de
 * opções, porque a lista do Kommo é editada por quem opera o CRM. Opção nova
 * cai em "arquivar" — o lado conservador: deixar de fora uma perda recuperável
 * custa uma oportunidade, prometer recuperação de quem não volta custa a
 * confiança na tela.
 */
const RECUPERAVEIS: Array<{ marca: RegExp }> = [
  // "Preço fora do orçamento", "Achou caro sem ver valor"
  { marca: /car[oa]|pre[çc]o|or[çc]amento/i },
  // "Sem tempo no momento", "Vai pensar / precisa de tempo"
  { marca: /tempo|pensar/i },
  // "Fora da Área de Cobertura"
  { marca: /[áa]rea|cobertura/i },
];

function ehRecuperavel(motivo: string): boolean {
  return RECUPERAVEIS.some(({ marca }) => marca.test(motivo));
}

/**
 * Por que os negócios se perderam — e quais dá para retomar.
 *
 * É a outra metade do funil. A tabela de etapas mostra onde as pessoas param;
 * esta mostra por quê pararam, que é o que dá para agir em cima. A coluna de
 * situação existe para separar a fila de retomada do arquivo morto sem
 * depender de quem lê lembrar quais motivos voltam.
 */
function montarPerdas(perdidos: LeadDoKommo[]): TableBlock {
  const porMotivo = new Map<string, { negocios: number; valor: number }>();

  for (const lead of perdidos) {
    const motivo = motivoDaPerda(lead) ?? "Sem motivo registrado";
    const atual = porMotivo.get(motivo) ?? { negocios: 0, valor: 0 };
    atual.negocios += 1;
    atual.valor += lead.price ?? 0;
    porMotivo.set(motivo, atual);
  }

  return {
    title: "Motivos de perda",
    description:
      "Por que os negócios do período não fecharam. Preço, tempo e área de cobertura entram como recuperáveis — são as perdas que voltam quando o orçamento, a agenda ou a cobertura mudam.",
    columns: [
      { key: "motivo", label: "Motivo", align: "left" },
      { key: "situacao", label: "Situação", align: "left" },
      { key: "negocios", label: "Negócios", format: "integer", align: "right" },
      { key: "valor", label: "Valor", format: "currency", align: "right" },
    ],
    rows: [...porMotivo.entries()]
      .map(([motivo, dados]) => ({
        motivo,
        // Texto, e não cor: a situação precisa sobreviver a um print em preto
        // e branco e a quem não distingue as duas cores.
        situacao: ehRecuperavel(motivo) ? "Recuperável" : "Arquivar",
        negocios: dados.negocios,
        valor: Math.round(dados.valor * 100) / 100,
      }))
      .sort((a, b) => b.negocios - a.negocios || b.valor - a.valor),
  };
}

/**
 * O funil em figura: quantos **chegaram** a cada etapa.
 *
 * A tabela ao lado conta ocupação — quantos estão parados em cada etapa agora.
 * Desenhar aquilo como funil seria errado: um negócio em Negociação já passou
 * por Qualificação, e a etapa do meio pareceria um gargalo que não existe. Aqui
 * cada etapa soma quem está nela e quem já foi adiante.
 *
 * **O negócio perdido conta só na boca do funil.** O Kommo guarda apenas a
 * etapa atual, e a etapa atual de um perdido é "perdido" — quem morreu em
 * Negociação não deixa rastro de onde estava. Creditá-lo à última etapa
 * conhecida seria inventar; contá-lo só na entrada subestima o meio do funil, e
 * é o erro que dá para admitir em voz alta. A ressalva vai junto da figura.
 */
function montarFunilVisual(
  leads: LeadDoKommo[],
  etapas: EtapaDoFunil[],
  ganhos: number,
): FunnelBlock | undefined {
  if (etapas.length === 0) return undefined;

  const posicao = new Map(etapas.map((etapa, i) => [etapa.id, i]));

  // Quantos chegaram a cada etapa, e o valor que veio junto.
  const chegaram = etapas.map(() => ({ negocios: 0, valor: 0 }));
  let valorGanho = 0;

  for (const lead of leads) {
    const valor = lead.price ?? 0;
    // Ganho passou por tudo. Perdido, e etapa que não está no funil, contam só
    // na entrada — é o que dá para afirmar sem inventar.
    const ate =
      lead.status_id === GANHO ? etapas.length - 1 : (posicao.get(lead.status_id ?? 0) ?? 0);
    if (lead.status_id === GANHO) valorGanho += valor;

    for (let i = 0; i <= ate; i++) {
      chegaram[i].negocios += 1;
      chegaram[i].valor += valor;
    }
  }

  const stages: FunnelStage[] = etapas.map((etapa, i) => ({
    label: etapa.nome,
    value: chegaram[i].negocios,
    amount: Math.round(chegaram[i].valor * 100) / 100,
  }));

  // O desfecho fecha a figura. Sem ele o funil termina numa etapa de passagem,
  // e a tela de vendas não mostra a venda.
  stages.push({
    label: "Venda ganha",
    value: ganhos,
    amount: Math.round(valorGanho * 100) / 100,
    outcome: "ganho",
  });

  return {
    title: "Do primeiro contato ao pagamento",
    description:
      "Quantos negócios do período chegaram a cada etapa — não quantos estão parados nela. A largura é a contagem; onde a figura aperta é onde o processo trava.",
    caveat:
      "Negócio perdido conta apenas na primeira etapa: o Kommo guarda só a etapa atual do negócio, então não dá para saber em que ponto do funil ele foi perdido. Os motivos estão na tabela de perdas.",
    stages,
  };
}

export async function fetchVendasReport(range: DateRange): Promise<ChannelReport> {
  const forceMock = isForceMock();

  if (forceMock || !getCredentials().vendas) {
    const report = mockVendas(range, new Date().toISOString());
    report.notices = [
      avisoOperacao(
        forceMock
          ? "Modo mock forçado por QYRA_FORCE_MOCK."
          : "Sem credencial do Kommo — exibindo dados de demonstração.",
      ),
    ];
    return report;
  }

  try {
    // Dois conjuntos, duas perguntas. `criados` responde "quantos negócios
    // entraram e onde estão agora"; `fechados` responde "quanto vendemos".
    // Antes o indicador contava criado-e-ganho e o gráfico creditava no dia do
    // fechamento — bases diferentes na mesma tela, e os dois números não
    // batiam.
    const [criados, fechados, etapas, deEntrada] = await Promise.all([
      buscarLeads(range, "created_at"),
      buscarLeads(range, "closed_at"),
      buscarEtapas(),
      contarLeadsDeEntrada(range),
    ]);

    // Depois dos negócios, e não junto deles: os ids dos contatos só existem
    // depois que a primeira consulta volta.
    const cidades = await buscarCidades(criados);

    const leads = criados;
    const ganhos = fechados.filter((l) => l.status_id === GANHO);
    const receita = ganhos.reduce((acc, l) => acc + (l.price ?? 0), 0);
    const emAberto = criados.filter((l) => l.status_id !== GANHO && l.status_id !== PERDIDO);
    // Perdas contam por fechamento, como as vendas: é a mesma pergunta com o
    // sinal trocado — "o que se decidiu neste período".
    const perdidos = fechados.filter((l) => l.status_id === PERDIDO);
    const recuperaveis = perdidos.filter((l) => {
      const motivo = motivoDaPerda(l);
      return motivo !== null && ehRecuperavel(motivo);
    });
    // Cortada entre os criados, não entre os fechados: é a fatia daquela safra
    // que já virou venda. Misturar "fechados no mês" com "criados no mês"
    // produziria uma taxa que pode passar de 100%.
    const ganhosDaSafra = criados.filter((l) => l.status_id === GANHO).length;

    // Ciclo médio só considera quem fechou e tem as duas pontas: sem
    // `closed_at`, incluir o negócio arrastaria a média para baixo.
    const ciclos = ganhos
      .filter((l) => l.closed_at && l.created_at)
      .map((l) => ((l.closed_at as number) - (l.created_at as number)) / 86_400);
    const cicloMedio = ciclos.length === 0 ? 0 : ciclos.reduce((a, b) => a + b, 0) / ciclos.length;

    const porDia = new Map<string, { vendas: number; receita: number; leads: number }>();
    for (const lead of criados) {
      const dia = paraDia(lead.created_at);
      if (!dia) continue;
      const atual = porDia.get(dia) ?? { vendas: 0, receita: 0, leads: 0 };
      atual.leads += 1;
      porDia.set(dia, atual);
    }
    // A venda conta no dia em que fechou — mesma base do indicador acima, para
    // a soma das barras bater com o total.
    for (const lead of ganhos) {
      const dia = paraDia(lead.closed_at);
      if (!dia) continue;
      const atual = porDia.get(dia) ?? { vendas: 0, receita: 0, leads: 0 };
      atual.vendas += 1;
      atual.receita += lead.price ?? 0;
      porDia.set(dia, atual);
    }

    const series: SeriesPoint[] = eachDay(range).map((date) => {
      const dia = porDia.get(date) ?? { vendas: 0, receita: 0, leads: 0 };
      return {
        date,
        vendas: dia.vendas,
        receita: Math.round(dia.receita * 100) / 100,
        leads: dia.leads,
      };
    });

    // O funil sai do literal de retorno porque a tabela de conversão é
    // derivada dele: as duas leituras vêm da mesma contagem, e não de duas
    // contas paralelas que podem discordar.
    const funil = montarFunilVisual(criados, etapas, ganhosDaSafra);
    const conversao = funil ? conversaoPorEtapa(funil) : undefined;

    const semUtm = leads.every((l) => campo(l, CAMPOS_DE_ORIGEM) === null);

    // Negócio ganho sem valor preenchido é o caso mais traiçoeiro deste
    // conector: receita e ticket saem R$ 0,00 sem estar errados, e quem olha
    // lê "não vendemos nada" quando o certo é "ninguém preencheu o valor".
    const semValor = ganhos.length > 0 && receita === 0;

    const avisos: Notice[] = [];
    if (semValor) {
      avisos.push(
        avisoOperacao(
          `${ganhos.length} negócio(s) ganho(s) no período estão sem valor preenchido no Kommo. Receita e ticket médio ficam em zero até o campo de valor ser preenchido ao fechar a venda.`,
        ),
      );
    }
    // Perda sem motivo é perda que não vira aprendizado: o negócio some do
    // funil e ninguém sabe se dava para recuperar.
    const semMotivo = perdidos.filter((l) => motivoDaPerda(l) === null).length;
    if (semMotivo > 0) {
      avisos.push(
        avisoOperacao(
          `${semMotivo} de ${perdidos.length} negócio(s) perdido(s) no período estão sem motivo registrado no Kommo. Sem o motivo não dá para separar a perda que volta da que fica arquivada.`,
        ),
      );
    }
    // Basta uma das duas fontes para a tabela valer a tela: o cadastro do
    // contato ou a tag do negócio.
    const algumaTagDeCidade = criados.some((l) => cidadeDaTag(l) !== null);
    const temLocalizacoes = cidades !== null && (cidades.size > 0 || algumaTagDeCidade);

    // Coluna vazia sem explicação lê como defeito do painel. O aviso diz que a
    // falta é de marcação no CRM, não de leitura.
    if (temLocalizacoes && criados.length > 0 && criados.every((l) => estadoDoLead(l) === null)) {
      avisos.push(
        avisoOperacao(
          "Nenhum negócio do Kommo traz tag de estado (SP, RJ, e assim por diante). A coluna Estado fica vazia até a equipe marcar a UF no negócio.",
        ),
      );
    }
    if (cidades === null) {
      avisos.push(
        avisoOperacao(
          "Não foi possível ler os contatos do Kommo nesta leitura, então a tabela de leads por cidade ficou de fora. O resto do relatório não depende dela.",
        ),
      );
    } else if (cidades.size === 0 && !algumaTagDeCidade && criados.length > 0) {
      avisos.push(
        avisoOperacao(
          "Nenhum negócio do Kommo traz cidade, nem no cadastro do contato nem em tag `cidade:`. Sem isso não dá para ranquear os leads por localização — é preciso o formulário gravar a cidade no contato, ou a equipe marcar `cidade: <nome>` no negócio.",
        ),
      );
    }
    if (semUtm && leads.length > 0) {
      avisos.push(
        avisoOperacao(
          "Nenhum negócio do Kommo traz UTM. Sem isso não dá para ligar venda a campanha — é preciso o formulário ou a automação gravar utm_source e utm_campaign no negócio.",
        ),
      );
    }

    // Quanto do que este relatório mostra chegou até a Meta. Enfeite: `null`
    // sem banco, com a fila vazia, ou se o banco não responder -- em nenhum
    // desses casos a receita da tela pode cair junto.
    const placar = await montarPlacar();

    return {
      channel: "vendas",
      label: "Vendas",
      source: "live",
      range,
      fetchedAt: new Date().toISOString(),
      kpis: [
        { key: "vendas", label: "Vendas ganhas", value: ganhos.length, format: "integer" },
        {
          key: "receita",
          label: "Receita",
          value: Math.round(receita * 100) / 100,
          format: "currency",
          hint: semValor
            ? "Zero porque os negócios ganhos estão sem valor preenchido no Kommo, não porque não houve venda."
            : undefined,
        },
        {
          key: "ticket",
          label: "Ticket médio",
          value: ganhos.length === 0 ? 0 : receita / ganhos.length,
          format: "currency",
          semComparacao: ganhos.length === 0,
        },
        {
          key: "conversao",
          label: "Lead vira venda",
          value: criados.length === 0 ? 0 : ganhosDaSafra / criados.length,
          format: "percent",
          semComparacao: criados.length === 0,
          hint: "Dos negócios criados no período, quantos já viraram venda. Conta a mesma safra dos dois lados, então não se compara com as vendas fechadas acima.",
        },
        {
          key: "ciclo",
          label: "Ciclo de fechamento",
          value: cicloMedio,
          format: "decimal",
          lowerIsBetter: true,
          // Sem fechamento no período não há ciclo. Comparar pintaria de verde
          // um "-100%" que significa "nada fechou".
          semComparacao: ciclos.length === 0,
          hint: "Dias entre a criação do negócio e a etapa de venda ganha, que é quando o pagamento entra. Média dos que fecharam no período.",
        },
        { key: "emAberto", label: "Em aberto", value: emAberto.length, format: "integer" },
        ...(placar ? [placar.kpi] : []),
        {
          key: "recuperaveis",
          label: "Perdas recuperáveis",
          value: recuperaveis.length,
          format: "integer",
          semComparacao: true,
          // Sem comparação de propósito: este número não tem lado bom. Subir
          // pode ser "perdemos mais" ou "perdemos mais gente que volta", e a
          // seta pintaria de verde ou de vermelho uma das duas sem saber qual.
          // É uma fila de trabalho do mês, não um placar.
          hint: "Negócios perdidos por preço, tempo ou área de cobertura — os motivos que voltam quando o orçamento, a agenda ou a cobertura mudam. Estão detalhados na tabela de motivos.",
        },
      ],
      series,
      seriesDefs: [
        { key: "receita", label: "Receita", format: "currency", slot: 5 },
        { key: "vendas", label: "Vendas", format: "integer", slot: 2 },
      ],
      funnel: funil,
      tables: [
        montarFunil(criados, etapas, deEntrada),
        // A figura acima em texto. São perguntas diferentes: a tabela de cima
        // conta quem está parado em cada etapa, esta conta quem passou de uma
        // para a outra — e é a segunda que responde onde o funil aperta.
        ...(conversao ? [conversao] : []),
        montarPerdas(perdidos),
        montarOrigens(criados, ganhos),
        // Fora da lista quando não há cidade nenhuma: uma tabela de uma linha
        // dizendo "Sem cidade registrada" ocupa a tela sem informar nada, e o
        // aviso de operação já diz o que configurar.
        ...(temLocalizacoes ? [montarLocalizacoes(criados, cidades)] : []),
        // Por último: quem abre a tela de Vendas quer ver venda primeiro. O
        // estado do encanamento interessa depois, a quem opera.
        ...(placar ? [placar.tabela] : []),
      ],
      notices: avisos,
    };
  } catch (erro) {
    const report = mockVendas(range, new Date().toISOString());
    report.notices = [
      avisoOperacao(`O Kommo não respondeu. Detalhe técnico: ${descreverFalha(erro)}`),
    ];
    return report;
  }
}

/**
 * Todos os negócios do funil, sem recorte de data.
 *
 * A tela de status pergunta onde a base está **hoje**, e essa pergunta não tem
 * período: um negócio criado em março que segue parado em reabordagem conta
 * igual ao de ontem. Filtrar por data aqui esconderia justamente o que trava.
 */
async function buscarTodosOsLeads(): Promise<LeadDoKommo[]> {
  const url = new URL(`${baseDaApi()}/leads`);
  const funil = getEnv().KOMMO_PIPELINE_ID;
  if (funil) url.searchParams.set("filter[pipeline_id]", funil);
  url.searchParams.set("limit", String(POR_PAGINA));

  const todos: LeadDoKommo[] = [];
  let proxima: string | null = url.toString();

  for (let pagina = 0; pagina < MAX_PAGINAS && proxima; pagina++) {
    const resposta: RespostaDeLeads = await httpJson<RespostaDeLeads>(proxima, {
      headers: autorizacao(),
    });
    const leads = resposta._embedded?.leads ?? [];
    todos.push(...leads);
    proxima = leads.length === POR_PAGINA ? (resposta._links?.next?.href ?? null) : null;
  }

  return todos;
}

/** Meta lida do ambiente. Vazia, ilegível ou negativa vira zero: sem meta. */
function meta(valor: string | undefined): number {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

/**
 * A base de hoje, repartida por etapa e na ordem do funil.
 *
 * Ganho e perdido saem marcados como desfecho onde quer que a conta os tenha
 * batizado: `142` e `143` são fixos em todo Kommo, mas o nome é livre, e
 * confiar no nome faria "Fechado - ganho" virar uma etapa de espera qualquer.
 */
function repartirPorEtapa(leads: LeadDoKommo[], etapas: EtapaDoFunil[]): EtapaDoStatus[] {
  const porEtapa = new Map<number, number>();
  for (const lead of leads) {
    const id = lead.status_id ?? 0;
    porEtapa.set(id, (porEtapa.get(id) ?? 0) + 1);
  }

  const desfecho = (id: number) =>
    id === GANHO ? ("ganho" as const) : id === PERDIDO ? ("perdido" as const) : undefined;

  const linhas: EtapaDoStatus[] = etapas.map((etapa) => ({
    nome: etapa.nome,
    negocios: porEtapa.get(etapa.id) ?? 0,
    ...(desfecho(etapa.id) ? { desfecho: desfecho(etapa.id) } : {}),
  }));

  // Etapa que apareceu nos negócios mas não está no esqueleto: outro funil, ou
  // etapa apagada com negócio dentro. Vai ao fim em vez de sumir da conta — a
  // soma das etapas precisa fechar com o total da base.
  const conhecidas = new Set(etapas.map((e) => e.id));
  for (const [id, negocios] of porEtapa) {
    if (conhecidas.has(id)) continue;
    const nome = id === GANHO ? "Venda ganha" : id === PERDIDO ? "Perdido" : `Etapa ${id}`;
    linhas.push({ nome, negocios, ...(desfecho(id) ? { desfecho: desfecho(id) } : {}) });
  }

  return linhas;
}

/**
 * O status comercial: o ciclo contra a meta, e onde a base está agora.
 *
 * Três consultas, porque são três perguntas com recortes diferentes: quantos
 * entraram no período, o que se decidiu no período, e onde está tudo que
 * existe. A terceira é a que o relatório de canal não sabe responder — ele é
 * inteiro recortado por data.
 */
export async function fetchStatusDeVendas(range: DateRange): Promise<StatusDeVendas> {
  const env = getEnv();
  const metas = { vendas: meta(env.QYRA_META_VENDAS), receita: meta(env.QYRA_META_RECEITA) };

  if (isForceMock() || !getCredentials().vendas) {
    const status = mockStatusDeVendas(range, new Date().toISOString());
    status.metas = metas.vendas > 0 || metas.receita > 0 ? metas : status.metas;
    status.notices = [
      avisoOperacao(
        isForceMock()
          ? "Modo mock forçado por QYRA_FORCE_MOCK."
          : "Sem credencial do Kommo — exibindo dados de demonstração.",
      ),
    ];
    return status;
  }

  const [criados, fechados, base, etapas] = await Promise.all([
    buscarLeads(range, "created_at"),
    buscarLeads(range, "closed_at"),
    buscarTodosOsLeads(),
    buscarEtapas(),
  ]);

  const ganhos = fechados.filter((l) => l.status_id === GANHO);
  const perdidos = fechados.filter((l) => l.status_id === PERDIDO);
  const receita = ganhos.reduce((acc, l) => acc + (l.price ?? 0), 0);

  const avisos: Notice[] = [];
  if (metas.vendas === 0 && metas.receita === 0) {
    avisos.push(
      avisoOperacao(
        "Nenhuma meta configurada: a tela mostra o resultado do ciclo sem o alvo. Preencha QYRA_META_VENDAS e QYRA_META_RECEITA para a barra de meta aparecer.",
      ),
    );
  }
  if (ganhos.length > 0 && receita === 0) {
    avisos.push(
      avisoOperacao(
        `${ganhos.length} negócio(s) ganho(s) no período estão sem valor preenchido no Kommo. A receita fica em zero até o campo de valor ser preenchido ao fechar a venda.`,
      ),
    );
  }

  return {
    range,
    source: "live",
    fetchedAt: new Date().toISOString(),
    gerados: criados.length,
    ganhos: ganhos.length,
    perdidos: perdidos.length,
    receita: Math.round(receita * 100) / 100,
    baseTotal: base.length,
    etapas: repartirPorEtapa(base, etapas),
    metas,
    notices: avisos,
  };
}
