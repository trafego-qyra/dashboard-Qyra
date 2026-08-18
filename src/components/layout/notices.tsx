import { AlertTriangle } from "lucide-react";

/**
 * Avisos não-fatais dos conectores (credencial ausente, permissão faltando).
 * Ícone + texto: o alerta nunca depende só da cor.
 */
export function Notices({ notices }: { notices: string[] }) {
  if (notices.length === 0) return null;

  return (
    <div
      role="status"
      className="flex gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--qy-warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--qy-warning)_10%,transparent)] px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <ul className="space-y-1 text-xs leading-relaxed text-ink-secondary">
        {notices.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
    </div>
  );
}
