import { NextResponse } from "next/server";

import { getCredentials, getEnv } from "@/server/env";
import { httpJson, metaAuthHeaders } from "@/server/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Serve a arte de uma publicação do Instagram pelo próprio domínio.
 *
 * Mesma razão do proxy de anúncio: a URL do CDN da Meta carrega token assinado
 * na query, expira, e a CSP do painel não abre `img-src` para host de
 * terceiro. Fica fora de `/api` porque o `no-store` global de lá impediria o
 * navegador de cachear a arte a cada render.
 */

/** Só dígitos: o ID entra na URL da Graph, e string livre viraria injeção de caminho. */
const ID_VALIDO = /^\d{1,25}$/;

/** Hosts que a Meta usa para servir mídia do Instagram. */
const HOSTS_PERMITIDOS = /(^|\.)(cdninstagram\.com|fbcdn\.net|instagram\.com)$/;

interface RespostaDaMidia {
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!ID_VALIDO.test(id)) {
    return NextResponse.json({ erro: "Identificador inválido." }, { status: 400 });
  }
  if (!getCredentials().metaOrganic) {
    return NextResponse.json({ erro: "Orgânico não configurado." }, { status: 404 });
  }

  const env = getEnv();

  try {
    const midia = await httpJson<RespostaDaMidia>(
      `https://graph.facebook.com/${env.META_API_VERSION}/${id}` +
        "?fields=media_type,media_url,thumbnail_url",
      { headers: metaAuthHeaders(env.META_ACCESS_TOKEN as string) },
    );

    // Em vídeo, `media_url` é o arquivo de vídeo — pesado e não renderiza em
    // `<img>`. O quadro de capa vem em `thumbnail_url`, e é o que serve aqui.
    const origem =
      midia.media_type === "VIDEO"
        ? (midia.thumbnail_url ?? midia.media_url)
        : (midia.media_url ?? midia.thumbnail_url);

    if (!origem) {
      return NextResponse.json({ erro: "Publicação sem arte." }, { status: 404 });
    }

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
        // `private`: é conteúdo da conta do cliente, cacheia no navegador de
        // quem tem acesso, nunca em intermediário compartilhado.
        "cache-control": "private, max-age=900",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    // A arte é enfeite do relatório: falhar aqui devolve 404 e o cartão mostra
    // o estado sem imagem, nunca um erro que suba para a tela.
    return NextResponse.json({ erro: "Não foi possível carregar a arte." }, { status: 404 });
  }
}
