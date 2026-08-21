import { NextResponse } from "next/server";

import { getCredentials, getEnv } from "@/server/env";
import { httpJson, metaAuthHeaders } from "@/server/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Serve a arte de um anúncio pelo próprio domínio.
 *
 * A URL do CDN da Meta não vai para o HTML por dois motivos: ela carrega um
 * token assinado na query, que ficaria visível no código-fonte da página, e a
 * CSP do painel não abre `img-src` para host de terceiro. O caminho aqui é
 * `/criativos/<id>/imagem` — fora de `/api`, onde o `no-store` global impediria
 * o navegador de cachear a arte a cada render.
 */

/** Só dígitos: o ID entra na URL da Graph, e string livre viraria injeção de caminho. */
const ID_VALIDO = /^\d{1,25}$/;

/** Hosts que a Meta usa para servir arte de anúncio. */
const HOSTS_PERMITIDOS = /(^|\.)(fbcdn\.net|facebook\.com)$/;

interface RespostaDoCriativo {
  creative?: {
    thumbnail_url?: string;
    image_url?: string;
    /** Anúncio carrossel: uma arte por cartão, na ordem em que rodam. */
    object_story_spec?: { link_data?: { child_attachments?: Array<{ picture?: string }> } };
  };
}

/** Teto do carrossel na Meta. Serve de sanidade para o índice vindo da query. */
const MAX_CARTOES = 10;

/** `?cartao=2` → 2. Ausente, fora de faixa ou lixo → `null`, e serve a arte única. */
function cartaoPedido(request: Request): number | null {
  const bruto = new URL(request.url).searchParams.get("cartao");
  if (bruto === null) return null;
  const indice = Number(bruto);
  if (!Number.isInteger(indice) || indice < 0 || indice >= MAX_CARTOES) return null;
  return indice;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const cartao = cartaoPedido(request);

  if (!ID_VALIDO.test(id)) {
    return NextResponse.json({ erro: "Identificador inválido." }, { status: 400 });
  }
  if (!getCredentials().metaAds) {
    return NextResponse.json({ erro: "Meta Ads não configurado." }, { status: 404 });
  }

  const env = getEnv();

  try {
    const anuncio = await httpJson<RespostaDoCriativo>(
      `https://graph.facebook.com/${env.META_API_VERSION}/${id}` +
        "?fields=creative.thumbnail_width(600).thumbnail_height(600)" +
        "{thumbnail_url,image_url,object_story_spec{link_data{child_attachments{picture}}}}",
      { headers: metaAuthHeaders(env.META_ACCESS_TOKEN as string) },
    );

    // `image_url` é a arte em tamanho cheio; `thumbnail_url` existe também para
    // vídeo, onde a Meta gera o quadro de capa. Preferir a primeira, cair na
    // segunda.
    const arteUnica = anuncio.creative?.image_url ?? anuncio.creative?.thumbnail_url;
    const cartoes = anuncio.creative?.object_story_spec?.link_data?.child_attachments ?? [];

    // Pedido de cartão que não existe cai na arte do anúncio em vez de 404:
    // um álbum que encolheu entre o relatório e o clique não deve deixar
    // buraco no carrossel.
    const origem = (cartao === null ? undefined : cartoes[cartao]?.picture) ?? arteUnica;
    if (!origem) {
      return NextResponse.json({ erro: "Anúncio sem arte." }, { status: 404 });
    }

    // A URL vem da Graph, não do cliente, mas conferir o host é o que impede
    // que uma resposta inesperada transforme esta rota em proxy de saída.
    const destino = new URL(origem);
    if (destino.protocol !== "https:" || !HOSTS_PERMITIDOS.test(destino.hostname)) {
      return NextResponse.json({ erro: "Origem da arte não reconhecida." }, { status: 502 });
    }

    const arte = await fetch(destino, { signal: AbortSignal.timeout(10_000) });
    if (!arte.ok || !arte.body) {
      return NextResponse.json({ erro: "Arte indisponível." }, { status: 502 });
    }

    const tipo = arte.headers.get("content-type") ?? "";
    if (!tipo.startsWith("image/")) {
      return NextResponse.json({ erro: "Origem não devolveu imagem." }, { status: 502 });
    }

    return new NextResponse(arte.body, {
      headers: {
        "content-type": tipo,
        // `private`: é arte de campanha do cliente, cacheia no navegador de
        // quem tem acesso, nunca em intermediário compartilhado.
        "cache-control": "private, max-age=900",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    // A arte é enfeite do relatório. Falhar aqui devolve 404 e o cartão mostra
    // o estado sem imagem — nunca um erro que suba para a tela.
    return NextResponse.json({ erro: "Não foi possível carregar a arte." }, { status: 404 });
  }
}
