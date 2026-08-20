# Conta Qyra Saúde — contexto, dados e plano de mídia

Dossiê da conta. Serve para qualquer sessão nova entrar no assunto sem
recomeçar do zero: quem é a conta, o que já foi medido, o que foi proposto e
como refazer os números.

**Última leitura de dados: 20 de agosto de 2026.** Os números abaixo são dessa
data. Antes de usá-los numa entrega nova, confira se ainda valem — a seção
[Como refazer os números](#8-como-refazer-os-números) tem as chamadas exatas.

---

## 1. Identificação

| Campo | Valor |
|---|---|
| Conta de anúncios | `act_1610215746739005` — "Qyra Saúde" |
| Business Manager | `979169451162933` — "Qyra Saúde" |
| Moeda | BRL |
| Fuso | `America/Sao_Paulo` |
| Verba mínima diária | R$5,14 |
| Vertical (classificação da Meta) | Healthcare, Pharmaceuticals and Biotech → *Dieting and Fitness Programmes* |
| Funil | Funil único — 70%+ da verba num só estágio, o de consideração |
| Objetivo de performance | Volume de conversões ao menor custo |

O usuário tem acesso a cerca de 50 contas de anúncios. **A conta da Qyra é a
`1610215746739005`** — ela aparece na segunda página de
`ads_get_ad_accounts`, não na primeira. Não confundir com as contas de
clientes (Previmater, Haganá, Intersept, Sim Segurança, Nowa, e outras).

---

## 2. O pedido que originou o trabalho

Conversa de WhatsApp com o cliente, agosto de 2026. O que foi dito, na ordem:

- Qyra: *"Seria 16k mês"* — patamar de investimento em discussão.
- Qyra: *"Posso te mandar mais tarde uma estrutura de sugestões?"*
- Cliente: *"Você consegue estimar quantos impactos a gnt poderia fazer no
  nosso universo atual?"*
- Cliente, depois: *"To pensando aqui ainda: mídia programática? mídia na IA?"*

Traduzindo para o que a entrega precisa responder:

1. Quantos **impactos** (impressões) e quanto **alcance** R$16.000/mês compram.
2. Uma **estrutura de sugestões** — a divisão da verba.
3. Um **posicionamento sobre mídia programática e anúncios em IA**.

"Impactos" no vocabulário do cliente é impressão. "Universo" é o público
endereçável.

---

## 3. Dados medidos

Todos vindos da API de Insights do Meta Ads em 20/ago/2026. Alcance é
desduplicado dentro de cada janela e **não se soma entre períodos**.

### 3.1 Janelas

| Janela | Investido | Impressões | Alcance | Freq. | CPM | CPC | CPP¹ | CTR | Leads |
|---|---|---|---|---|---|---|---|---|---|
| Ontem (19/ago) | R$120,54 | 31.250 | 26.598 | 1,17 | R$3,86 | R$0,20 | R$4,53 | 1,96% | — |
| 7 dias | R$861,52 | 164.816 | 81.061 | 2,03 | R$5,23 | R$0,22 | R$10,63 | 2,36% | 2 |
| 30 dias | R$1.940,10 | 246.745 | 124.427 | 1,98 | R$7,86 | R$0,18 | R$15,59 | 4,30% | 5 |
| 90 dias | R$8.873,64 | 2.689.073 | 1.449.772 | 1,85 | R$3,30 | R$0,29 | R$6,12 | 1,13% | 6 |

¹ CPP = custo por mil pessoas alcançadas.

Outros números das mesmas janelas: 7 dias — 3.888 cliques, 2.451 cliques únicos
no link, 450 visualizações da página, 6.780 engajamentos. 30 dias — 10.611
cliques, 6.671 cliques únicos no link, 452 visualizações da página, 14.048
engajamentos, custo por lead R$388,02. 90 dias — 30.388 cliques, 25.747 cliques
únicos no link, 538 visualizações da página, 120.953 engajamentos.

### 3.2 Série mensal

| Período | Dias | Investido | R$/dia | Impressões | Impr./dia | Alcance | Freq. | CPM | CPP | CTR |
|---|---|---|---|---|---|---|---|---|---|---|
| 21–31 mai | 11 | R$2.255,92 | R$205,08 | 804.414 | 73.128 | 570.182 | 1,41 | R$2,80 | R$3,96 | 0,72% |
| junho | 30 | R$3.850,69 | R$128,36 | 1.419.956 | 47.332 | 835.374 | 1,70 | R$2,71 | R$4,61 | 0,85% |
| julho | 31 | R$1.341,34 | R$43,27 | 256.838 | 8.285 | 195.701 | 1,31 | R$5,22 | R$6,85 | 2,09% |
| 1–18 ago | 18 | R$1.425,69 | R$79,21 | 207.865 | 11.548 | 108.164 | 1,92 | R$6,86 | R$13,18 | 3,45% |

**Os dois fatos que mais importam nesta tabela:**

- **Junho é o teto provado de volume**: R$3.850,69 num mês compraram 1,42 mi de
  impressões e 835 mil pessoas, a R$2,71 de CPM, com frequência de só 1,70.
- **Maio é o teto provado de ritmo**: R$205,08/dia sem o CPM subir (R$2,80).

O CPM subiu em julho e agosto **por mudança de objetivo, não por saturação** —
a verba migrou de alcance/reconhecimento para visita ao perfil e tráfego, que
custam mais caro por mil.

### 3.3 Praças (30 dias)

| Praça | Investido | Participação | Impressões | Alcance | Freq. | CPM | CTR |
|---|---|---|---|---|---|---|---|
| São Paulo (estado) | R$1.427,49 | 73,6% | 175.799 | 90.189 | 1,95 | R$8,12 | 4,56% |
| Rio de Janeiro (estado) | R$476,53 | 24,6% | 63.579 | 32.120 | 1,98 | R$7,50 | 3,87% |
| Distrito Federal | R$36,08 | 1,9% | 7.367 | 3.339 | 2,21 | R$4,90 | 1,79% |

**O DF tem o CPM mais barato dos três e quase não recebeu verba.** É a folga
mais óbvia da conta. O volume é pequeno demais para ser conclusivo, mas é a
hipótese mais barata de testar.

### 3.4 Estrutura que estava no ar (7 dias até 19/ago)

| Conjunto | Objetivo | Verba/dia | Investido | Impressões | Alcance | Freq. | CPM | CTR | Resultado |
|---|---|---|---|---|---|---|---|---|---|
| Topo · Frio-Amplo · VisitaPerfil | Visita ao perfil | R$85 | R$542,62 | 120.789 | 68.504 | 1,76 | R$4,49 | 2,34% | 1.690 visitas a R$0,32 |
| Meio · RMK-IG-365d · LP | Visualização da página | R$46 | R$276,84 | 40.988 | 11.625 | **3,53** | R$6,75 | 2,02% | 450 visitas a R$0,62 |
| Advantage+ · público automático | Visita ao perfil | CBO | R$42,06 | 3.039 | 2.911 | 1,04 | R$13,84 | 7,77% | 210 visitas a R$0,20 |

Segmentação do topo: 28–55 anos, estados de SP e RJ mais o DF, Facebook e
Instagram, feed/stories/reels. O Advantage+ roda 18–65, SP e RJ.

O público de remarketing "Interagiu com insta 365D" tem **392.700 a 462.100
pessoas**.

Existe pixel na conta (`1496242995619330`) com público de PageView criado, mas
a campanha de remarketing de página está **pausada, com R$0 investido**.

---

## 4. Achados que sustentam qualquer recomendação

1. **Não existe campanha de conversão.** Tudo que roda otimiza para visita ao
   perfil ou visualização da página. Nenhuma campanha de lead, mensagem ou
   compra. Os 5 leads de 30 dias (R$388,02 cada) são incidentais — 5 eventos é
   ruído, não uma taxa. Multiplicar a verba nessa estrutura multiplica
   impressão, não contato.
2. **68% da verba termina no perfil do Instagram.** Dos R$861,52 de 7 dias,
   R$584,68 foram para objetivo de visita ao perfil e R$276,84 para a página.
3. **O funil abaixo do topo converte bem, mas é minúsculo.** Dos 526 cliques
   únicos no link do conjunto de página, 450 viraram visualização — 86%. Não é
   problema de página, é falta de verba ali.
4. **A conta nunca passou de R$205/dia.** R$533/dia (o equivalente a
   R$16.000/mês) é 2,6× o recorde. Subida precisa ser em degraus.
5. **O remarketing satura por frequência antes de saturar por verba.** Com
   R$46/dia já roda a 3,53 por semana — perto de 15 no mês.
6. **O universo não está nem perto de esgotado.** Alcançar 1,4 mi/mês é ~7% do
   público endereçável, com frequência 2.

---

## 5. Projeção para R$16.000/mês

R$16.000/mês = **R$533,33/dia**. Isso é 4,3× o ritmo dos últimos 7 dias
(R$123,07/dia) e 2,6× o recorde histórico (R$205,08/dia em maio).

### 5.1 Universo endereçável

Estados de SP e RJ mais o DF, 28 a 55 anos, no Instagram e Facebook:
**18 a 22 milhões de pessoas**.

> Este número é **estimativa externa** (população IBGE × penetração das
> plataformas), não sai da API. Sempre rotular como estimativa em entregas.

### 5.2 Cenários

Cada cenário usa CPM que a própria conta já praticou, com folga de 25% a 35%
para a pressão de escalar.

| Cenário | Composição | CPM | Freq. | Impactos/mês | Alcance/mês | CPP |
|---|---|---|---|---|---|---|
| Alcance máximo | 60% alcance/marca · 30% topo · 10% RMK | R$3,60 | 1,8 | 4.440.000 | 2.470.000 | R$6,48 |
| **Mix atual escalado** | 65% topo · 20% tráfego · 15% RMK | R$5,60 | 2,1 | 2.860.000 | 1.360.000 | R$11,76 |
| Conservador | nada muda no mix | R$8,00 | 2,4 | 2.000.000 | 833.000 | R$19,20 |

**O resultado varia 2,2× conforme o mix.** É decisão de composição, não do
leilão.

### 5.3 Número comunicado ao cliente

Na estrutura recomendada da seção 6:

- **≈2,9 milhões de impactos/mês**
- **≈1,4 milhão de pessoas únicas/mês**
- **≈1 a cada 15 adultos de 28 a 55 anos** nas três praças

Rendimentos derivados, aos custos de hoje: ~27 mil visitas ao perfil a R$0,39 e
~2,3 mil visitas à página a R$0,78. **Volume de leads não é projetável** — não
há campanha de conversão com histórico.

---

## 6. Plano de mídia — R$16.000/mês

| Linha | Verba | % | CPM previsto | Impactos/mês | Observação |
|---|---|---|---|---|---|
| Prospecção — público frio, três praças | R$6.200 | 38,8% | R$5,00 | 1.240.000 | Escala o conjunto que já funciona |
| Marca — alcance amplo | R$3.000 | 18,8% | R$3,20 | 937.500 | Usa o CPM de mai/jun |
| Tráfego — frio para a página | R$1.800 | 11,3% | R$6,80 | 264.706 | Continua o conjunto atual |
| Conversão — lead e WhatsApp | R$1.500 | 9,4% | R$12,00 | 125.000 | **Linha nova, sem histórico** |
| Remarketing | R$1.500 | 9,4% | R$7,00 | 214.286 | Teto por frequência |
| Busca — captura de demanda | R$1.000 | 6,3% | — | ≈30.000 | Google; o painel já tem o conector |
| Teste em IA — anúncios no ChatGPT | R$1.000 | 6,3% | R$15,00 | ≈67.000 | Só se a categoria for aprovada |
| **Total** | **R$16.000** | **100%** | **≈R$5,50** | **≈2.878.000** | |

**Ordem de execução recomendada** (cada passo é pré-requisito do seguinte):

1. Subir a campanha de conversão **antes** de subir a verba, com pixel validado.
2. Escalar em degraus de 25% a 30% por semana — de R$123/dia a R$533/dia em
   ~6 semanas, com leitura a cada degrau.
3. Abrir a linha de marca no DF (CPM R$4,90 contra R$8,12 de SP).
4. Pôr teto no remarketing (R$1.500/mês) e alertar se a frequência de 7 dias
   passar de 4.
5. Entrar na fila de aprovação do OpenAI Ads. Se não sair, a verba do teste
   volta para a linha de conversão.

> Esta ordem foi retirada da entrega ao cliente a pedido dele, mas continua
> válida como plano operacional interno.

---

## 7. Canais externos — o que foi apurado

### 7.1 Mídia programática

Contexto de mercado (2026):

- Investimento publicitário no Brasil deve crescer **9,1%** em 2026, a maior
  expansão entre os 12 principais mercados (média global 5,1%).
- Vídeo online **+11,5%**, CTV **+9,5%**, retail media **+38,4%** (US$1,67 bi).
- Programática global deve passar de **US$725 bi** até 2026.

**Por que não cabe agora:** as DSPs independentes operam a partir de cerca de
**R$600 mil/ano** em compra de mídia. O anual do projeto a R$16k/mês seria
R$192 mil — um terço do piso de entrada.

Alternativas que se comportam como programática sem contrato de DSP:

- **A Meta já é programática** — leilão em tempo real, entrega algorítmica. Muda
  o inventário, não o mecanismo. O cliente costuma não saber disso.
- **YouTube e Demand Gen pelo Google Ads** dão inventário de CTV e vídeo, sem
  mínimo.
- **Trading desk ou agência com contrato guarda-chuva** é a via realista para
  DSP de verdade.

**Posição:** reavaliar acima de ~R$50 mil/mês, ou quando a linha de conversão
da Meta estiver madura e o limite for de inventário, não de estrutura.

### 7.2 Anúncios no ChatGPT (OpenAI Ads)

Linha do tempo:

| Data | O que mudou |
|---|---|
| 9 fev 2026 | Estreia nos EUA. Compra assistida, mínimo de US$200–250 mil, CPM fixo de US$60. Só usuários Free e Go. |
| 5 mai 2026 | Autoatendimento em `ads.openai.com`. Mínimo eliminado. Entra lance por CPC (US$3–5 recomendado), pixel JS (OAIQ) e API de conversões. CPM cai para ~US$25. |
| 7 mai 2026 | Piloto chega ao Brasil. |
| ago 2026 | Plataforma aceita anunciantes sediados no Brasil. |

Mecânica:

- **Quem vê:** só usuários adultos logados nos planos Free e Go. Plus, Pro,
  Team, Business e Enterprise nunca veem anúncio. Não exibe para contas
  previstas como menores de 18.
- **Formato:** bloco patrocinado marcado, abaixo da resposta, contextual à
  pergunta. Nunca dentro da resposta.
- **Mensuração:** pixel JS (SDK OAIQ) e API de conversões server-side, com
  cookie próprio `__oppref` de 30 dias.
- **CPM estimado no Brasil:** R$8 a R$25 na fase de beta.

**O ponto que decide para esta conta:** até abril de 2026 a OpenAI excluía por
completo contextos médicos, jurídicos e financeiros. A política mudou — saúde e
serviços financeiros selecionados passaram a ser aceitos, **com aprovação
manual, exigência de licenciamento e limites rígidos de categoria**. Jurídico
segue proibido. Anúncios de saúde não aparecem ao lado de conversas sensíveis
sobre a condição médica de alguém, mas a OpenAI citou explicitamente como
permitido o caso de *"perguntas gerais sobre exercício ou dieta"*.

A Meta classifica a Qyra Saúde como *Dieting and Fitness Programmes* — cai
exatamente nessa brecha, e exatamente no balde que exige aprovação manual. No
Brasil as categorias liberadas no início do piloto eram varejo, e-commerce e
turismo. **Plausível, não garantido.**

Sinal de eficácia: a Criteo, que leva campanhas ao ChatGPT Ads via API, reporta
conversão de tráfego vindo de IA perto do **dobro** da busca tradicional (era
~1,5× em março de 2026).

**Posição:** entrar na fila agora, testar R$1.000/mês por 60 a 90 dias. Não é
canal de escala — a R$15 de CPM, R$1.000 compram ~67 mil impressões, ~2% do que
a Meta entrega. É canal de posição e aprendizado.

### 7.3 Fontes

- [OpenAI Ads](https://ads.openai.com/) · [Políticas de anúncio](https://openai.com/policies/ad-policies/)
- [Search Engine Journal — health & finance ads no ChatGPT](https://www.searchenginejournal.com/openai-allows-some-health-finance-ads-in-chatgpt/585516/)
- [Marketing Brew — verticais reguladas](https://www.marketingbrew.com/stories/chatgpt-is-opening-the-advertising-door-to-some-regulated-verticals-but-most-marketers-arent-crossing-the-threshold-yet)
- [Meio & Mensagem — ChatGPT Ads no Brasil](https://www.meioemensagem.com.br/midia/openai-se-prepara-para-lancar-chatgtp-ads-no-brasil)
- [Choice OMG — CPC, targeting e pixel OAIQ](https://choice.marketing/blog/chatgpt-ads-2026-field-guide/)
- [MediaPost — campanhas de conversão](https://www.mediapost.com/publications/article/415465/openai-races-to-add-conversion-optimized-campaigns.html)
- [AdSeleto — mercado programático no Brasil em 2026](https://adseleto.com/mercado-programatico-no-brasil-em-2026/)
- [Retail Media News — full-funnel, CTV e off-site](https://retailmedianews.com.br/noticias/mercado-ads-em-2026-o-salto-do-retail-media-para-uma-plataforma-de-midia-full-funnel-ctv-off-site-e-mensuracao-avancada/)
- [Publya — DSPs usadas no Brasil](https://publya.com/blog/top-5-plataformas-de-compra-de-midia-dsps-usadas-no-brasil/)
- [Metrópoles — digital supera a TV aberta em 2026](https://www.metropoles.com/colunas/m-buzz/publicidade-em-transicao-digital-desafia-o-off-line)

---

## 8. Como refazer os números

Servidor MCP **Meta Ads**. Todas as chamadas levam `client_conversation_id`
(20 caracteres alfanuméricos, o mesmo em toda a conversa) e
`advertiser_request` com as palavras do anunciante.

```
# achar a conta — ela está na SEGUNDA página
ads_get_ad_accounts()
ads_get_ad_accounts(cursor: <next_cursor da primeira página>)

# contexto de negócio (vertical, funil, objetivo)
ads_insights_advertiser_context(ad_account_id: "1610215746739005", date_preset: "last_30d")

# janelas — trocar date_preset por yesterday / last_7d / last_30d / last_90d
ads_get_ad_entities(
  ad_account_id: "1610215746739005",
  level: "ad_account",
  date_preset: "last_30d",
  fields: ["id","name","amount_spent","impressions","reach","frequency","cpm",
           "cpc","cpp","ctr","clicks","unique_link_click","landing_page_view",
           "post_engagement","lead","cost_per_lead"]
)

# série mensal — acrescentar time_increment (string, não número)
ads_get_ad_entities(..., date_preset: "last_90d", time_increment: "monthly")

# praças
ads_get_ad_entities(..., date_preset: "last_30d", breakdowns: ["region"])

# estrutura no ar
ads_get_ad_entities(..., level: "adset", date_preset: "last_7d",
                    filtering: [{field:"adset.effective_status",
                                 operator:"IN", value:["ACTIVE"]}])
```

Armadilhas conhecidas:

- `level: "ad_account"` **não aceita** `filtering` nem `sort`, e não devolve
  `cost_per_result`.
- Só **um** breakdown por chamada; os demais são ignorados em silêncio.
- `time_increment` é string (`"monthly"`, `"7"`), não número.
- `clicks` conta todo clique, não só clique no link. Para link, usar
  `unique_link_click`.
- CTR e CPM só são comparáveis entre janelas com o **mesmo mix de objetivos**.

---

## 9. Entregáveis produzidos

| Arquivo | O que é |
|---|---|
| `docs/analises/16k-impacto-alcance.html` | Relatório em duas folhas A4. Fonte única — o PDF sai dele. Tipografia da marca embutida em woff2 (Poppins e Fraunces, subconjunto latino), para não depender de rede. |
| `docs/analises/Qyra-Saude-projecao-16k.pdf` | Saída em PDF, 2 páginas A4, gerada por Chromium `--print-to-pdf`. |
| `docs/contas/qyra-saude.md` | Este arquivo. |

Como regerar o PDF a partir do HTML:

```sh
CHROME=/opt/pw-browsers/chromium-*/chrome-linux/chrome
# o HTML é conteúdo de <body>: precisa do envelope antes de imprimir
{ printf '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body>'
  cat docs/analises/16k-impacto-alcance.html
  printf '</body></html>'; } > /tmp/print.html
"$CHROME" --headless --no-sandbox --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=docs/analises/Qyra-Saude-projecao-16k.pdf \
  --virtual-time-budget=8000 file:///tmp/print.html
```

### O que o cliente pediu para tirar do relatório

Pedido explícito, em agosto de 2026, ao revisar a primeira versão: metade do
texto, mais visual, **sem** detalhamento de campanhas e conjuntos, **sem** o
bloco de ressalvas em lista, **sem** roteiro de execução, **sem** lista de
fontes, e com a parte de IA reduzida. O conteúdo cortado continua aqui neste
dossiê — foi tirado da peça de entrega, não descartado.

---

## 10. Padrão visual das entregas

Segue `docs/design-system.md`. Para peças de dados:

- Cores da marca: Dark Purple `#2F2535`, Lilac `#9D5CC1`, Sage `#789180`,
  Silver Purple `#D7D2E1`.
- **Paleta de série** (ordem fixa, a cor pertence ao canal, nunca é ciclada):
  `#9D5CC1` Meta · `#4E9E76` Google · `#C96A24` Analytics · `#4A79D1` Orgânico.
  Validada nas superfícies `#FFFFFF` e `#2F2535` com
  `scripts/validate_palette.js` do skill *dataviz*.
- O Sage `#789180` **reprova** como cor de série (croma abaixo do piso, lê como
  cinza). Serve para superfície e detalhe de interface, não para gráfico.
- Tipografia: Gilroy (substituto livre: Poppins) para interface e números;
  Larken itálico (substituto livre: Fraunces itálico) para títulos.
- Nunca eixo duplo. Em peça impressa não há hover — todo gráfico precisa de
  rótulo direto.
