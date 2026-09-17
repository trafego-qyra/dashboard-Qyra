import { NextResponse } from "next/server";

import { type AnuncioDaMeta, auditarUtms } from "@/server/diagnostico/utm-meta";
import { getEnv } from "@/server/env";
import { guard } from "@/server/lib/api";
import { descreverFalha, httpJson, metaAuthHeaders } from "@/server/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Auditoria de UTM dos anúncios da Meta.
 *
 * Responde a uma pergunta que só se responde anúncio por anúncio: quais peças
 * mandam origem junto com o clique e quais não mandam. Sem isso o negócio chega
 * ao Kommo sem procedência, e a tabela "Vendas por origem" acumula tudo em
 * "Sem UTM" — o painel sabe quanto se investiu e quanto se vendeu, mas não liga
 * as duas pontas.
 *
 * Só leitura. Corrigir a URL de um anúncio no ar é mudança na conta do cliente,
 * e o painel não tem — nem deve ter — permissão de escrita para isso.
 */

/**
 * Anúncios pausados entram na conta.
 *
 * Peça pausada volta a rodar, e volta com a configuração que tinha. Auditar só
 * as ativas deixa a dívida escondida até o dia em que alguém reativa a campanha
 * antiga e o rastreamento some sem ninguém entender por quê.
 */
const STATUS = ["ACTIVE", "PAUSED"];

interface RespostaDeAnuncios {
  data?: AnuncioDaMeta[];
  paging?: { next?: string };
}

const CAMPOS = [
  "id",
  "name",
  "effective_status",
  "campaign{name}",
  "adset{name}",
  // `url_tags` é o campo "Parâmetros de URL" do Gerenciador, e `asset_feed_spec`
  // é onde o criativo dinâmico guarda o destino — sem os dois, anúncio
  // configurado certo apareceria como se estivesse sem rastreamento.
  "creative{url_tags,object_story_spec{link_data{link}},asset_feed_spec{link_urls{website_url}}}",
].join(",");

export async function GET(request: Request) {
  const { headers, blocked } = guard(request);
  if (blocked) return blocked;

  const env = getEnv();
  const token = env.META_ACCESS_TOKEN;
  const contaBruta = env.META_AD_ACCOUNT_ID;

  if (!token || !contaBruta) {
    return NextResponse.json(
      {
        conclusao: "Credencial da Meta incompleta — sem ela não há o que auditar.",
        faltando: {
          META_ACCESS_TOKEN: !token,
          META_AD_ACCOUNT_ID: !contaBruta,
        },
      },
      { headers },
    );
  }

  const conta = contaBruta.startsWith("act_") ? contaBruta : `act_${contaBruta}`;
  const url = new URL(`https://graph.facebook.com/${env.META_API_VERSION}/${conta}/ads`);
  url.searchParams.set("fields", CAMPOS);
  url.searchParams.set("effective_status", JSON.stringify(STATUS));
  url.searchParams.set("limit", "200");

  try {
    const anuncios: AnuncioDaMeta[] = [];
    let proxima: string | null = url.toString();

    // Cinco páginas são mil anúncios — teto de segurança, não de negócio.
    for (let pagina = 0; pagina < 5 && proxima; pagina++) {
      const resposta: RespostaDeAnuncios = await httpJson<RespostaDeAnuncios>(proxima, {
        headers: metaAuthHeaders(token),
      });
      anuncios.push(...(resposta.data ?? []));
      proxima = resposta.paging?.next ?? null;
    }

    const auditoria = auditarUtms(anuncios);

    return NextResponse.json(
      {
        conclusao:
          auditoria.total === 0
            ? "Nenhum anúncio ativo ou pausado na conta."
            : auditoria.completos === auditoria.total
              ? `Os ${auditoria.total} anúncios carregam as quatro UTMs.`
              : `${auditoria.total - auditoria.completos} de ${auditoria.total} anúncios estão sem alguma UTM — ${auditoria.semNenhuma} não têm nenhuma.`,
        // Mais de um valor aqui significa que o mesmo canal chega ao GA4 e ao
        // CRM sob nomes diferentes, e o relatório se parte em pedaços que
        // ninguém soma de volta.
        origensEncontradas: auditoria.origens,
        resumo: {
          total: auditoria.total,
          completos: auditoria.completos,
          semNenhumaUtm: auditoria.semNenhuma,
        },
        anuncios: auditoria.linhas,
      },
      { headers },
    );
  } catch (erro) {
    return NextResponse.json(
      { conclusao: `A Meta não respondeu. Detalhe técnico: ${descreverFalha(erro)}` },
      { status: 200, headers },
    );
  }
}
