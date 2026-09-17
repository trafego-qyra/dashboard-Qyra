import { LockKeyhole, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

import { LightBlock } from "@/components/brand/light-block";
import { QyraLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { senhaConfigurada } from "@/server/auth/sessao";

/**
 * Porta de entrada do painel.
 *
 * O slab escuro é o mesmo da barra lateral — quem chega já reconhece onde
 * está antes de digitar qualquer coisa. Não herda a casca de navegação: aqui
 * não existe canal para visitar, e mostrar a barra convidaria a clicar em algo
 * que o porteiro devolveria para esta mesma tela.
 */

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

const MENSAGENS: Record<string, string> = {
  senha: "Senha incorreta. Confira e tente de novo.",
  espera: "Tentativas demais. Espere alguns minutos antes de tentar outra vez.",
  config: "O painel ainda não tem senha configurada. Avise quem cuida do deploy.",
  origem: "O envio não partiu desta página. Recarregue e tente de novo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; erro?: string }>;
}) {
  const { de = "", erro } = await searchParams;
  const configurada = senhaConfigurada() !== null;
  const mensagem = configurada ? MENSAGENS[erro ?? ""] : MENSAGENS.config;

  return (
    <div id="conteudo" className="flex min-h-dvh items-center justify-center p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-[var(--radius-slab)] bg-plum-800 text-white">
        <LightBlock className="opacity-60" />

        <div className="relative px-7 py-9">
          <QyraLogo className="h-6" />

          <h1 className="mt-7 font-display text-2xl italic leading-tight">Entrar no painel</h1>
          <p className="mt-1.5 text-plum-200 text-sm">
            O desempenho de mídia da QYRA é restrito a quem tem a senha de acesso.
          </p>

          {/* Envio nativo, e não Server Action: é a navegação do POST que faz o
              gerenciador de senha do navegador oferecer guardar a senha — e
              senha compartilhada precisa morar num gerenciador, não num
              post-it. `method="post"` também mantém o formulário funcionando
              se o JavaScript falhar. */}
          <form method="post" action="/api/sessao" className="mt-7 space-y-3">
            <input type="hidden" name="de" value={de} />
            {/* O Chrome só guarda a senha quando há um usuário para associar
                a ela. Aqui a conta é uma só, então o campo é fixo e invisível:
                dá ao gerenciador o par que ele espera sem inventar uma pergunta
                para quem entra. */}
            <input
              type="text"
              name="usuario"
              value="qyra"
              readOnly
              hidden
              autoComplete="username"
            />

            <div className="space-y-1.5">
              <label htmlFor="senha" className="block font-medium text-plum-200 text-xs">
                Senha de acesso
              </label>
              <input
                id="senha"
                name="senha"
                type="password"
                required
                autoComplete="current-password"
                disabled={!configurada}
                // `aria-describedby` só quando há mensagem: apontar para um
                // elemento ausente faz o leitor de tela anunciar nada.
                aria-describedby={mensagem ? "erro-login" : undefined}
                className="h-11 w-full rounded-full border border-white/15 bg-white/10 px-4 text-sm text-white placeholder:text-plum-300 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>

            {mensagem ? (
              <p
                id="erro-login"
                // `alert` para o leitor de tela anunciar sem a pessoa procurar,
                // e ícone junto porque cor sozinha não comunica erro.
                role="alert"
                className="flex items-start gap-2 rounded-2xl bg-white/10 px-3 py-2 text-[13px] text-white"
              >
                <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden="true" />
                {mensagem}
              </p>
            ) : null}

            {/* Branco sobre o slab, e não a variante `brand`: a cor da marca é
                o próprio roxo escuro do fundo, e o botão sumia dentro do
                cartão. */}
            <Button
              type="submit"
              size="lg"
              className="w-full border-transparent bg-white text-plum-800 hover:bg-plum-100"
              disabled={!configurada}
            >
              <LockKeyhole aria-hidden="true" />
              Entrar
            </Button>
          </form>

          <p className="mt-6 border-white/10 border-t pt-4 text-[11px] text-plum-300 leading-relaxed">
            A senha é a mesma para toda a equipe. Ela fica guardada neste navegador por sete dias —
            em computador compartilhado, feche a janela ao terminar.
          </p>
        </div>
      </div>
    </div>
  );
}
