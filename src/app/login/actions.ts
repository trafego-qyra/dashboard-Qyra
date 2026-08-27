"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { COOKIE_DA_SESSAO } from "@/server/auth/sessao";

/**
 * Saída do painel.
 *
 * A entrada mora em `/api/sessao`, como formulário nativo, para o gerenciador
 * de senha do navegador reconhecê-la. Sair não precisa disso: é um clique
 * dentro de uma página já autenticada, e Server Action confere a origem
 * sozinha.
 */

export async function sair() {
  const jar = await cookies();
  jar.delete(COOKIE_DA_SESSAO);
  redirect("/login");
}
