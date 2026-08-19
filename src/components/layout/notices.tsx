"use client";

import { AlertTriangle, ChevronDown } from "lucide-react";
import { useState } from "react";

import { avisosVisiveis } from "@/lib/avisos";
import { cn } from "@/lib/cn";
import type { Notice } from "@/lib/types";

/**
 * Avisos não-fatais dos conectores.
 *
 * Só entra o que é dirigido a quem lê o relatório. O filtro mora aqui, e não
 * em quem chama, para que um conector novo não consiga vazar encanamento para
 * a tela por esquecimento.
 *
 * Colapsa a partir do segundo item. Com quatro canais parcialmente
 * configurados a pilha ocupava um sexto da tela do celular antes do primeiro
 * número — o aviso passava a atrapalhar exatamente quem precisa da informação.
 * Ícone + texto: o alerta nunca depende só da cor.
 */
export function Notices({ notices }: { notices: Notice[] }) {
  const [aberto, setAberto] = useState(false);

  // Rede de segurança: quem chama já filtra, para o encanamento não ser
  // serializado no HTML. Refiltrar aqui custa nada e fecha o caminho de um
  // conector novo passar a lista crua por esquecimento.
  const doCliente = avisosVisiveis(notices);
  if (doCliente.length === 0) return null;

  const restantes = doCliente.length - 1;
  const visiveis = aberto ? doCliente : doCliente.slice(0, 1);

  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border px-4 py-3",
        "border-[color-mix(in_oklab,var(--qy-warning)_35%,transparent)]",
        "bg-[color-mix(in_oklab,var(--qy-warning)_10%,transparent)]",
      )}
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <ul className="min-w-0 space-y-1.5 text-xs leading-relaxed text-ink-secondary">
          {visiveis.map((notice) => (
            <li key={notice.text}>{notice.text}</li>
          ))}
        </ul>
      </div>

      {restantes > 0 ? (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className={cn(
            "mt-2 ml-7 inline-flex items-center gap-1 rounded text-xs font-medium",
            "text-ink-secondary transition-colors hover:text-ink",
          )}
        >
          {aberto ? "Mostrar menos" : `Mais ${restantes} aviso${restantes > 1 ? "s" : ""}`}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3.5 transition-transform duration-[var(--duration-fast)]",
              aberto && "rotate-180",
            )}
          />
        </button>
      ) : null}
    </div>
  );
}
