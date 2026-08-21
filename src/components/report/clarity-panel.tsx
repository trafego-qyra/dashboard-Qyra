import { TriangleAlert } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatTile } from "@/components/ui/stat-tile";
import { formatMetric } from "@/lib/format";
import type { ClarityResumo, Kpi } from "@/lib/types";

/** Abaixo disso a página não é lida — é aberta e abandonada. */
const LIMITE_DE_ABANDONO = 0.4;

/**
 * Régua de rolagem.
 *
 * Profundidade é magnitude, não estado: a barra usa **uma cor só**, e quem
 * varia é o comprimento. Pintar a barra por faixa transformaria uma medida
 * contínua em julgamento de bom/ruim, e cor sozinha não informa.
 *
 * O julgamento existe, mas vem escrito: página abaixo do limite ganha um selo
 * com ícone e texto, que sobrevive a daltonismo, impressão e alto contraste.
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
  const abandonada = rolagem < LIMITE_DE_ABANDONO;

  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-ink text-sm" title={pagina}>
          {pagina}
        </p>
        <p className="shrink-0 text-[11px] text-ink-muted tabular">
          {formatMetric(sessoes, "integer")} sessões
        </p>
      </div>

      <div className="mt-1.5 flex items-center gap-2.5">
        <div
          className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken"
          role="img"
          aria-label={`${formatMetric(rolagem, "percent")} da página percorrida`}
        >
          <div
            className="h-full rounded-full bg-[var(--color-series-3)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="w-12 shrink-0 text-right font-medium text-ink text-xs tabular">
          {formatMetric(rolagem, "percent")}
        </p>
      </div>

      {abandonada ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-warning">
          <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
          Abandonada antes da metade
        </p>
      ) : null}
    </li>
  );
}

function indicadores(resumo: ClarityResumo): Kpi[] {
  return [
    {
      key: "rolagem",
      label: "Rolagem média",
      value: resumo.rolagemMedia,
      format: "percent",
      hint: "Quanto da página, em média, as pessoas percorreram antes de sair.",
    },
    { key: "sessoes", label: "Sessões", value: resumo.sessoes, format: "integer" },
    {
      key: "mortos",
      label: "Cliques mortos",
      value: resumo.cliquesMortos,
      format: "integer",
      lowerIsBetter: true,
      hint: "Clicou em algo que não era clicável.",
    },
    {
      key: "raiva",
      label: "Cliques de raiva",
      value: resumo.cliquesDeRaiva,
      format: "integer",
      lowerIsBetter: true,
      hint: "Clicou várias vezes no mesmo ponto, sem resposta.",
    },
    {
      key: "voltas",
      label: "Voltas rápidas",
      value: resumo.voltasRapidas,
      format: "integer",
      lowerIsBetter: true,
      hint: "Abriu e voltou na hora — não era o que esperava.",
    },
    {
      key: "erros",
      label: "Erros de script",
      value: resumo.errosDeScript,
      format: "integer",
      lowerIsBetter: true,
      hint: "Algo quebrou no navegador de quem visitou.",
    },
  ];
}

/**
 * Comportamento na página, pelo Clarity.
 *
 * Segue a composição das telas de canal — indicadores, um visual, uma tabela —
 * porque quem abre esta tela vem das outras e não deveria reaprender a ler.
 */
export function ClarityPanel({ resumo }: { resumo: ClarityResumo }) {
  const [principal, ...resto] = indicadores(resumo);
  const paginas = resumo.porPagina.slice(0, 8);

  return (
    <>
      <section
        aria-label="Indicadores"
        className="grid grid-cols-2 gap-3 qy-stagger [&>*:last-child:nth-child(odd)]:col-span-2 sm:gap-4 lg:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] lg:[&>*:last-child:nth-child(odd)]:col-span-1"
      >
        {principal ? <StatTile kpi={principal} emphasis /> : null}
        {resto.map((kpi) => (
          <StatTile key={kpi.key} kpi={kpi} />
        ))}
      </section>

      <Card className="qy-rise">
        <CardHeader>
          <div>
            <CardTitle>Até onde as pessoas rolam</CardTitle>
            <CardDescription>
              Ordenado por sessões. A barra é a fração da página percorrida — quanto mais curta,
              mais cedo a leitura para.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {paginas.length === 0 ? (
            <p className="text-ink-muted text-xs">
              Sem dado de rolagem no período. O Clarity precisa de tráfego recente para medir.
            </p>
          ) : (
            <ul className="divide-y divide-line/60">
              {paginas.map((linha) => (
                <Rolagem
                  key={linha.pagina}
                  pagina={linha.pagina}
                  rolagem={linha.rolagem}
                  sessoes={linha.sessoes}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="qy-rise">
        <CardHeader>
          <div>
            <CardTitle>Atrito por página</CardTitle>
            <CardDescription>
              Onde a pessoa tentou algo e a página não respondeu. Ordene por qualquer coluna para
              achar a que mais irrita.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-2">
          <DataTable
            block={{
              title: "Atrito por página",
              columns: [
                { key: "pagina", label: "Página", align: "left" },
                { key: "sessoes", label: "Sessões", format: "integer", align: "right" },
                { key: "rolagem", label: "Rolagem", format: "percent", align: "right" },
                {
                  key: "cliquesMortos",
                  label: "Cliques mortos",
                  format: "integer",
                  align: "right",
                },
                {
                  key: "cliquesDeRaiva",
                  label: "Cliques de raiva",
                  format: "integer",
                  align: "right",
                },
              ],
              rows: resumo.porPagina.map((l) => ({ ...l })),
              ...(resumo.projeto
                ? {
                    action: {
                      label: "Mapas de calor no Clarity",
                      href: `https://clarity.microsoft.com/projects/view/${resumo.projeto}/heatmaps`,
                    },
                  }
                : {}),
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
