"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  COOKIE_DA_SESSAO,
  criarToken,
  DURACAO_DA_SESSAO_MS,
  senhaConfere,
} from "@/server/auth/sessao";
import { rateLimit } from "@/server/lib/rate-limit";

/**
 * Entrada no painel.
 *
 * Server Action em vez de rota de API: o Next confere a origem da requisição
 * sozinho, o que fecha a porta para outro site postar o formulário no lugar da
 * pessoa. E funciona sem JavaScript — se o script falhar, a senha ainda entra.
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

export async function entrar(formData: FormData) {
  const senha = String(formData.get("senha") ?? "");
  const destino = destinoSeguro(String(formData.get("de") ?? ""));

  const cabecalhos = await headers();
  const ip =
    cabecalhos.get("x-forwarded-for")?.split(",")[0].trim() ??
    cabecalhos.get("x-real-ip") ??
    "anon";

  // Senha compartilhada é curta por natureza; sem teto de tentativas, um script
  // a percorre inteira em minutos.
  if (!rateLimit(`login:${ip}`, TENTATIVAS, JANELA_MS).ok) {
    redirect(paraLogin(destino, "espera"));
  }

  if (!senhaConfere(senha)) {
    redirect(paraLogin(destino, "senha"));
  }

  const token = await criarToken();
  if (!token) redirect(paraLogin(destino, "config"));

  const jar = await cookies();
  jar.set(COOKIE_DA_SESSAO, token, {
    // Fora do alcance de qualquer script na página: um XSS não leva a sessão junto.
    httpOnly: true,
    // `secure` segue o protocolo real da requisição, não o modo de build: na
    // Vercel é sempre https, e em http — desenvolvimento, ou o build de
    // produção rodando local — um cookie `secure` simplesmente não é enviado
    // de volta, e a pessoa entra num laço de login que não termina.
    secure: emHttps(cabecalhos.get("x-forwarded-proto")),
    // `lax` deixa o link compartilhado funcionar e ainda barra POST de fora.
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(DURACAO_DA_SESSAO_MS / 1000),
  });

  redirect(destino ?? "/");
}

export async function sair() {
  const jar = await cookies();
  jar.delete(COOKIE_DA_SESSAO);
  redirect("/login");
}
