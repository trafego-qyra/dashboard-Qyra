"use client";

import * as Popover from "@radix-ui/react-popover";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Spinner } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatRange, isValidIsoDate, PRESETS, type PresetKey } from "@/lib/date-range";
import type { DateRange } from "@/lib/types";

/**
 * Filtro de período.
 *
 * O estado vive na URL: o intervalo é compartilhável, sobrevive ao refresh e é
 * lido pelo servidor sem hidratação. `useTransition` mantém a tela anterior
 * visível enquanto o novo período carrega, com o botão em estado de progresso —
 * é o que evita o "pisca branco" a cada troca.
 */
export function DateRangePicker({
  range,
  preset,
}: {
  range: DateRange;
  preset: PresetKey | "custom";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState({ from: range.from, to: range.to });

  function apply(params: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setOpen(false);
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const customValid =
    isValidIsoDate(custom.from) && isValidIsoDate(custom.to) && custom.from <= custom.to;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button variant="outline" size="md" className="gap-2" aria-label="Alterar período">
          {pending ? <Spinner /> : <Calendar className="size-4" aria-hidden="true" />}
          <span className="tabular">{formatRange(range)}</span>
          <ChevronDown className="size-3.5 text-ink-muted" aria-hidden="true" />
        </Button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 w-72 rounded-2xl border border-line bg-surface-raised p-2 shadow-xl",
            "data-[state=open]:animate-[qy-rise_var(--duration-fast)_var(--ease-out-soft)]",
          )}
        >
          <ul aria-label="Períodos" className="space-y-0.5">
            {(Object.keys(PRESETS) as PresetKey[]).map((key) => {
              const selected = preset === key;
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => apply({ preset: key, from: null, to: null })}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm",
                      "transition-colors duration-[var(--duration-fast)]",
                      "hover:bg-surface-sunken",
                      selected ? "font-medium text-ink" : "text-ink-secondary",
                    )}
                  >
                    {PRESETS[key].label}
                    {selected ? <Check className="size-4 text-accent" aria-hidden="true" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-2 border-t border-line pt-2">
            <p className="px-3 pb-2 text-[11px] font-medium text-ink-muted">
              Período personalizado
            </p>
            <div className="flex items-center gap-2 px-3">
              <input
                type="date"
                aria-label="Data inicial"
                value={custom.from}
                max={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
              />
              <span className="text-xs text-ink-muted">–</span>
              <input
                type="date"
                aria-label="Data final"
                value={custom.to}
                min={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
              />
            </div>
            <div className="px-3 pt-2 pb-1">
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                disabled={!customValid}
                onClick={() => apply({ from: custom.from, to: custom.to, preset: null })}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
