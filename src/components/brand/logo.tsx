import { cn } from "@/lib/cn";

/**
 * Logotipo QYRA em traço, como no brandbook: o "A" é o chevron da marca.
 * Herda `currentColor` para funcionar sobre qualquer superfície.
 */
export function QyraLogo({ className, title = "QYRA" }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 320 120"
      role="img"
      aria-label={title}
      className={cn("h-6 w-auto", className)}
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="46" cy="60" r="34" />
        <path d="M58 78 84 96" />
        <path d="M104 26 132 60 160 26" />
        <path d="M132 60v34" />
        <path d="M180 94V26h26a20 20 0 0 1 0 40h-26" />
        <path d="M206 66l22 28" />
        <path d="M250 94l28-68 28 68" />
        <path d="M262 72h32" />
      </g>
    </svg>
  );
}
