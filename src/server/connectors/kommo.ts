import "server-only";

import { avisoOperacao } from "@/lib/avisos";
import { eachDay } from "@/lib/date-range";
import type { ChannelReport, DateRange, Notice, SeriesPoint, TableBlock } from "@/lib/types";
import { mockVendas } from "@/mocks/reports";
import { getCredentials, getEnv, isForceMock } from "@/server/env";
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

const GANHO = 142;
const PERDIDO = 143;

/** Teto da API por página. Acima disso ela ignora o valor e devolve 250. */
const POR_PAGINA = 250;

/** Trava de segurança: 20 páginas são 5.000 negócios num período. */
const MAX_PAGINAS = 20;

interface LeadDoKommo {
  id: number;
  name?: string;
  price?: number;
  status_id?: number;
  pipeline_id?: number;
  /** Unix em segundos, não milissegundos. */
  created_at?: number;
  closed_at?: number;
  responsible_user_id?: number;
  custom_fields_values?: Array<{
    field_name?: string;
    field_code?: string;
    values?: Array<{ value?: string | number | boolean }>;
  }> | null;
}

interface RespostaDeLeads {
  _embedded?: { leads?: LeadDoKommo[] };
  _links?: { next?: { href?: string } };
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

function baseDaApi(): string {
  return `https://${getEnv().KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
}

function autorizacao(): Record<string, string> {
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
function campo(lead: LeadDoKommo, nomes: string[]): string | null {
  const procurados = nomes.map((n) => n.toLowerCase());
  for (const item of lead.custom_fields_values ?? []) {
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
 * Vendas por origem — o cruzamento que justifica o painel inteiro.
 *
 * Só existe se o Kommo estiver recebendo a UTM no negócio. Quando não estiver,
 * a tabela sai vazia em vez de inventar origem, e o aviso diz o que configurar.
 */
function montarOrigens(criados: LeadDoKommo[], ganhos: LeadDoKommo[]): TableBlock {
  const porOrigem = new Map<string, { leads: number; vendas: number; receita: number }>();

  const chaveDaOrigem = (lead: LeadDoKommo): string => {
    const origem = campo(lead, ["utm_source", "utm source", "origem"]) ?? "Sem UTM";
    const campanha = campo(lead, ["utm_campaign", "utm campaign", "campanha"]);
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

    const leads = criados;
    const ganhos = fechados.filter((l) => l.status_id === GANHO);
    const receita = ganhos.reduce((acc, l) => acc + (l.price ?? 0), 0);
    const emAberto = criados.filter((l) => l.status_id !== GANHO && l.status_id !== PERDIDO);
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

    const semUtm = leads.every((l) => campo(l, ["utm_source", "utm source", "origem"]) === null);

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
    if (semUtm && leads.length > 0) {
      avisos.push(
        avisoOperacao(
          "Nenhum negócio do Kommo traz UTM. Sem isso não dá para ligar venda a campanha — é preciso o formulário ou a automação gravar utm_source e utm_campaign no negócio.",
        ),
      );
    }

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
          hint: "Dias entre a criação do negócio e o fechamento, na média dos que fecharam.",
        },
        { key: "emAberto", label: "Em aberto", value: emAberto.length, format: "integer" },
      ],
      series,
      seriesDefs: [
        { key: "receita", label: "Receita", format: "currency", slot: 5 },
        { key: "vendas", label: "Vendas", format: "integer", slot: 2 },
      ],
      tables: [montarFunil(criados, etapas, deEntrada), montarOrigens(criados, ganhos)],
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
