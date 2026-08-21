"use client";

import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { formatMetric } from "@/lib/format";
import type { TableBlock } from "@/lib/types";
import { EmptyState } from "./empty-state";

/**
 * Tabela de detalhe. Também é a "table view" exigida pela acessibilidade dos
 * gráficos: todo número plotado existe aqui em texto.
 */
/**
 * Tabela longa empurra o resto da tela para fora da rolagem, e ninguém lê da
 * décima linha em diante sem procurar algo específico. As demais ficam a um
 * clique — nada é descartado.
 */
const LINHAS_VISIVEIS_PADRAO = 10;

/**
 * No celular cada linha vira um cartão de quatro campos, então dez linhas
 * ocupam o que no desktop cabe em uma tabela. Cinco é o que dá para varrer sem
 * perder o resto da página.
 */
const LINHAS_VISIVEIS_MOBILE = 5;

export function DataTable({ block, className }: { block: TableBlock; className?: string }) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const [expandida, setExpandida] = useState(false);
  const idOrdenacao = useId();

  const rows = useMemo(() => {
    if (!sort) return block.rows;
    const { key, desc } = sort;
    return [...block.rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === "number" && typeof bv === "number") return desc ? bv - av : av - bv;
      return desc
        ? String(bv).localeCompare(String(av), "pt-BR")
        : String(av).localeCompare(String(bv), "pt-BR");
    });
  }, [block.rows, sort]);

  // Chave estável calculada fora do JSX: a origem não garante identidade única
  // (duas campanhas podem ter o mesmo nome), então a posição desempata.
  const limite = block.initialRows ?? LINHAS_VISIVEIS_PADRAO;
  const limiteMobile = Math.min(limite, LINHAS_VISIVEIS_MOBILE);
  const temMais = rows.length > limiteMobile;

  const keyed = useMemo(() => {
    // O recorte vem depois da ordenação: "as 10 primeiras" tem que respeitar a
    // coluna escolhida, senão o botão mostraria um top 10 que não é top de nada.
    const visiveis = expandida ? rows : rows.slice(0, limite);
    return visiveis.map((row, index) => ({
      row,
      key: `${String(row[block.columns[0].key])}#${index}`,
    }));
  }, [rows, block.columns, expandida, limite]);

  if (block.rows.length === 0) {
    return (
      <EmptyState
        className={className}
        title="Nenhum registro no período"
        description="Não houve entrega neste intervalo. Amplie o período ou verifique se as campanhas estão ativas na plataforma."
      />
    );
  }

  function toggle(key: string) {
    setSort((current) =>
      current?.key === key ? { key, desc: !current.desc } : { key, desc: true },
    );
  }

  const colunaPrincipal = block.columns[0];
  const demaisColunas = block.columns.slice(1);

  return (
    <div className={className}>
      {/* Atalho para fora do painel. Fica antes da tabela e alinhado à direita,
          longe do fluxo de leitura dos números — quem veio ler o dado não
          esbarra nele, quem quer sair encontra sem procurar. */}
      {block.action ? (
        <div className="flex justify-end pb-2">
          <a
            href={block.action.href}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-line-strong",
              "bg-surface px-3 py-1.5 font-medium text-[11px] text-ink-secondary",
              "transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken hover:text-ink",
            )}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {block.action.label}
          </a>
        </div>
      ) : null}

      {/* No celular não há cabeçalho para clicar, e ordenar é justamente como
          se acha a campanha que mais gastou. Um `select` nativo abre o picker
          do sistema — melhor que qualquer popover custom nesse tamanho de tela. */}
      <div className="flex items-center gap-2 pb-3 md:hidden">
        <label htmlFor={idOrdenacao} className="shrink-0 text-[11px] text-ink-muted">
          Ordenar por
        </label>
        <select
          id={idOrdenacao}
          value={sort?.key ?? ""}
          onChange={(evento) => {
            const key = evento.target.value;
            setSort(key === "" ? null : { key, desc: true });
          }}
          className={cn(
            "min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-3 py-1.5",
            "text-xs text-ink",
          )}
        >
          <option value="">Ordem original</option>
          {block.columns.map((coluna) => (
            <option key={coluna.key} value={coluna.key}>
              {coluna.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!sort}
          onClick={() => sort && toggle(sort.key)}
          aria-label={
            sort?.desc ? "Ordenar do menor para o maior" : "Ordenar do maior para o menor"
          }
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            "border border-line-strong bg-surface text-ink-secondary",
            "transition-colors duration-[var(--duration-fast)] disabled:opacity-40",
          )}
        >
          {sort?.desc === false ? (
            <ArrowUp className="size-3.5" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Abaixo de `md` a tabela vira lista de cartões.
          Tabela de 6 colunas em 390px de largura é ilegível: ou o texto encolhe
          além do aceitável, ou a rolagem horizontal esconde justamente as
          colunas de valor. O cartão empilha rótulo e valor, e é o que torna a
          tela útil no celular — que é onde gestor e cliente abrem o relatório. */}
      <ul aria-label={block.title} className="space-y-2 md:hidden">
        {keyed.map(({ row, key }, indice) => (
          <li
            key={key}
            className={cn(
              "rounded-2xl border border-line bg-surface-sunken/50 p-3.5",
              !expandida && indice >= limiteMobile && "hidden",
            )}
          >
            <p className="text-sm font-semibold text-ink">
              {String(row[colunaPrincipal.key] ?? "—")}
            </p>
            <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
              {demaisColunas.map((coluna) => {
                const valor = row[coluna.key];
                return (
                  <div key={coluna.key} className="min-w-0">
                    <dt className="text-[11px] leading-tight text-ink-muted">{coluna.label}</dt>
                    <dd
                      className={cn(
                        "truncate text-sm text-ink",
                        coluna.format ? "tabular font-medium" : "",
                      )}
                    >
                      {coluna.format && typeof valor === "number"
                        ? formatMetric(valor, coluna.format)
                        : String(valor ?? "—")}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <caption className="sr-only">{block.title}</caption>
          <thead>
            <tr className="border-b border-line">
              {block.columns.map((column) => {
                const isSorted = sort?.key === column.key;
                const align = column.align ?? (column.format ? "right" : "left");
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={isSorted ? (sort.desc ? "descending" : "ascending") : "none"}
                    className={cn(
                      "px-3 py-2.5 text-xs font-medium text-ink-muted",
                      align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(column.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded transition-colors",
                        "hover:text-ink",
                        align === "right" && "flex-row-reverse",
                      )}
                    >
                      {column.label}
                      {isSorted ? (
                        sort.desc ? (
                          <ArrowDown className="size-3" aria-hidden="true" />
                        ) : (
                          <ArrowUp className="size-3" aria-hidden="true" />
                        )
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {keyed.map(({ row, key }) => (
              <tr
                key={key}
                className="border-b border-line/60 transition-colors duration-[var(--duration-fast)] last:border-0 hover:bg-surface-sunken/70"
              >
                {block.columns.map((column) => {
                  const value = row[column.key];
                  const align = column.align ?? (column.format ? "right" : "left");
                  return (
                    <td
                      key={column.key}
                      className={cn(
                        "px-3 py-2.5 text-ink-secondary",
                        align === "right" ? "text-right tabular" : "text-left",
                        column.align === "left" && "max-w-[22rem] truncate text-ink",
                      )}
                      title={typeof value === "string" ? value : undefined}
                    >
                      {column.format && typeof value === "number"
                        ? formatMetric(value, column.format)
                        : String(value ?? "—")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {temMais ? (
        <button
          type="button"
          onClick={() => setExpandida((atual) => !atual)}
          aria-expanded={expandida}
          className={cn(
            "mt-3 w-full rounded-full border border-line-strong bg-surface px-4 py-2",
            "text-xs font-medium text-ink-secondary",
            "transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken hover:text-ink",
            // Entre o corte do celular e o do desktop, só o celular tem o que esconder.
            rows.length <= limite && "md:hidden",
          )}
        >
          <span className="md:hidden">
            {expandida ? `Mostrar apenas ${limiteMobile}` : `Ver todas as ${rows.length}`}
          </span>
          <span className="hidden md:inline">
            {expandida
              ? `Mostrar apenas ${limite}`
              : `Ver todas as ${rows.length} linhas (+${rows.length - limite})`}
          </span>
        </button>
      ) : null}
    </div>
  );
}
