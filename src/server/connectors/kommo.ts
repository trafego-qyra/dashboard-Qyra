import "server-only";

import { avisoOperacao } from "@/lib/avisos";
import { eachDay } from "@/lib/date-range";
import type { ChannelReport, DateRange, Kpi, Notice, SeriesPoint, TableBlock } from "@/lib/types";
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

/** `/events` tem teto próprio: acima de 100 por página ela recusa. */
const EVENTOS_POR_PAGINA = 100;

/** Trava de segurança: 20 páginas são 5.000 negócios num período. */
const MAX_PAGINAS = 20;

/**
 * Papéis do funil que o plano de vendas mede.
 *
 * O Kommo fixa só 142 (ganho) e 143 (perdido); as etapas do meio são criadas
 * por cada conta. Estes três papéis são o que o painel precisa reconhecer para
 * contar qualificação, agendamento e proposta — por nome da etapa, ou pela
 * lista de ids em `KOMMO_ETAPA_*` quando os nomes fogem do padrão.
 */
type PapelEtapa = "qualificado" | "agendamento" | "proposta";

/** Como reconhecer cada papel pelo nome da etapa, quando não há override. */
const PALAVRAS_DE_ETAPA: Array<{ papel: PapelEtapa; regex: RegExp }> = [
  { papel: "agendamento", regex: /agendad|agenda|marcad/i },
  { papel: "proposta", regex: /proposta|or[çc]ament/i },
  { papel: "qualificado", regex: /qualificad/i },
];

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
  /** Preenchido só quando o negócio está em 143 (perdido) com motivo marcado. */
  loss_reason_id?: number;
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

interface EventoDoKommo {
  type?: string;
  entity_id?: number;
  entity_type?: string;
  /** Unix em segundos. */
  created_at?: number;
  /** Id do usuário que gerou o evento. `0` = sistema/automação, não humano. */
  created_by?: number;
}

interface RespostaDeEventos {
  _embedded?: { events?: EventoDoKommo[] };
  _links?: { next?: { href?: string } };
}

