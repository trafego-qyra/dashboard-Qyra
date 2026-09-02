# Histórico e continuidade

Este documento existe por dois motivos: guardar **por que** o painel é como é —
a decisão junto do motivo, que é a parte que se perde — e permitir que alguém
retome o projeto **numa máquina nova** sem precisar reconstruir contexto.

Se você chegou aqui trocando de computador, comece pela seção 1. Se quer
entender uma decisão, pule para a 4.

---

## 1. Retomando numa máquina nova

### O que vem do Git e o que não vem

Tudo que é código, teste, documentação e configuração está no repositório. **Só
uma coisa não vem: o `.env.local`** — as credenciais. Ele está no `.gitignore`
de propósito e não deve, em nenhuma hipótese, ser commitado.

**As credenciais de verdade vivem no painel da Vercel.** Não existe cópia no
repositório, e não deve existir. Para trazê-las para a máquina nova:

```bash
npm i -g vercel        # se ainda não tiver
vercel login
vercel link            # aponta a pasta local para o projeto na Vercel
vercel env pull .env.local
```

Se preferir não usar a CLI, dá para copiar valor por valor em
**Vercel → Settings → Environment Variables**. `.env.example` lista todos os
nomes com uma linha explicando cada um.

### Passo a passo

```bash
git clone https://github.com/trafego-qyra/dashboard-Qyra.git
cd dashboard-Qyra
npm install
vercel env pull .env.local     # ou copie do painel
npm run dev                    # http://localhost:3000
```

Requisitos: **Node 20.11 ou mais novo** (o projeto foi desenvolvido no 22).

Sem `.env.local` nenhum o painel **roda mesmo assim**, em modo de demonstração
com dados fictícios. É útil para mexer em interface sem tocar em conta de
produção — e para conferir se o ambiente está de pé antes de caçar credencial.

### Antes de abrir qualquer PR

```bash
npm run verify      # tipos, lint, contrato de arquitetura e testes
npm run test:e2e    # Playwright, desktop e celular
```

Os dois precisam passar. O padrão completo de contribuição está em
[`AGENTS.md`](../AGENTS.md) — leia antes de escrever código.

### Onde as coisas estão

| Preciso mexer em… | Vá para |
|---|---|
| Como um canal busca dado | `src/server/connectors/` |
| O contrato de dado entre servidor e tela | `src/lib/types.ts` |
| Consolidação da visão geral | `src/server/reports.ts` |
| Telas | `src/app/(painel)/` |
| Login e porteiro | `src/app/login/`, `src/middleware.ts`, `src/server/auth/` |
| Componentes de gráfico e tabela | `src/components/` |
| Cores, tipografia, tokens | `src/app/globals.css` e `docs/design-system.md` |
| Dados de demonstração | `src/mocks/reports.ts` |

---

## 2. O que o painel é hoje

Painel de desempenho de mídia da QYRA, em `dashboard.qyra.com.br`, hospedado na
Vercel e ligado ao GitHub — todo PR gera um deploy de preview.

| Tela | Rota | Fonte |
|---|---|---|
| Visão geral | `/` | Consolidado dos quatro canais |
| Meta Ads | `/meta-ads` | Marketing API (Insights) |
| Google Ads | `/google-ads` | Google Ads API REST (GAQL) |
| Analytics | `/analytics` | GA4 Data API v1beta |
| Orgânico | `/organico` | Graph API (Instagram/Facebook) |
| Comportamento | `/comportamento` | Microsoft Clarity |

