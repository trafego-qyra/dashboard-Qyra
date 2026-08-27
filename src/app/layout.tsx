import type { Metadata, Viewport } from "next";
import { Fraunces, Poppins } from "next/font/google";

import { Providers } from "@/components/layout/providers";

import "./globals.css";

/**
 * Gilroy e Larken são as famílias do brandbook, mas nenhuma das duas é
 * redistribuível. Poppins (geométrica) e Fraunces (serifada com itálico
 * expressivo) são os substitutos livres; quando os arquivos licenciados
 * entrarem em `public/fonts`, `--font-gilroy`/`--font-larken` assumem o topo da
 * pilha sem tocar em nenhum componente. Ver docs/design-system.md.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["italic"],
  weight: ["400", "600"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Dashboard QYRA",
    template: "%s · Dashboard QYRA",
  },
  description:
    "Desempenho de mídia paga e orgânica da QYRA: Meta Ads, Google Ads, Google Analytics e redes sociais em um só painel.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#221a28" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${poppins.variable} ${fraunces.variable}`}
    >
      <body>
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--qy-accent-ink)]"
        >
          Pular para o conteúdo
        </a>
        {/* A casca com navegação vive em `(painel)/layout.tsx`: a tela de
            login não tem para onde navegar e não deve mostrar a barra. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
