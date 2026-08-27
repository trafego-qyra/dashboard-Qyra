import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { COOKIE_DA_SESSAO, senhaConfigurada, tokenValido } from "@/server/auth/sessao";

/**
 * Porteiro do painel.
 *
 * Roda antes de qualquer rota, então não existe tela — nem endpoint de
 * diagnóstico, nem `/api` — que responda a quem não passou pela senha. Barrar
 * dentro de cada página deixaria a API aberta, e é lá que o dado está mais
 * cru.
 *
 * **Sem senha configurada em produção, tudo fica trancado.** É o oposto do que
 * a maioria dos exemplos faz, e é de propósito: uma variável esquecida no
 * painel da Vercel abriria o faturamento da empresa para a internet sem
 * ninguém perceber. Trancado, o erro se anuncia no primeiro acesso.
 *
 * Em desenvolvimento a ausência libera — do contrário ninguém roda o projeto
 * local sem inventar uma senha antes.
 */

/** Caminhos que precisam responder a quem ainda não entrou. */
function ehPublico(pathname: string): boolean {
  return (
    pathname === "/login" ||
    // Onde o formulário de login posta. Sem isso o porteiro barraria a própria
    // entrada, e o login viraria um laço.
    pathname === "/api/sessao" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/brand/") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/robots.txt"
  );
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (ehPublico(pathname)) return NextResponse.next();

  // Sem senha e fora de produção: projeto local roda como sempre rodou.
  if (!senhaConfigurada() && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  // Sem senha configurada, `/api/health` responde mesmo assim.
  //
  // É a única situação em que o painel tranca tudo, e trancar junto o
  // diagnóstico que explica o porquê deixa quem opera sem saída: a tela de
  // login diz "falta configurar" e não há como descobrir o que falta. Aqui
  // nenhum dado de negócio está acessível — os relatórios seguem barrados —,
  // e a resposta lista apenas nomes de variável, nunca valores. Assim que a
  // senha existir, esta porta se fecha junto com as outras.
  if (!senhaConfigurada() && pathname === "/api/health") {
    return NextResponse.next();
  }

  if (await tokenValido(request.cookies.get(COOKIE_DA_SESSAO)?.value)) {
    return NextResponse.next();
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  // Volta para onde a pessoa queria ir. Só o caminho interno viaja — URL
  // completa aqui viraria redirecionamento aberto para fora do domínio.
  if (pathname !== "/") login.searchParams.set("de", `${pathname}${search}`);

  return NextResponse.redirect(login);
}

export const config = {
  /**
   * Tudo menos os estáticos do Next e os arquivos da marca.
   *
   * O filtro fino está em `ehPublico`; este aqui existe só para o middleware
   * não ser invocado a cada pedaço de JavaScript da página.
   */
  matcher: ["/((?!_next/static|_next/image|brand/|favicon.ico|icon.svg|robots.txt).*)"],
};
