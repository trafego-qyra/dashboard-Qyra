import { cn } from "@/lib/cn";

/**
 * "Light Color Block" do manual (pág. 26): luzes de roxo sobre fundo sólido,
 * para dar leveza a superfícies de marca. Decorativo por definição, então é
 * `aria-hidden` e nunca carrega informação.
 */
export function LightBlock({
  className,
  /** Carimbo do logotipo ao fundo. Só em superfícies largas — abaixo de ~400px
      ele é cortado pela borda e lê como falha de renderização. */
  stamp = false,
}: {
  className?: string;
  stamp?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]",
        className,
      )}
    >
      <div className="qy-light-block absolute inset-0 opacity-70" />
      {stamp ? <div className="qy-stamp absolute inset-0 text-plum-200/20" /> : null}
    </div>
  );
}
