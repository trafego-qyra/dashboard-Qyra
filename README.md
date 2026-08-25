# Dashboard QYRA

Painel de desempenho de mídia da QYRA. Reúne Meta Ads, Google Ads, Google
Analytics e o orgânico de Instagram/Facebook em um só lugar, com visão
consolidada e uma tela por canal.

![Next.js](https://img.shields.io/badge/Next.js-15-000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss&logoColor=white)

---

## Começar

```bash
npm ci
npm run dev
```

Abra <http://localhost:3000>. **Sem nenhuma credencial o painel já funciona**,
com dados fictícios e um aviso visível em cada tela — é assim que se desenvolve
e se avalia a interface sem tocar em conta de produção.

Para conectar as plataformas de verdade:

```bash
cp .env.example .env.local
```

O passo a passo de cada credencial está em **[docs/integracoes.md](docs/integracoes.md)**.
Confira o que está ativo em `/api/health`.

---

## Telas

| Rota | O que mostra |
|---|---|
| `/` | Visão consolidada: investimento, conversões, CPA, sessões, comparativo por canal |
| `/meta-ads` | Investimento, leads, CPL, CTR e campanhas do Meta Ads |
| `/google-ads` | Investimento, conversões, CPA, CPC e campanhas do Google Ads |
| `/analytics` | Sessões, usuários, conversões, canais de aquisição e páginas (GA4) |
| `/organico` | Alcance, interações, novos seguidores e melhores publicações |

O período é filtrado pela URL (`?preset=28d` ou `?from=&to=`), então é
compartilhável e sobrevive ao refresh.

## API

| Rota | Resposta |
|---|---|
| `GET /api/v1/overview` | Visão consolidada |
| `GET /api/v1/reports/:channel` | Relatório de um canal |
| `GET /api/health` | Prontidão e quais integrações estão configuradas |

Todas aceitam `?preset=7d\|14d\|28d\|90d` ou `?from=&to=` em ISO, e aplicam
rate limit com cabeçalhos `x-ratelimit-*`.

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `start` | Build e execução de produção |
| `npm run verify` | Tipos + lint + arquitetura + testes |
| `npm run test` | Vitest (unitário e integração) |
| `npm run test:coverage` | Suíte com cobertura |
| `npm run test:e2e` | Playwright |
| `npm run lint` / `lint:fix` | Biome |
| `npm run check:arch` | Contrato de arquitetura |
| `npm run check:deadcode` | Knip |
| `npm run check:perf` | Lighthouse CI |
| `npm run test:mutation` | Stryker |

---

## Stack

**Next.js 15** (App Router, server components) · **TypeScript** ·
**Tailwind CSS 4** · **Recharts** · **Radix UI** (primitivas no padrão
shadcn/ui) · **Vitest** · **Playwright** · **Biome** · **Sentry**

Os conectores falam REST direto com cada plataforma — sem SDK pesado. Detalhes
e o porquê em [docs/arquitetura.md](docs/arquitetura.md).

---

## Contribuir

**Leia [`AGENTS.md`](AGENTS.md) antes de escrever código.** Ele define o
contrato de contribuição — para pessoas e para agentes:

- toda tarefa vira uma **Issue** (Correção, Melhoria ou Nova função);
- toda entrega vira um **Pull Request** que referencia a Issue, explica o que
  mudou, como foi validado, e registra riscos e próximos passos;
- `npm run verify` e `npm run test:e2e` passam antes do PR.

## Documentação

| Documento | Conteúdo |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Contrato de contribuição |
| [`docs/design-system.md`](docs/design-system.md) | Tokens da marca, componentes, regras de gráfico |
| [`docs/arquitetura.md`](docs/arquitetura.md) | Camadas, fluxo de dados, decisões |
| [`docs/integracoes.md`](docs/integracoes.md) | Credenciais de cada plataforma |
| [`docs/utm.md`](docs/utm.md) | Padrão de UTM dos links publicados |
| [`docs/qualidade.md`](docs/qualidade.md) | Esteira, observabilidade, performance |
| [`docs/deploy.md`](docs/deploy.md) | Vercel, ambientes, domínio |
| [`docs/seguranca.md`](docs/seguranca.md) | Modelo de ameaça, achados abertos e parâmetros de acesso |
| [`docs/legal/`](docs/legal/) | Termos e privacidade (minuta, pendente de jurídico) |

---

## Deploy

Hospedado na **Vercel**, conectada ao GitHub: PR gera preview, merge na `main`
publica. Domínio de produção previsto: `dashboard.qyra.com.br`, após validação.
Ver [docs/deploy.md](docs/deploy.md) — inclui a lista de bloqueios antes de
expor o domínio público (autenticação, jurídico, Sentry).
