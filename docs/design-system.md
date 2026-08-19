# Design system — QYRA

Derivado do **QYRA Universo Visual** (estudo de marca, jul/2026). As cores foram
extraídas por amostragem direta do PDF (pág. 15, "Mapa cromático"), não
aproximadas a olho.

---

## 1. O que veio da referência

| Elemento do manual | Como virou produto |
|---|---|
| Slab escuro de cantos generosos no topo de cada slide | A coluna de navegação (`AppShell`) — mesma cor, mesmo raio (28px) |
| **Light Color Block** (pág. 26): luzes de roxo em fundo sólido | Gradiente radial na navegação (`LightBlock`), sutil, decorativo e `aria-hidden` |
| **QYRA Icon** — o "A" da marca como chevron | O indicador de variação (`Delta`): sobe, desce, estável |
| **Logotipo QYRA** | `QyraLogo` — contornos extraídos do vetor do brandbook |
| **Logo Stamp** — contorno do logo como carimbo | Textura de fundo (`qy-stamp`), só em superfície larga |
| **Larken Italic** — fonte de contraste | Títulos de tela (`font-display`), em itálico |
| **Gilroy** — família do brandbook | Toda a interface, inclusive números |
| Paleta de 4 cores com rampa de 5 passos | Rampas `plum`, `lilac`, `sage` + papéis semânticos |

### Sobre o logotipo

`QyraLogo` e `public/brand/stamp.svg` usam os **contornos originais**, extraídos
do vetor do `QYRA_UniversoVisual` com `pdftocairo -svg` (pág. 30, onde o
logotipo aparece inteiro — nas demais ele sangra na borda e vem cortado).

Duas armadilhas, se algum dia isso for refeito:

1. A caixa real do desenho é o `clipPath` de cada glifo, **não** o extremo das
   coordenadas do `path`: pontos de controle de curva estouram a borda e
   inflam a caixa em ~2,4 unidades no Q.
2. O logotipo preenche com `currentColor`, então a versão branca e a roxa saem
   da mesma peça. Já o carimbo é `background-image`, e SVG carregado como
   imagem **não enxerga** o `currentColor` do documento — ali a cor é cravada
   no arquivo.

Não redesenhe o logotipo por semelhança. Se precisar de outra variação, extraia
do brandbook.

O que **não** foi trazido: gradiente roxo sobre foto (o próprio manual aponta
como datado, pág. 17) e fotografia — um painel de dados não tem lugar para
banco de imagem.

---

## 2. Cores da marca

| Nome | Hex | Papel |
|---|---|---|
| Dark Purple | `#2F2535` | A cor da marca. Navegação, texto principal, superfície escura |
| Sage Green | `#789180` | Contraponto tranquilo; base da rampa `sage` |
| Lilac | `#9D5CC1` | Energia e modernidade. Ação primária e primeiro slot de série |
| Silver Purple | `#D7D2E1` | Respiros, linhas, bordas |

Rampas completas em `src/app/globals.css` (`--color-plum-*`, `--color-lilac-*`,
`--color-sage-*`).

### Papéis semânticos

Componentes **nunca** usam hex nem passo de rampa direto — usam o papel. É o
que faz o tema escuro funcionar sem uma linha condicional:

`canvas` · `surface` · `surface-raised` · `surface-sunken` · `ink` ·
`ink-secondary` · `ink-muted` · `line` · `line-strong` · `brand` · `accent` ·
`accent-soft` · `positive` · `negative` · `warning`

O tema escuro tem passos próprios, escolhidos para a superfície `#2F2535` — não
é inversão automática do claro.

---

## 3. Paleta de gráficos

Ordem fixa, nunca ciclada. A cor pertence à entidade (o canal), não à posição
na lista: filtrar uma série não repinta as sobreviventes.

| Slot | Hex | Canal |
|---|---|---|
| 1 | `#9D5CC1` | Meta Ads |
| 2 | `#4E9E76` | Google Ads |
| 3 | `#C96A24` | Google Analytics |
| 4 | `#4A79D1` | Orgânico |
| 5 | `#CE5C86` | — (reserva) |

**Validada**, não estimada. `scripts/validate_palette.js` do skill *dataviz*,
nas superfícies `#FFFFFF` (claro) e `#2F2535` (escuro):

```
faixa de luminosidade  PASS
piso de croma          PASS
separação sob DCV      PASS — pior par adjacente ΔE 9,3 (deuteranopia)
piso de visão normal   PASS — pior par adjacente ΔE 19,9
contraste ≥ 3:1        PASS
```

**Limite documentado:** formas que comparam *qualquer* par entre si (dispersão,
bolha, small multiples) usam no máximo **3 slots**. Acima disso o gate
all-pairs reprova. `maxSlotsFor("all-pairs")` devolve esse número, e há teste
travando a regra.

Rampa ordinal (funil, faixas): lilás em 5 passos, também validada
(`--ordinal`, monotonia e contraste da ponta clara aprovados).

---

## 4. Regras de gráfico

