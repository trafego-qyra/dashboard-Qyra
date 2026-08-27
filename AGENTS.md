# Contrato de contribuição — dashboard QYRA

Este arquivo é a **fonte da verdade do padrão de trabalho** deste repositório.
Vale para pessoas e para agentes de qualquer modelo. **Leia antes de escrever
qualquer código.** `CLAUDE.md` aponta para cá; não duplique regra entre os dois.

---

## 1. O que é o produto

Painel de desempenho de mídia da QYRA. Reúne, num só lugar, quatro fontes:

| Canal | Origem | Rota |
|---|---|---|
| Meta Ads | Marketing API (Insights) | `/meta-ads` |
| Google Ads | Google Ads API REST (GAQL) | `/google-ads` |
| Google Analytics | GA4 Data API v1beta | `/analytics` |
| Orgânico | Graph API (Instagram/Facebook Insights) | `/organico` |

Hospedagem: **Vercel**, conectada ao GitHub. Todo PR gera deploy de preview.
Domínio de produção previsto: **dashboard.qyra.com.br**, após validação.

---

## 2. Fluxo obrigatório de entrega

### 2.1 Toda tarefa vira uma Issue, classificada

Antes de codar, abra (ou encontre) a Issue. Três tipos, e só três:

| Tipo | Label | Quando usar | Tipo de commit |
|---|---|---|---|
| **Correção** | `correção` | Algo que já existe está errado | `fix:` |
| **Melhoria** | `melhoria` | Algo que funciona pode ficar melhor | `refactor:` `perf:` `style:` `docs:` `test:` |
| **Nova função** | `nova função` | O produto ainda não faz | `feat:` |

Use os templates em `.github/ISSUE_TEMPLATE/`. Issue sem critério de aceite
não está pronta para começar.

### 2.2 Toda entrega vira um Pull Request

Nada entra na `main` por push direto. O PR usa
`.github/pull_request_template.md` e **precisa** conter:

1. **A Issue relacionada** — `Closes #123` na descrição.
2. **O que mudou** — a mudança, não o processo.
3. **Como foi validado** — quais comandos rodaram e qual cenário foi
   exercitado. "Testes passando" sozinho não é validação.
4. **Riscos e limitações** — o que pode quebrar, o que ficou de fora, o que
   depende de configuração externa.
5. **Próximos passos** — o que este PR deixa em aberto.

### 2.3 Commits

Conventional Commits, validados pelo commitlint no `commit-msg`. O tipo do
commit precisa ser coerente com o tipo da Issue (tabela acima).

---

## 3. Portões de qualidade

Rode antes de abrir o PR:

```bash
npm run verify      # tipos + lint + contrato de arquitetura + testes
npm run test:e2e    # percursos de ponta a ponta
```

O que a CI cobra (`.github/workflows/ci.yml`), e por quê:

| Portão | Ferramenta | O que impede |
|---|---|---|
| Tipos | `tsc --noEmit` | Contrato quebrado entre camadas |
| Lint e formatação | **Biome** | Estilo divergente, `any`, import morto, a11y básica |
| Contrato de arquitetura | **dependency-cruiser** | UI importando servidor — vazamento de credencial |
| Código morto | **Knip** | Arquivo, export e dependência sem uso |
| Unitário + integração | **Vitest** | Regressão de cálculo, parsing e rate limit |
| Cobertura | **Codecov** | Código novo sem teste (patch ≥ 80%) |
| End-to-end | **Playwright** | Percurso quebrado, a11y de navegação |
| Performance | **Lighthouse CI** | Estouro do orçamento de bundle e de LCP |
| Dependências | `npm audit` + **gitleaks** | Vulnerabilidade conhecida e segredo no diff |
| Mutação | **Stryker** (semanal) | Teste que passa sem provar nada |

Ganchos locais (husky): `pre-commit` roda lint + tipos + arquitetura;
`commit-msg` valida a mensagem; `pre-push` roda os testes.

---

## 4. Arquitetura