interface RespostaDeMotivos {
  _embedded?: { loss_reasons?: Array<{ id: number; name?: string }> };
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
async function buscarLeads(range: DateRange): Promise<LeadDoKommo[]> {
  const url = new URL(`${baseDaApi()}/leads`);
  // Fechamento pode cair fora da janela em que o lead nasceu, então o filtro é
  // por criação e o corte por data de fechamento acontece depois, em memória.
  url.searchParams.set(
    "filter[created_at][from]",
    String(Date.parse(`${range.from}T00:00:00Z`) / 1000),
  );
  url.searchParams.set(
    "filter[created_at][to]",
    String(Date.parse(`${range.to}T23:59:59Z`) / 1000),
  );
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
async function contarLeadsDeEntrada(): Promise<number> {
  try {
    const resposta = await httpJson<{ _embedded?: { unsorted?: unknown[] } }>(
      `${baseDaApi()}/leads/unsorted?limit=${POR_PAGINA}`,
      { headers: autorizacao() },
    );
    return resposta._embedded?.unsorted?.length ?? 0;
  } catch {
    // A área pode estar vazia (204) ou o escopo não cobrir: some da tabela.
    return 0;
  }
}

/** Nome de cada etapa, por id. Sem isso o funil sairia como números. */
async function buscarEtapas(): Promise<Map<number, string>> {
  const nomes = new Map<number, string>();
  try {
    const resposta = await httpJson<RespostaDeFunis>(`${baseDaApi()}/leads/pipelines`, {
      headers: autorizacao(),
    });
    for (const funil of resposta._embedded?.pipelines ?? []) {
      for (const etapa of funil._embedded?.statuses ?? []) {
        if (etapa.name) nomes.set(etapa.id, etapa.name);
      }
    }
  } catch {
    // Enfeite: sem os nomes o funil ainda soma, só fica menos legível.
  }
  return nomes;
}

/** `"32, 45 ,x,50"` → `[32, 45, 50]`. Ignora o que não é número. */
function idsDaLista(bruto: string | undefined): number[] {
  if (!bruto) return [];
  return bruto
    .split(",")
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

/**
 * Qual papel do plano cada `status_id` representa.
 *
 * Override por id em `KOMMO_ETAPA_*` vence; o resto é reconhecido pelo nome da
 * etapa. Uma etapa que não casa com nenhum papel simplesmente não entra — o
 * conector prefere não contar a contar errado.
 */
function classificarEtapas(nomes: Map<number, string>): Map<number, PapelEtapa> {
  const env = getEnv();
  const mapa = new Map<number, PapelEtapa>();

  const overrides: Array<{ papel: PapelEtapa; ids: number[] }> = [
    { papel: "qualificado", ids: idsDaLista(env.KOMMO_ETAPA_QUALIFICADO) },
    { papel: "agendamento", ids: idsDaLista(env.KOMMO_ETAPA_AGENDAMENTO) },
    { papel: "proposta", ids: idsDaLista(env.KOMMO_ETAPA_PROPOSTA) },
  ];
  for (const { papel, ids } of overrides) {
    for (const id of ids) mapa.set(id, papel);
  }

  for (const [id, nome] of nomes) {
    if (mapa.has(id)) continue;
    const achado = PALAVRAS_DE_ETAPA.find((p) => p.regex.test(nome));
    if (achado) mapa.set(id, achado.papel);
  }
  return mapa;
}

/** Quantos negócios estão hoje em cada papel do funil. */
function contarPorPapel(
  leads: LeadDoKommo[],
  papeis: Map<number, PapelEtapa>,
): Record<PapelEtapa, number> {
  const contagem: Record<PapelEtapa, number> = { qualificado: 0, agendamento: 0, proposta: 0 };
  for (const lead of leads) {
    const papel = lead.status_id === undefined ? undefined : papeis.get(lead.status_id);
    if (papel) contagem[papel] += 1;
  }
  return contagem;
}

/**
 * Eventos de mensagem do período, para medir tempo de resposta.
 *
 * Degrada como `contarLeadsDeEntrada`: se o escopo do token não cobrir
 * `/events`, ou a área vier vazia, devolve lista vazia em vez de derrubar o
 * relatório inteiro — o KPI apenas não aparece.
 */
async function buscarEventos(range: DateRange): Promise<EventoDoKommo[]> {
  try {
    const url = new URL(`${baseDaApi()}/events`);
    url.searchParams.set(
      "filter[created_at][from]",
      String(Date.parse(`${range.from}T00:00:00Z`) / 1000),
    );
    url.searchParams.set(
      "filter[created_at][to]",
      String(Date.parse(`${range.to}T23:59:59Z`) / 1000),
    );
    url.searchParams.append("filter[type][]", "incoming_chat_message");
    url.searchParams.append("filter[type][]", "outgoing_chat_message");
    url.searchParams.append("filter[entity][]", "lead");
    url.searchParams.set("limit", String(EVENTOS_POR_PAGINA));

    const todos: EventoDoKommo[] = [];
    let proxima: string | null = url.toString();
    for (let pagina = 0; pagina < MAX_PAGINAS && proxima; pagina++) {
      const resposta: RespostaDeEventos = await httpJson<RespostaDeEventos>(proxima, {
        headers: autorizacao(),
      });
      const eventos = resposta._embedded?.events ?? [];
      todos.push(...eventos);
      proxima =
        eventos.length === EVENTOS_POR_PAGINA ? (resposta._links?.next?.href ?? null) : null;
    }
    return todos;
  } catch {
    return [];
  }
}

/**
 * Mediana do tempo entre a primeira mensagem do lead e a primeira resposta
 * humana, em segundos. `null` quando nenhum lead tem as duas pontas.
 *
 * Mediana, não média: uma conversa esquecida por três dias destrói a média de
 * cinquenta leads e faz o painel mentir sobre o atendimento. Só conta resposta
 * de gente (`created_by > 0`): mensagem automática nasce como saída e, contada,
 * viraria "respondemos em 12 segundos" — ficção.
 */
function medianaPrimeiraResposta(eventos: EventoDoKommo[], leads: LeadDoKommo[]): number | null {
  const criadoEm = new Map<number, number | undefined>();
  for (const lead of leads) criadoEm.set(lead.id, lead.created_at);

  const entrada = new Map<number, number>();
  const saidas = new Map<number, number[]>();
  for (const ev of eventos) {
    if (ev.entity_type !== "lead" || ev.entity_id === undefined || ev.created_at === undefined)
      continue;
    if (!criadoEm.has(ev.entity_id)) continue;
    if (ev.type === "incoming_chat_message") {
      const atual = entrada.get(ev.entity_id);
      entrada.set(
        ev.entity_id,
        atual === undefined ? ev.created_at : Math.min(atual, ev.created_at),
      );
    } else if (ev.type === "outgoing_chat_message" && (ev.created_by ?? 0) > 0) {
      const lista = saidas.get(ev.entity_id) ?? [];
      lista.push(ev.created_at);
      saidas.set(ev.entity_id, lista);
    }
  }

  const duracoes: number[] = [];
  for (const [id, saidasDoLead] of saidas) {
    // Sem mensagem de entrada, a criação do negócio é o t0 de fallback.
    const t0 = entrada.get(id) ?? criadoEm.get(id);
    if (t0 === undefined) continue;
    // A resposta que conta é a primeira DEPOIS da mensagem do lead; uma saída
    // anterior é de outra conversa e produziria duração negativa.
    const primeira = saidasDoLead.filter((s) => s >= t0).sort((a, b) => a - b)[0];
    if (primeira !== undefined) duracoes.push(primeira - t0);
  }

  if (duracoes.length === 0) return null;
  duracoes.sort((a, b) => a - b);
  const meio = Math.floor(duracoes.length / 2);
  return duracoes.length % 2 === 1 ? duracoes[meio] : (duracoes[meio - 1] + duracoes[meio]) / 2;
}

/** Motivo de perda por id. Sem isso a tabela sairia como números. */
async function buscarMotivosDePerda(): Promise<Map<number, string>> {
  const nomes = new Map<number, string>();
  try {
    const resposta = await httpJson<RespostaDeMotivos>(
      `${baseDaApi()}/leads/loss_reasons?limit=${POR_PAGINA}`,
      { headers: autorizacao() },
    );
    for (const motivo of resposta._embedded?.loss_reasons ?? []) {
      if (motivo.name) nomes.set(motivo.id, motivo.name);
    }
  } catch {
    // Escopo pode não cobrir, ou a conta não usa motivos: a tabela cai para
    // "Sem motivo registrado" em vez de sumir.
  }
  return nomes;
}

/**
 * Por que os negócios do período foram perdidos.
 *
 * `null` quando não houve perda no período — uma tabela vazia de motivos lê
 * como erro, não como "ninguém perdeu".
 */
function montarMotivos(leads: LeadDoKommo[], nomes: Map<number, string>): TableBlock | null {
  const perdidos = leads.filter((l) => l.status_id === PERDIDO);
  if (perdidos.length === 0) return null;

  const porMotivo = new Map<string, number>();
  for (const lead of perdidos) {
    const nome =
      lead.loss_reason_id && nomes.get(lead.loss_reason_id)
        ? (nomes.get(lead.loss_reason_id) as string)
        : "Sem motivo registrado";
    porMotivo.set(nome, (porMotivo.get(nome) ?? 0) + 1);
  }

  return {
    title: "Motivos de perda",
    description: "Por que os negócios perdidos no período não avançaram.",
    columns: [
      { key: "motivo", label: "Motivo", align: "left" },
      { key: "negocios", label: "Negócios", format: "integer", align: "right" },
      { key: "fatia", label: "Fatia", format: "percent", align: "right" },
    ],
    rows: [...porMotivo.entries()]
      .map(([motivo, negocios]) => ({
        motivo,
        negocios,
        fatia: negocios / perdidos.length,
      }))
      .sort((a, b) => b.negocios - a.negocios),
  };
}

function montarFunil(
  leads: LeadDoKommo[],
  nomes: Map<number, string>,
  deEntrada: number,
): TableBlock {
  const porEtapa = new Map<number, { negocios: number; valor: number }>();
  for (const lead of leads) {
    const id = lead.status_id ?? 0;
    const atual = porEtapa.get(id) ?? { negocios: 0, valor: 0 };
    atual.negocios += 1;
    atual.valor += lead.price ?? 0;
    porEtapa.set(id, atual);
  }

  return {
    title: "Negócios por etapa",
    description: "Onde os negócios do período estão parados, e quanto há em cada etapa.",
    columns: [
      { key: "etapa", label: "Etapa", align: "left" },
      { key: "negocios", label: "Negócios", format: "integer", align: "right" },
      { key: "valor", label: "Valor", format: "currency", align: "right" },
    ],
    rows: [...porEtapa.entries()]
      .map(([id, dados]) => ({
        etapa:
          nomes.get(id) ??
          (id === GANHO ? "Venda ganha" : id === PERDIDO ? "Perdido" : `Etapa ${id}`),
        negocios: dados.negocios,
        valor: Math.round(dados.valor * 100) / 100,
      }))
      .concat(
        // No topo da lista e fora da ordenação: é a porta de entrada, não uma
        // etapa concorrendo por volume.
        deEntrada > 0
          ? [{ etapa: "Leads de entrada (a organizar)", negocios: deEntrada, valor: 0 }]
          : [],
      )
      .sort((a, b) => b.negocios - a.negocios),
  };
}

/**
 * Vendas por origem — o cruzamento que justifica o painel inteiro.
 *
 * Só existe se o Kommo estiver recebendo a UTM no negócio. Quando não estiver,
 * a tabela sai vazia em vez de inventar origem, e o aviso diz o que configurar.
 */
function montarOrigens(leads: LeadDoKommo[]): TableBlock {
  const porOrigem = new Map<string, { leads: number; vendas: number; receita: number }>();

  for (const lead of leads) {
    const origem =
      campo(lead, ["utm_source", "utm source", "origem"]) ??
      (lead.custom_fields_values ? "Sem UTM" : "Sem UTM");
    const campanha = campo(lead, ["utm_campaign", "utm campaign", "campanha"]);
    const chave = campanha ? `${origem} · ${campanha}` : origem;

    const atual = porOrigem.get(chave) ?? { leads: 0, vendas: 0, receita: 0 };
    atual.leads += 1;
    if (lead.status_id === GANHO) {
      atual.vendas += 1;
      atual.receita += lead.price ?? 0;
    }
    porOrigem.set(chave, atual);
  }

  return {
    title: "Vendas por origem",
    description: "De onde vieram os negócios que fecharam, pela UTM registrada no Kommo.",
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
    const [leads, etapas, deEntrada, eventos, motivos] = await Promise.all([
      buscarLeads(range),
      buscarEtapas(),
      contarLeadsDeEntrada(),
      buscarEventos(range),
      buscarMotivosDePerda(),
    ]);

    const ganhos = leads.filter((l) => l.status_id === GANHO);
    const receita = ganhos.reduce((acc, l) => acc + (l.price ?? 0), 0);
    const emAberto = leads.filter((l) => l.status_id !== GANHO && l.status_id !== PERDIDO);

    // Ciclo médio só considera quem fechou e tem as duas pontas: sem
    // `closed_at`, incluir o negócio arrastaria a média para baixo.
    const ciclos = ganhos
      .filter((l) => l.closed_at && l.created_at)
      .map((l) => ((l.closed_at as number) - (l.created_at as number)) / 86_400);
    const cicloMedio = ciclos.length === 0 ? 0 : ciclos.reduce((a, b) => a + b, 0) / ciclos.length;

    const porDia = new Map<string, { vendas: number; receita: number; leads: number }>();
    for (const lead of leads) {
      const criado = paraDia(lead.created_at);
      if (criado) {
        const atual = porDia.get(criado) ?? { vendas: 0, receita: 0, leads: 0 };
        atual.leads += 1;
        porDia.set(criado, atual);
      }
      // A venda conta no dia em que fechou, não no dia em que o lead nasceu —
      // é a diferença entre "quanto entrou" e "quanto vendemos" no dia.
      if (lead.status_id === GANHO) {
        const fechado = paraDia(lead.closed_at) ?? criado;
        if (!fechado) continue;
        const atual = porDia.get(fechado) ?? { vendas: 0, receita: 0, leads: 0 };
        atual.vendas += 1;
        atual.receita += lead.price ?? 0;
        porDia.set(fechado, atual);
      }
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

    // Etapas do funil que o plano de vendas mede: qualificação, agendamento,
    // proposta. Contagem por etapa atual, o mesmo recorte da tabela "Negócios
    // por etapa" — um negócio conta onde está hoje, não onde já passou.
    const papeisDeEtapa = classificarEtapas(etapas);
    const papeisPresentes = new Set(papeisDeEtapa.values());
    const porPapel = contarPorPapel(leads, papeisDeEtapa);

    // Tempo de primeira resposta humana, mediana. `null` some da tela em vez de
    // virar um zero que ninguém sabe ler.
    const primeiraResposta = medianaPrimeiraResposta(eventos, leads);

    // Só entra na tela quando houve perda no período.
    const tabelaMotivos = montarMotivos(leads, motivos);

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

    // Um papel do plano que nenhuma etapa do funil preenche fica de fora dos
    // indicadores: melhor ausente do que zero silencioso. O aviso diz como
    // religar — renomear a etapa ou apontar o id em KOMMO_ETAPA_*.
    const papeisFaltando = (["qualificado", "agendamento", "proposta"] as PapelEtapa[]).filter(
      (p) => !papeisPresentes.has(p),
    );
    if (papeisFaltando.length > 0 && leads.length > 0) {
      const rotulo: Record<PapelEtapa, string> = {
        qualificado: "qualificação",
        agendamento: "agendamento",
        proposta: "proposta",
      };
      avisos.push(
        avisoOperacao(
          `Não reconheci no funil do Kommo a etapa de ${papeisFaltando
            .map((p) => rotulo[p])
            .join(
              ", ",
            )}. Renomeie a etapa (ex.: "Avaliação agendada") ou aponte o id em KOMMO_ETAPA_${papeisFaltando[0].toUpperCase()} para o indicador aparecer.`,
        ),
      );
    }

    if (primeiraResposta === null && leads.length > 0) {
      avisos.push(
        avisoOperacao(
          "Sem tempo de primeira resposta: nenhum negócio do período tem mensagem de entrada e resposta humana registradas no Kommo. Confirme se o escopo do token cobre eventos e se o atendimento acontece pelo chat do Kommo.",
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
        },
        {
          key: "conversao",
          label: "Lead vira venda",
          value: leads.length === 0 ? 0 : ganhos.length / leads.length,
          format: "percent",
          hint: "Negócios ganhos sobre todos os negócios criados no período.",
        },
        {
          key: "ciclo",
          label: "Ciclo de fechamento",
          value: cicloMedio,
          format: "decimal",
          lowerIsBetter: true,
          hint: "Dias entre a criação do negócio e o fechamento, na média dos que fecharam.",
        },
        { key: "emAberto", label: "Em aberto", value: emAberto.length, format: "integer" },
        ...(papeisPresentes.has("qualificado")
          ? ([
              {
                key: "qualificados",
                label: "Leads qualificados",
                value: porPapel.qualificado,
                format: "integer",
                hint:
                  leads.length > 0
                    ? `${((porPapel.qualificado / leads.length) * 100).toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}% dos negócios criados no período estão na etapa de qualificação.`
                    : undefined,
              },
            ] satisfies Kpi[])
          : []),
        ...(papeisPresentes.has("agendamento")
          ? ([
              {
                key: "agendamentos",
                label: "Agendamentos",
                value: porPapel.agendamento,
                format: "integer",
                hint: "Negócios na etapa de agendamento no fim do período.",
              },
            ] satisfies Kpi[])
          : []),
        ...(papeisPresentes.has("proposta")
          ? ([
              {
                key: "propostas",
                label: "Propostas",
                value: porPapel.proposta,
                format: "integer",
                hint: "Negócios na etapa de proposta no fim do período.",
              },
            ] satisfies Kpi[])
          : []),
        ...(primeiraResposta !== null
          ? ([
              {
                key: "primeiraResposta",
                label: "1ª resposta (mediana)",
                value: primeiraResposta,
                format: "duration",
                lowerIsBetter: true,
                hint: "Tempo entre a primeira mensagem do lead e a primeira resposta de um atendente, na mediana dos negócios com as duas pontas registradas.",
              },
            ] satisfies Kpi[])
          : []),
      ],
      series,
      seriesDefs: [
        { key: "receita", label: "Receita", format: "currency", slot: 5 },
        { key: "vendas", label: "Vendas", format: "integer", slot: 2 },
      ],
      tables: [
        montarFunil(leads, etapas, deEntrada),
        montarOrigens(leads),
        ...(tabelaMotivos ? [tabelaMotivos] : []),
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
