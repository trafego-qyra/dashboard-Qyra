import { NextResponse } from "next/server";

import {
  COOKIE_DA_SESSAO,
  criarToken,
  DURACAO_DA_SESSAO_MS,
  senhaConfere,
} from "@/server/auth/sessao";
import { rateLimit } from "@/server/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Entrada no painel, por envio de formulário de verdade.
 *
 * Era uma Server Action, e funcionava — mas o gerenciador de senha do
 * navegador nunca oferecia guardar a senha. Server Action envia por
 * JavaScript, sem navegação, e é a navegação que o Chrome usa como sinal de
 * "alguém acabou de entrar em algum lugar". Formulário nativo com resposta
 * 303 devolve esse sinal, e a senha passa a caber no gerenciador — que é
 * exatamente onde uma senha compartilhada deve morar.
 *
 * A troca custa a proteção que o Next dava de graça contra formulário postado
 * de outro site. Ela volta aqui, explícita, na conferência de origem.
 */

/** Dez tentativas a cada dez minutos, por IP. */
const TENTATIVAS = 10;
const JANELA_MS = 10 * 60 * 1000;

/**
 * Só caminho interno pode virar destino.
 *
 * Sem esta peneira, `?de=https://outro-site` transformaria o login num
 * redirecionador aberto — o golpe clássico de phishing, em que o link começa
 * no domínio confiável e termina em outro lugar. `//` no início é o mesmo
 * ataque escrito de outro jeito: o navegador lê como endereço absoluto.
 */
function destinoSeguro(bruto: string): string | null {
  if (!bruto.startsWith("/") || bruto.startsWith("//")) return null;
  return bruto;
}

/**
 * O formulário partiu deste mesmo site?
 *
 * É o que a Server Action conferia sozinha. Sem isso, outra página poderia
 * postar senhas aqui em nome de quem estivesse com a aba aberta — e cada
 * tentativa consumiria o teto de um IP que não é o do atacante.
 *
 * Ausência de origem reprova: navegador que envia formulário sempre manda
 * `origin`, e `referer` cobre os poucos casos em que não manda.
 */
function mesmaOrigem(request: Request): boolean {
  const declarada = request.headers.get("origin") ?? request.headers.get("referer");
  if (!declarada) return false;

  const anfitriao = request.headers.get("host");
  if (!anfitriao) return false;

  try {
    return new URL(declarada).host === anfitriao;
  } catch {
    return false;
  }
}

/**
 * A requisição chegou por https?
 *
 * Sem o cabeçalho não dá para saber — aí o modo de build decide, que é o
 * palpite conservador: em produção assume https.
 */
function emHttps(protocolo: string | null): boolean {
  if (!protocolo) return process.env.NODE_ENV === "production";
  return protocolo.split(",")[0].trim() === "https";
}

function paraLogin(destino: string | null, erro?: string): string {
  const query = new URLSearchParams();
  if (destino) query.set("de", destino);
  if (erro) query.set("erro", erro);
  const busca = query.toString();
  return busca ? `/login?${busca}` : "/login";
}

/**
 * Redirecionamento com destino **relativo**.
 *
 * `NextResponse.redirect` exige URL absoluta, e montá-la a partir de
 * `request.url` foi um bug real: pedindo `127.0.0.1`, o destino saía como
 * `localhost` — outra origem, e a CSP `form-action \'self\'` recusava o envio,
 * com o login parado sem explicação. Em produção seria pior: a URL interna do
 * deploy no lugar do domínio do cliente.
 *
 * `Location` relativo não tem esse problema: o navegador resolve contra o
 * endereço que ele mesmo pediu, e o destino é a mesma origem por construção.
 *
 * 303 e não 302: obriga o navegador a trocar o POST por um GET no destino.
 * Sem isso, recarregar a página reenviaria a senha.
 */
function verPara(caminho: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { location: caminho } });
}

export async function POST(request: Request) {
  const formulario = await request.formData();
  const senha = String(formulario.get("senha") ?? "");
  const destino = destinoSeguro(String(formulario.get("de") ?? ""));

  if (!mesmaOrigem(request)) {
    return verPara(paraLogin(destino, "origem"));
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "anon";

  // Senha compartilhada é curta por natureza; sem teto de tentativas, um script
  // a percorre inteira em minutos.
  if (!rateLimit(`login:${ip}`, TENTATIVAS, JANELA_MS).ok) {
    return verPara(paraLogin(destino, "espera"));
  }

  if (!senhaConfere(senha)) {
    return verPara(paraLogin(destino, "senha"));
  }

  const token = await criarToken();
  if (!token) return verPara(paraLogin(destino, "config"));

  const resposta = verPara(destino ?? "/");
  resposta.cookies.set(COOKIE_DA_SESSAO, token, {
    // Fora do alcance de qualquer script na página: um XSS não leva a sessão junto.
    httpOnly: true,
    // `secure` segue o protocolo real da requisição, não o modo de build: em
    // http um cookie `secure` não volta, e o login entraria em laço.
    secure: emHttps(request.headers.get("x-forwarded-proto")),
    // `lax` deixa o link compartilhado funcionar e ainda barra POST de fora.
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(DURACAO_DA_SESSAO_MS / 1000),
  });

  return resposta;
}
