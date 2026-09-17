import { NextResponse } from "next/server";

import {
  enviarEventosDeCrm,
  type IdentidadeDoLead,
  montarUsuario,
} from "@/server/connectors/meta-capi";
import { getCredentials, getEnv } from "@/server/env";
import { guard } from "@/server/lib/api";
import { descreverFalha } from "@/server/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Diagnóstico da API de Conversões: manda **um** evento de teste e conta o que
 * aconteceu.
 *
 * Existe pela mesma razão que o diagnóstico da Meta: depurar integração de
 * escrita a distância, uma hipótese por vez, é lento. Uma requisição aqui
 * responde se o token é aceito, se o conjunto de dados existe e se a carga
 * está no formato certo — antes de haver qualquer automação ligada.
 *
 * **Só roda com `META_CAPI_TEST_EVENT_CODE` configurado.** Sem o código, o
 * evento entraria no conjunto de produção e viraria um lead falso no relatório
 * do cliente. Uma rota de teste que suja o dado real não é uma rota de teste.
 */

/** Dados propositalmente falsos: nunca podem casar com uma pessoa de verdade. */
const IDENTIDADE_DE_TESTE: IdentidadeDoLead = {
  email: "teste-capi@qyra.com.br",
  telefone: "(11) 90000-0000",
  nome: "Teste",
  sobrenome: "Qyra",
  criadoEmMs: 0,
};

/**
 * O formato do token, sem o token.
 *
 * `Bad signature` (código 190) é a Meta dizendo que o texto recebido não é um
 * token válido — assinatura que não confere, tipicamente por valor truncado ou
 * com caractere trocado na cópia. A mensagem é idêntica para um token colado
 * pela metade e para um token de outra conta, e sem enxergar o formato não há
 * como distinguir os dois senão por tentativa.
 *
 * Mesmo recorte do diagnóstico da Meta em `/api/diagnostico/meta`: tamanho e
 * pontas bastam para reconhecer truncamento, e nenhum valor útil sai daqui.
 */
function formatoDoToken(token: string) {
  return {
    tamanho: token.length,
    comecaCom: token.slice(0, 6),
    terminaCom: token.slice(-6),
    temEspacoEmQualquerLugar: /\s/.test(token),
    temCaractereNaoAscii: /[^\x20-\x7E]/.test(token),
    caracteresInesperados: [...new Set(token.replace(/[A-Za-z0-9]/g, ""))].join(" "),
  };
}

export async function GET(request: Request) {
  const { headers, blocked } = guard(request);
  if (blocked) return blocked;

  const env = getEnv();
  const credenciais = getCredentials();

  if (!credenciais.capi) {
    return NextResponse.json(
      {
        conclusao: "Credencial ausente — nada a testar.",
        falta: [
          env.META_CAPI_DATASET_ID ? null : "META_CAPI_DATASET_ID",
          env.META_CAPI_ACCESS_TOKEN ? null : "META_CAPI_ACCESS_TOKEN",
        ].filter(Boolean),
      },
      { status: 200, headers },
    );
  }

  if (!env.META_CAPI_TEST_EVENT_CODE) {
    return NextResponse.json(
      {
        conclusao:
          "Recusado de propósito: sem META_CAPI_TEST_EVENT_CODE o evento entraria no conjunto de produção e viraria um lead falso no relatório.",
        comoResolver:
          "No Gerenciador de Eventos, abra o conjunto de dados, vá em Eventos de teste e copie o código TESTxxxxx. Cadastre em META_CAPI_TEST_EVENT_CODE e chame esta rota de novo.",
      },
      { status: 200, headers },
    );
  }

  const evento = {
    // Nome inconfundível: se isto aparecer no relatório, o código de teste não
    // estava valendo e há o que investigar.
    eventName: "QyraTesteDeIntegracao",
    eventTime: Math.floor(Date.now() / 1_000),
    eventId: `qyra-teste-${Date.now()}`,
    identidade: IDENTIDADE_DE_TESTE,
  };

  // Quais campos a Meta vai receber. Os valores são hash, mas mostrar só as
  // chaves basta para o diagnóstico e não convida ninguém a copiar hash daqui.
  const campos = Object.keys(montarUsuario(IDENTIDADE_DE_TESTE) ?? {});

  try {
    const resultado = await enviarEventosDeCrm([evento]);

    return NextResponse.json(
      {
        conclusao:
          resultado.recebidos > 0
            ? "Evento aceito. Abra Gerenciador de Eventos → o conjunto de dados → Eventos de teste: ele aparece em segundos."
            : "A Meta respondeu sem erro, mas não confirmou nenhum evento recebido. Confira o código de teste.",
        recebidos: resultado.recebidos,
        eventId: evento.eventId,
        eventName: evento.eventName,
        camposEnviados: campos,
        rastreio: resultado.rastreio,
        configuracao: {
          commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
          versaoApi: env.META_CAPI_API_VERSION,
          conjuntoDeDados: env.META_CAPI_DATASET_ID,
          modoDeTeste: true,
        },
      },
      { headers },
    );
  } catch (erro) {
    return NextResponse.json(
      {
        conclusao: "A Meta recusou a carga.",
        // `descreverFalha` já remove qualquer coisa parecida com credencial: a
        // Graph ecoa a requisição na mensagem de erro.
        detalhe: descreverFalha(erro),
        camposEnviados: campos,
        configuracao: {
          commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
          versaoApi: env.META_CAPI_API_VERSION,
          conjuntoDeDados: env.META_CAPI_DATASET_ID,
          // Só no ramo de erro: quando a carga é aceita, o formato do token
          // não interessa a ninguém e não precisa aparecer na resposta.
          token: formatoDoToken(env.META_CAPI_ACCESS_TOKEN as string),
          codigoDeTeste: {
            tamanho: env.META_CAPI_TEST_EVENT_CODE?.length ?? 0,
            comecaComTest: env.META_CAPI_TEST_EVENT_CODE?.startsWith("TEST") ?? false,
          },
        },
      },
      { status: 200, headers },
    );
  }
}
