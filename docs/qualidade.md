# Esteira de qualidade

Nada entra na `main` sem passar por aqui. O objetivo de cada portão é impedir
uma falha concreta — nenhum existe por ritual.

## Comandos

```bash
npm run verify         # tipos + lint + arquitetura + testes
npm run typecheck
npm run lint           # Biome (lint + formatação)
npm run lint:fix
npm run check:arch     # dependency-cruiser
npm run check:deadcode # Knip
npm run test           # Vitest — unitário e integração
npm run test:coverage
npm run test:e2e       # Playwright
npm run test:mutation  # Stryker (caro; sob demanda)
npm run check:perf     # Lighthouse CI
```

## Portões

### Código

**Biome** substitui ESLint + Prettier — uma ferramenta, uma configuração, e
ordens de magnitude mais rápido. Cobra `any`, import morto, `console.log`,
formatação e regras básicas de acessibilidade em JSX.

**dependency-cruiser** implementa o *contrato de arquitetura*. A regra
`ui-nao-importa-servidor` é a mais importante do repositório: sem ela, um
`import` distraído leva credencial para o bundle do cliente. As demais impedem
ciclo, dependência invertida e módulo órfão.

**Knip** encontra arquivo, export e dependência que ninguém usa. Código morto
não é neutro: ele é lido, mantido e copiado.

**commitlint** valida Conventional Commits. O tipo do commit precisa bater com
o tipo da Issue (Correção / Melhoria / Nova função — ver `AGENTS.md`).

### Testes

| Nível | Ferramenta | O que cobre |
|---|---|---|
| Unitário | Vitest | Formatação de métrica, janela de datas, rate limit, cache, retry HTTP, paleta |
| Componente | Vitest + Testing Library | `StatTile`, `DataTable` — comportamento, não markup |
| Integração | Vitest | Conectores (com `fetch` substituído), agregação, rotas de API |
| E2E | Playwright | Percursos reais, contra o build de produção, desktop e mobile |

**Cobertura** é medida sobre `src/lib`, `src/server` e `src/mocks` — a camada
de lógica, onde um bug vira número errado no relatório do cliente. A camada de
apresentação é exercitada pelo Playwright: medir cobertura de markup infla o
número sem provar nada. Pisos atuais: linhas 85%, funções 80%, statements 85%,
ramos 60%. No **Codecov**, código novo (patch) exige 80%.

**Stryker** (mutação) roda semanal sobre `format.ts`, `date-range.ts` e o
gerador de fixtures. É o único jeito de detectar teste que passa sem provar
nada. Fora do CI de PR porque é caro.

> **Endtest** foi avaliado e não entrou: é SaaS proprietário e sobreporia o
> Playwright, que já roda no CI sem custo de licença. Se a operação precisar de
> gravação de teste por pessoa não-técnica, é a hora de reconsiderar.

### Segurança

- `npm audit --audit-level=high` a cada PR.
- **gitleaks** varre o diff atrás de segredo.
- **Rate limit** em todas as rotas de API (`src/server/lib/rate-limit.ts`),
  com `x-ratelimit-*` e `retry-after`.
- **Cabeçalhos** em `next.config.ts`: CSP fechada, HSTS, `frame-ancestors
  'none'`, `nosniff`, `Referrer-Policy`. `/api/*` responde `no-store`.
- **Fronteira backend/frontend** cravada pelo contrato de arquitetura e por
  `server-only`.
- Erro de conector nunca é repassado cru: a mensagem da plataforma pode conter
  identificador de conta.

### Performance

Orçamento em `.lighthouserc.json`, cobrado no CI:

| Métrica | Teto |
|---|---|
| Performance | ≥ 0,90 |
| Acessibilidade | ≥ 0,95 |
| First Contentful Paint | 2,0s |
| Largest Contentful Paint | 2,5s |
| Cumulative Layout Shift | 0,1 |
| Total Blocking Time | 300ms |
| JavaScript total | 400 kB |

Estado atual: **145 kB** de First Load JS (era 247 kB antes de carregar os
gráficos sob demanda).

## Observabilidade

**Sentry** é o backbone: erro de servidor, de edge e de browser, mais tracing.
O SDK do Next é construído sobre **OpenTelemetry**, então os spans já saem no
padrão OTel. Uma dependência resolve erro + rastro.

Configuração em `src/instrumentation.ts` e `src/instrumentation-client.ts`.
Sem `NEXT_PUBLIC_SENTRY_DSN` nada inicializa — local e preview não geram evento
nem custo. `beforeSend` remove qualquer `token`/`secret`/`key` da URL antes do
evento sair da máquina. `sendDefaultPii` desligado.

**Datadog e New Relic não entram por padrão.** Três APMs concorrentes no mesmo
app é custo e ruído sem ganho — e o repositório tem uma regra explícita contra
overengineering. Ambos consomem OTLP: quando houver necessidade real (a
operação já usa um deles, ou o Sentry não der conta do tracing), basta apontar
o exporter OpenTelemetry para o coletor correspondente, sem tocar no código de
aplicação.

## Aspectos legais

`docs/legal/termos-de-uso.md` e `docs/legal/politica-de-privacidade.md` estão
redigidos como **minuta** e marcados como **pendentes de aprovação jurídica**.
Eles não podem ser publicados como vigentes antes dessa revisão — o painel trata
dado de operação de saúde e a LGPD tem exigências específicas. A publicação é
uma tarefa de bloqueio antes do domínio público entrar no ar.
