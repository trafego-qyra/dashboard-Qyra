import { ExternalLink, MousePointerClick, TriangleAlert, Undo2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatMetric } from "@/lib/format";
import type { ClarityResumo } from "@/lib/types";

/**
 * Régua de rolagem de uma página.
 *
 * A barra é a leitura de relance — bate o olho e vê que a página é abandonada
 * na primeira dobra. O número ao lado é a conferência.
 */
function Rolagem({
  pagina,
  rolagem,
  sessoes,
}: {
  pagina: string;
  rolagem: number;
  sessoes: number;
}) {
  const pct = Math.min(100, Math.max(0, rolagem * 100));

  // Abaixo de 40% a página não é lida, é abandonada. A cor diz isso antes de
  // o número ser lido — mas nunca sozinha: o valor está sempre ao lado.
  const tom = pct < 40 ? "bg-negative" : pct < 65 ? "bg-warning" : "bg-accent";

  return (
    <li className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 py-2">
      <p className="min-w-0 truncate text-ink text-sm" title={pagina}>
        {pagina}
      </p>
      <p className="text-[11px] text-ink-muted tabular">
        {formatMetric(sessoes, "integer")} sessões
      </p>
      <div className="col-span-2 flex items-center gap-2">
        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
          <div className={cn("h-full rounded-full", tom)} style={{ width: `${pct}%` }} />
        </div>
        <p className="w-12 shrink-0 text-right font-medium text-ink text-xs tabular">
          {formatMetric(rolagem, "percent")}
        </p>
      </div>
    </li>
  );
}

function Atrito({
  icone: Icone,
  rotulo,
  valor,
  explicacao,
}: {
  icone: typeof MousePointerClick;
  rotulo: string;
  valor: number;
  explicacao: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-sunken/40 p-3.5">
      <div className="flex items-center gap-1.5">
        <Icone className="size-3.5 text-ink-muted" aria-hidden="true" />
        <p className="font-medium text-[11px] text-ink-secondary">{rotulo}</p>
      </div>
      <p className="mt-2 font-semibold text-ink text-xl tabular">
        {formatMetric(valor, "integer")}
      </p>
      <p className="mt-1 text-[11px] text-ink-muted leading-snug">{explicacao}</p>
    </div>
  );
}

/**
 * Comportamento na página, pelo Clarity.
 *
 * O GA4 responde quantos vieram e de onde. Esta seção responde o que fizeram
 * depois de chegar — até onde rolaram, onde clicaram no que não era clicável,
 * onde desistiram.
 */
export function ClarityPanel({ resumo }: { resumo: ClarityResumo }) {
  const paginas = resumo.porPagina.slice(0, 8);
  const linkProjeto = resumo.projeto
    ? `https://clarity.microsoft.com/projects/view/${resumo.projeto}`
    : null;

  return (
    <Card className="qy-rise">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Comportamento na página</CardTitle>
            <CardDescription>
              Últimos {resumo.dias} dias — é a janela máxima que o Clarity devolve por API. Não
              acompanha o filtro de datas acima.
            </CardDescription>
          </div>
          {linkProjeto ? (
            <a
              href={`${linkProjeto}/heatmaps`}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong",
                "bg-surface px-3 py-1.5 font-medium text-[11px] text-ink-secondary",
                "transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken hover:text-ink",
              )}
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Mapas de calor
            </a>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-medium text-ink text-sm">Até onde as pessoas rolam</p>
            <p className="text-[11px] text-ink-muted tabular">
              média {formatMetric(resumo.rolagemMedia, "percent")}
            </p>
          </div>
          {paginas.length === 0 ? (
            <p className="mt-2 text-ink-muted text-xs">
              Sem dado de rolagem no período. O Clarity precisa de tráfego recente para medir.
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-line/60">
              {paginas.map((linha) => (
                <Rolagem
                  key={String(linha.pagina)}
                  pagina={String(linha.pagina)}
                  rolagem={Number(linha.rolagem)}
                  sessoes={Number(linha.sessoes)}
                />
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="font-medium text-ink text-sm">Sinais de atrito</p>
          <p className="text-[11px] text-ink-muted">
            Onde a pessoa tentou algo e a página não respondeu.
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Atrito
              icone={MousePointerClick}
              rotulo="Cliques mortos"
              valor={resumo.cliquesMortos}
              explicacao="Clicou em algo que não era clicável."
            />
            <Atrito
              icone={MousePointerClick}
              rotulo="Cliques de raiva"
              valor={resumo.cliquesDeRaiva}
              explicacao="Clicou várias vezes no mesmo ponto, sem resposta."
            />
            <Atrito
              icone={Undo2}
              rotulo="Voltas rápidas"
              valor={resumo.voltasRapidas}
              explicacao="Abriu e voltou na hora — não era o que esperava."
            />
            <Atrito
              icone={TriangleAlert}
              rotulo="Erros de script"
              valor={resumo.errosDeScript}
              explicacao="Algo quebrou no navegador de quem visitou."
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