```
src/
  app/          telas e rotas HTTP (Next App Router)
    _shared/    server components compartilhados (pasta privada, fora do roteamento)
    api/v1/     backend HTTP: rate limit, validação, contrato público
  components/   UI — não conhece rede nem segredo
  server/       backend: conectores, OAuth, cache, rate limit
  lib/          puro e compartilhado: tipos, formatação, datas
  mocks/        fixtures determinísticas
```

**Quem pode depender de quem** — cravado em `.dependency-cruiser.cjs` e
verificado na CI:

- `components/` → só `lib/`. **Nunca** `server/`.
- `server/` → `lib/` e `mocks/`. Nunca `components/`.
- `lib/` → nada do projeto. É a base dos dois lados.
- `mocks/` → só `lib/`.
- Nenhum ciclo.

A regra que mais importa é a primeira: é ela que impede uma credencial de ir
parar no bundle do cliente. Um server component que busca dados vive em
`app/_shared/`, não em `components/`.

### Princípios

- **Sem overengineering.** Cache é um `Map` com TTL, não Redis. Rate limit é
  janela fixa em memória. Conector é `fetch`, não SDK com gRPC. Quando um
  desses limites for atingido de verdade, troque — e escreva por quê.
- **Sem gargalo bobo.** Canais são buscados em paralelo; a falha de um não
  derruba os outros. Gráfico entra por `next/dynamic` (Recharts é ~145 kB).
- **DRY com critério.** As quatro telas de canal compartilham `ChannelView`
  porque o *dado* tem a mesma forma, não porque o layout parece igual.
  Abstração com flag de variação é pior que duplicação.
- **Não reconstrua o que existe.** Antes de criar componente, procure em
  `src/components/ui/`. A lista está em `docs/design-system.md`.

---

## 5. Design

O visual segue o **QYRA Universo Visual** (estudo de marca). Tokens,
tipografia, grafismos e regras de gráfico estão em **`docs/design-system.md`**.
Não invente cor, raio ou sombra fora dos tokens.

Duas regras que não se negociam:

- **Cor de série segue a entidade, nunca o rank.** Meta Ads é sempre o slot 1;
  filtrar uma série não repinta as outras.
- **Nunca eixo duplo.** Duas grandezas diferentes viram dois painéis.

Toda tela precisa de: estado de carregamento (skeleton com a geometria do
conteúdo real), estado vazio que diz o que fazer, estado de erro com ação de
recuperação, e funcionamento em tema claro e escuro.

---

## 6. Segurança e operação

- Segredo só em `src/server/**`, que importa `server-only`. Se um módulo de
  `components/` precisar de dado de API, ele recebe por props.
- Rotas de API têm rate limit e nunca repassam a mensagem crua do provedor —
  ela pode conter identificador de conta.
- Cabeçalhos de segurança (CSP, HSTS, `frame-ancestors 'none'`) em
  `next.config.ts`. `/api/*` responde `no-store`.
- Nada de `console.log` em código de produção (`console.error`/`warn` são
  permitidos). O Biome cobra.
- Variáveis novas entram em `src/server/env.ts` (validadas por zod) e em
  `.env.example`. Nunca em `NEXT_PUBLIC_*` se forem segredo.

---

## 7. Documentação

| Arquivo | Conteúdo |
|---|---|
| `README.md` | Como rodar, scripts, visão geral |
| `AGENTS.md` | Este contrato |
| `docs/design-system.md` | Tokens, tipografia, componentes, regras de gráfico |
| `docs/utm.md` | Padrão de UTM — o que a tabela de origem do Analytics lê |
| `docs/arquitetura.md` | Camadas, fluxo de dados, decisões |
| `docs/integracoes.md` | Como obter credencial de cada plataforma |
| `docs/qualidade.md` | Esteira, observabilidade, orçamento de performance |
| `docs/deploy.md` | Vercel, ambientes, domínio |
| `docs/historico.md` | Por que o painel é assim, e como retomar numa máquina nova |
| `docs/seguranca.md` | Modelo de ameaça, achados abertos e parâmetros de acesso |
| `docs/legal/` | Termos de uso e política de privacidade (**pendentes de aprovação jurídica**) |

Mudou o comportamento? Atualize a doc no mesmo PR.
