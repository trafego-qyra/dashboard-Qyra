import { NextResponse } from "next/server";

import { getCredentials } from "@/server/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Liveness, prontidão das integrações e diagnóstico de configuração.
 *
 * Reporta apenas **presença** de cada variável — nunca o valor, nunca parte
 * dele. O bloco de diagnóstico existe para responder, sem adivinhação, à
 * pergunta que aparece em todo primeiro deploy: "configurei na plataforma, por
 * que o app não vê?".
 */

/** Variáveis que o operador configura. Só os nomes — todos já públicos no .env.example. */
const CONFIGURAVEIS = [
  "META_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "META_IG_USER_ID",
  "META_PAGE_ID",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
  // Opcionais, mas invisíveis se não estiverem aqui: quem cadastra não tem
  // como confirmar que colaram, e ficam fora tanto de "presentes" quanto de
  // "ausentes". Ausência é legítima nas duas — a de login só é necessária
  // quando o acesso é via conta gerente, e a de versão só para fixar o que o
  // conector já descobre sozinho.
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
  "GOOGLE_ADS_API_VERSION",
  "GA4_PROPERTY_ID",
  "QYRA_FORCE_MOCK",
] as const;

/**
 * Sinaliza valor com caractere invisível nas pontas.
 *
 * Colar segredo em painel web carrega quebra de linha com facilidade, e o
 * sintoma que isso produz na origem — `Cannot parse access token` — parece
 * credencial inválida. Reportar aqui transforma meia hora de caça em um olhar.
 * Só o diagnóstico sai; o valor, nunca.
 */
function temEspacoNasPontas(valor: string): boolean {
  return valor !== valor.trim();
}

export async function GET() {
  // Lido no momento da requisição, não na carga do módulo: é a diferença entre
  // ver a configuração real e ver o que existia durante o build.
  const presentes: string[] = [];
  const vazias: string[] = [];
  const ausentes: string[] = [];

  for (const chave of CONFIGURAVEIS) {
    const valor = process.env[chave];

    if (typeof valor !== "string") {
      ausentes.push(chave);
      // "Não existe" e "existe em branco" pedem ações opostas: cadastrar a
      // variável, ou corrigir o valor de uma que já está cadastrada. Colapsar
      // os dois num só "ausente" manda o operador procurar no lugar errado.
    } else if (valor.trim() === "") {
      vazias.push(chave);
    } else {
      presentes.push(chave);
    }
  }

  const malformadas = presentes.filter((chave) => temEspacoNasPontas(process.env[chave] as string));

  return NextResponse.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    integrations: getCredentials(),
    diagnostico: {
      ambiente: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      // Qual implantação respondeu. Sem isso é fácil conferir a configuração em
      // uma implantação e testar outra — produção e preview convivem, e a
      // variável de ambiente fica presa à implantação em que foi criada.
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      implantacao: process.env.VERCEL_URL ?? null,
      variaveisPresentes: presentes,
      // Cadastrada na plataforma, porém sem conteúdo — costuma ser valor que
      // não colou no campo certo.
      variaveisVazias: vazias,
      variaveisAusentes: ausentes,
      // Vazio é o esperado. Nome listado aqui = valor com espaço ou quebra de
      // linha nas pontas, que a aplicação apara na leitura mas convém corrigir
      // na origem.
      variaveisComEspacoNasPontas: malformadas,
    },
  });
}