Acesso protegido por **senha única compartilhada** — detalhes em
[`integracoes.md`](./integracoes.md#acesso-ao-painel).

### Estado de cada integração

| Canal | Situação |
|---|---|
| Meta Ads | Ao vivo |
| Orgânico | Ao vivo |
| Analytics (GA4) | Ao vivo |
| **Google Ads** | **Snapshot** — dado real, congelado no período do export, enquanto o token de desenvolvedor não sai do acesso de teste |
| **Clarity** | Ligado, **sem histórico** — projeto criado há pouco, e a API devolve no máximo 3 dias |

---

## 3. As cinco conversas, em ordem

Cada sessão foi puxada por um pedido concreto. O que segue é o que mudou e por
quê — não a lista de commits, que o `git log` já dá.

### Sessão 1 — Construção

O painel nasceu inteiro: design system a partir do brandbook, camada de
conectores, componentes, as cinco telas, esteira de qualidade (Vitest,
Playwright, Biome, Knip, dependency-cruiser, Lighthouse, gitleaks), deploy na
Vercel e o padrão de Issue/PR do `AGENTS.md`.

Duas decisões estruturais dessa fase seguem valendo:

- **Modo de demonstração é first-class.** Sem credencial o painel roda com dado
  fictício em vez de quebrar. É o que permite desenvolver interface sem conta de
  produção, e é o que os testes usam.
- **O ambiente é lido por requisição, nunca na carga do módulo.** Variável
  marcada como sensível na Vercel não existe durante o build; congelar ali fazia
  a aplicação subir achando que não havia credencial.

### Sessão 2 — Auditoria e primeiros consertos

Auditoria do que estava no ar, correção dos defeitos críticos, Google Ads
passando a vir de export enquanto a API não libera, endpoints de diagnóstico, e
refino do design com foco em leitura no celular.

O logotipo deixou de ser aproximação e passou a ser o vetor original do
brandbook.

### Sessão 3 — Métricas que servem para reunião

O pedido foi direto: *"eu preciso de métricas — CPM, CTR, impressões,
visualizações, quanto por cento do vídeo foi assistido"*, no lugar de
identificadores de API.

O que saiu daí:

- Meta Ads mostrando métricas de mídia de verdade, com **CPM e frequência
  recalculados sobre o total do período** — média de médias diárias dá número
  errado;
- **melhores criativos com a arte**, e retenção de vídeo **por anúncio** —
  retenção agregada da conta não responde "qual vídeo segura a atenção", porque
  a média junta o que prende com o que é pulado no primeiro segundo;
- **avisos de operação saíram da tela do cliente.** Antes, mensagem de
  integração aparecia para quem abre o painel numa reunião. Hoje cada aviso é
  marcado como `cliente` ou `operacao`, e o filtro acontece **no servidor** —
  filtrar só no componente não bastava, porque props de componente cliente são
  serializadas no HTML e o texto viajava mesmo sem aparecer;
- UTM: padrão documentado para LinkedIn **e** Instagram, e a tela do Analytics
  passou a separar post por `utm_content`;
- correções de contagem: duração média do GA4 (ponderada por sessão, não média
  de médias), tempo por página (medindo página, não sessão), alcance do orgânico
  (deduplicado pela Meta, não soma diária).

### Sessão 4 — Comportamento e Clarity

O pedido: *"quero o mapa de calor, quero todos os dados possível de scroll"*, e
depois *"numa aba separada"*.

Comportamento virou tela própria, **fora de `CHANNELS` de propósito** — não é
canal de aquisição e não produz relatório de período, então não tem cor de série
nem filtro de datas.

Duas coisas que ficaram claras e valem repetir:

- **A API do Clarity não expõe imagem de mapa de calor.** O mapa vive no Clarity;
  o painel leva até lá por um botão. Prometer o mapa embutido seria mentira.
- **A integração nativa do Clarity com o GTM cria e publica a tag sozinha.** Eu
  insisti que era preciso criar a tag à mão e estava errado.

### Sessão 5 — Carrossel, navegação, senha

Cinco pedidos, nesta ordem:

1. **Carrossel do Instagram** aparecia como imagem única. A Meta entrega o álbum
   como uma mídia só; foi preciso pedir `children`.
2. **Continuava sem aparecer** — porque o print era da tela de **Meta Ads**, e
   anúncio carrossel é outro caminho na API (`child_attachments` dentro de
   `object_story_spec`). Dois caminhos, duas correções.
3. **Bolinhas coloridas da navegação** viraram ícones: quatro cores fortes
   empilhadas num painel que já é roxo, e a bolinha não dizia nada sobre o canal
   — só repetia uma legenda que o gráfico já dá.
4. **"Dados de demonstração" sobre número real** na visão geral. O consolidado
   só se declarava real se todo canal fosse `live`, e o Google Ads em snapshot
   derrubava a tela inteira.
5. **Senha no painel** — estava aberto na internet.

Também nessa sessão: DNS do subdomínio confirmado propagado
(`dashboard.qyra.com.br` → `cname.vercel-dns.com`), sem nada pendente do TI.

---

## 4. Decisões que valem lembrar

Reunidas aqui porque cada uma custou uma investigação, e todas voltariam a ser
questionadas sem o motivo escrito junto.

### Sobre número

**Nem toda métrica se soma.** Alcance e usuários contam *pessoas*: somar o total
de cada dia conta duas vezes quem voltou. Sessão e impressão são *eventos* e
somam normalmente. Onde a plataforma sabe deduplicar (Meta com
`metric_type=total_value`, GA4 com consulta sem dimensão de data), é ela que
faz. Onde não dá, o número aparece com a dica dizendo o que ele é.

**Razão não é média de razões.** CPM, CTR, CPL e frequência são calculados sobre
os totais do período. Média das médias diárias dá número diferente e errado.

**Dado congelado é dado real.** Enquanto o token do Google Ads aguardava
aprovação, o canal foi servido por um export em CSV da plataforma — origem
`snapshot`. O consolidado somava snapshot com honestidade e avisava que parte do
período era fixa; só `mock` — número
inventado — contamina o total.

### Sobre a tela

**Cor identifica série; comprimento representa magnitude.** Profundidade de
rolagem é medida contínua e usa **uma cor só**, com o comprimento variando. O
julgamento "esta página é ruim" aparece **escrito**, com ícone — que sobrevive a
daltonismo, impressão e alto contraste, coisa que cor sozinha não faz.

**Aviso de operação não vai para a tela do cliente.** E o filtro é no servidor.

**Arte de peça aparece inteira.** `object-cover` num quadro fixo decapitava
Reels: 9:16 dentro de 5:4 perde mais da metade, e o que sobra é o meio do vídeo,
sem a headline — justamente o que se quer avaliar.

### Sobre segurança

**A porta é um middleware, não uma checagem por página.** Proteger só as telas
deixaria `/api` e o diagnóstico respondendo por URL direta, que é onde o dado
está mais cru.

**Sem senha configurada em produção, tudo tranca.** Uma variável esquecida na
Vercel abriria o faturamento da empresa sem ninguém perceber. Um erro que se
anuncia é melhor que um vazamento silencioso.

**Arte da Meta passa por proxy do próprio domínio.** As URLs do CDN carregam
token assinado na query, expiram, e a CSP não abre `img-src` para host de
terceiro.

**Segredo não passa por chat.** Já aconteceu neste projeto. Credencial se
cadastra direto no painel da Vercel.

### Sobre as plataformas

**A versão da API do Google Ads morre sozinha.** São três lançamentos por ano e
cada versão vive uns treze meses. Versão aposentada responde **HTML 404**, que
parece problema de token e não é — o conector hoje descobre a versão viva
sozinho.

**A borda `/ads` da Meta traz link e carrossel na mesma chamada.** Não é
requisição extra pedir os dois.

**A janela do Clarity é de 3 dias** e a cota diária é baixa. Por isso a tela de
Comportamento não tem filtro de período: não haveria o que filtrar.

---

## 5. Erros que já foram cometidos aqui

Curto de propósito. A ideia é não repetir.

- **Consertar o teste em vez da causa.** Testes de celular quebraram quando um
  redesenho tirou a ordenação; a correção certa era devolver a ordenação, não
  afrouxar o teste.
- **Rota nova nascendo estática.** Página que não lê `searchParams` é
  pré-renderizada no build, quando não existe credencial — e serve "não
  configurado" para sempre. Toda tela de dado precisa de `dynamic = "force-dynamic"`.
- **Campo declarado no tipo e nunca renderizado.** O `action` da tabela existiu
  por dias sem botão nenhum na tela.
- **Token de cor inventado.** `bg-danger` não existe neste projeto; o token é
  `bg-negative`, e as barras ficaram invisíveis.
- **`cqw` e `vw` não são a mesma coisa.** Um valor que "escala com o container"
  precisa de container query, senão estoura no cartão.
- **Deixar PR pronto sem mergear.** Correção que não chega à `main` não existe
  para quem abriu o painel.

---

## 6. Pendências

| Item | De quem depende |
|---|---|
| Cadastrar `QYRA_SENHA` na Vercel e mergear o PR da senha | **Você** — sem a variável o deploy sobe trancado |
| Aprovação do token de desenvolvedor do Google Ads | **Saiu em 02/09/2026.** O canal lê ao vivo, e o snapshot foi removido |
| Validar os números do Clarity | Esperar tráfego acumular |
| Aprovação jurídica de termos e privacidade | Mais relevante agora que o Clarity grava sessão real |
| Carrossel de criativo dinâmico (`asset_feed_spec`) | Só se aparecer anúncio desse tipo na conta |

---

## 7. Referências rápidas

| Documento | Sobre |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Padrão de contribuição — leia antes de codar |
| [`integracoes.md`](./integracoes.md) | Como obter cada credencial, e o acesso ao painel |
| [`arquitetura.md`](./arquitetura.md) | Camadas e o contrato entre elas |
| [`design-system.md`](./design-system.md) | Tokens da marca e regras visuais |
| [`qualidade.md`](./qualidade.md) | Esteira de testes e limitações conhecidas |
| [`utm.md`](./utm.md) | Padrão de UTM para LinkedIn e Instagram |
| [`deploy.md`](./deploy.md) | Vercel, domínio e variáveis |

**Diagnósticos** (exigem estar logado): `/api/health` para ver o commit em
produção e quais integrações estão configuradas; `/api/diagnostico/meta` e
`/api/diagnostico/google` para descobrir em que degrau uma integração quebra.