Vindas do skill *dataviz* e válidas em todo o produto:

- **Nunca eixo duplo.** Duas grandezas viram dois painéis com o mesmo eixo x
  (`TrendSmallMultiples`). Eixo duplo inventa correlação que não existe.
- **Marcas finas.** Linha de 2px, barra com `maxBarSize`, ponta arredondada em
  4px, sem contorno entre barras — o espaçamento separa.
- **Grade recessiva.** Hairline sólida, um tom acima da superfície. Nunca
  tracejada.
- **Legenda sempre com 2+ séries.** Identidade nunca depende só de cor.
- **Tooltip por padrão.** Gráfico em HTML é interativo; a camada de hover não é
  enfeite.
- **Toda série tem versão em texto.** A tabela abaixo do gráfico é a "table
  view" exigida pela acessibilidade.
- **Sem número em todo ponto.** O eixo e o tooltip carregam o resto.
- **Um número sozinho não vira gráfico** — vira `StatTile`.
- **Eixo de moeda sem símbolo.** "R$" aparece uma vez, no rótulo do painel.

---

## 5. Tipografia

| Papel | Família | Substituto livre |
|---|---|---|
| Interface, dados, números | **Gilroy** | Poppins |
| Títulos de tela (itálico) | **Larken** | Fraunces italic |

Gilroy e Larken são licenciadas e não redistribuíveis, então não estão no
repositório. Para ativá-las:

1. Coloque os arquivos em `public/fonts/`.
2. Declare `@font-face` com `font-family: Gilroy` / `Larken` e
   `font-display: swap`.
3. Defina `--font-gilroy` e `--font-larken` no `:root`.

Elas já estão no topo da pilha em `--font-sans` e `--font-display`: assim que
os arquivos existirem, assumem sozinhas. Nenhum componente muda.

**Números** usam figuras proporcionais por padrão; `tabular-nums` (classe
`.tabular`) só em coluna que precisa alinhar verticalmente.

---

## 6. Componentes existentes

Antes de criar, procure aqui. Reconstruir um destes é regressão.

### Primitivas (`src/components/ui/`)

| Componente | Para quê |
|---|---|
| `Card` + `CardHeader/Title/Description/Content` | Superfície padrão |
| `Button` | Ação; tem `loading`, `asChild`, 4 variantes |
| `Badge` | Rótulo curto com tom semântico |
| `Skeleton` + `StatTileSkeleton` / `ChartSkeleton` / `TableSkeleton` | Carregamento |
| `StatTile` | Um KPI: valor, variação, explicação do cálculo |
| `Delta` | Variação com chevron da marca, ícone + texto |
| `DataTable` | Tabela ordenável, com vazio próprio |
| `EmptyState` | Vazio que diz o que fazer |
| `Tooltip*` | Dica acessível (Radix) |

### Layout (`src/components/layout/`)

`AppShell` · `Sidebar` · `PageHeader` · `DateRangePicker` · `ThemeToggle` ·
`Notices` · `Providers`

### Gráficos (`src/components/charts/`)

`TrendChart` · `TrendSmallMultiples` · `ChannelBars` · `ChartTooltip` ·
`ChartLegend` · `palette` — todos consumidos via `charts/lazy` (`next/dynamic`).

### Marca (`src/components/brand/`)

`QyraLogo` · `LightBlock`

As primitivas seguem o padrão **shadcn/ui**: composição sobre Radix, variantes
por `class-variance-authority`, estilo por token — sem dependência de um
registry externo.

---

## 7. Movimento

| Token | Valor | Uso |
|---|---|---|
| `--duration-instant` | 90ms | Saída, feedback de clique |
| `--duration-fast` | 160ms | Hover, foco, popover |
| `--duration-base` | 240ms | Entrada de conteúdo |
| `--duration-slow` | 420ms | Animação de gráfico |
| `--ease-out-soft` | `cubic-bezier(0.22, 1, 0.36, 1)` | Padrão |

Regras:

- Entrada = deslocamento curto (8px) + fade. Saída = só fade, mais rápida.
- Listas escalonam em passos de 40ms (`.qy-stagger`), até 6 itens.
- Nada com easing linear.
- Toda ação assíncrona tem estado de progresso visível (`Button loading`,
  `useTransition` no filtro de período).
- Skeleton tem a geometria do conteúdo real — a troca não empurra o layout.
- `prefers-reduced-motion: reduce` desliga tudo.

---

## 8. Acessibilidade

- Contraste ≥ 4.5:1 em texto, ≥ 3:1 em marca de gráfico. Validado.
- Cor nunca é o único canal: variação tem chevron **e** texto; alerta tem ícone
  **e** rótulo; série tem legenda **e** tabela.
- Link "Pular para o conteúdo" em toda página; foco visível em tudo.
- Um `<h1>` por tela; tabela com `<caption>` e `aria-sort`.
- Testado no Playwright (`tests/e2e/acessibilidade.spec.ts`) e cobrado pelo
  Lighthouse CI (mínimo 0,95).
