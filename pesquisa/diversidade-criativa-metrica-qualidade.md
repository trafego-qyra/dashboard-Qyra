# Diversidade criativa como métrica de qualidade no Meta Ads

**Conta de referência:** Qyra Saúde (`act_1610215746739005`) · **Data da apuração:** 2026-08-20
**Escopo:** o que a Meta mede, o que ela apenas recomenda, o que é evidência de terceiro e o que é folclore de mercado.

---

## 1. A pergunta, respondida de uma vez

Não. A Meta **não** expõe nenhuma métrica, coluna ou pontuação chamada "creative diversity" / "diversidade criativa". Qualquer "Creative Diversity Score" numérico que circula no mercado é construto de fornecedor (DatAds, SuperAds, DatAlly, AdMetrics), não da Meta.

Mas a resposta é "em parte", e a parte importa: o **conceito** existe na documentação oficial sob outros nomes e é operado pela plataforma. A Meta nomeia **"creative similarity"** como insight de criativo em Account Insights — "creative similarity occurs when the images or videos in your ads appear too visually identical. this can lead to creative fatigue and increase your cost per result" ([help/1784925068944145](https://www.facebook.com/business/help/1784925068944145)) — e publica **"creative limited" / "creative fatigue"** como status da coluna de Entrega com limiar quantitativo (2x o custo por resultado histórico). O que não existe é um **número somável de diversidade** que se possa puxar como coluna, filtrar ou otimizar. Diversidade criativa, hoje, é insumo de recomendação e diagnóstico qualitativo — não KPI de qualidade.

---

## 2. O que a Meta realmente mede

### 2.1 A família que existe: Ad relevance diagnostics

Nome pt-BR: **Diagnósticos de relevância do anúncio**. Substituiu o antigo *relevance score* (aposentado em 2019). São três dimensões — a própria Meta as chama de dimensões de **relevância**, não de "qualidade de criativo"; qualidade é apenas uma das três.

| Métrica (en / pt-BR) | O que mede (definição da Meta) | Escala | Onde aparece | É diversidade criativa? |
|---|---|---|---|---|
| **Quality ranking** / Classificação de qualidade | "how your ad's perceived quality compared to ads competing for the same audience" | 5 valores: above average · average · below average (bottom 35%) · below average (bottom 20%) · below average (bottom 10%). "average" = percentil 35 a 55 | Ads Manager; ferramenta `ads_insights_auction_ranking_benchmarks` | Não |
| **Engagement rate ranking** / Classificação da taxa de engajamento | "expected engagement rate compared to ads competing for the same audience" — probabilidade de clicar, reagir, comentar, compartilhar ou expandir. É **previsão**, não realizado | Mesma escala de 5 valores | Idem | Não |
| **Conversion rate ranking** / Classificação da taxa de conversão | "expected conversion rate compared to ads with the **same optimization goal** competing for the same audience" | Mesma escala de 5 valores | Idem | Não |
| **Ad quality** (componente do leilão) | Sinal que entra no `total value` do leilão junto com lance e estimated action rates | Não exposto numericamente | Não exposto; efeito visível em custo e entrega | Não |
| **Opportunity score** / Pontuação de oportunidade | "how many meta ads manager recommendations you apply, ranked by estimated performance impact" | 0 a 100, **sempre nível de conta** | Account Overview, aba Campaigns, API | Não — mede aderência a recomendações |
| **Campaign score** | Preditivo, por campanha, antes de publicar | 0 a 100 | Criação de campanha | Não |
| **Creative fatigue / Creative limited** | Rótulo de entrega quando o público viu o mesmo anúncio vezes demais | Rótulo binário com corte de custo | Coluna Delivery | **Adjacente** — mede repetição, não diversidade |
| **Creative similarity** | "the images or videos in your ads appear too visually identical" | Insight qualitativo, sem escala publicada | Account Insights (Ads Reporting) | **É o mais próximo que existe** |
| **Top creative themes** | Terceiro insight de criativo do mesmo artigo | Não documentado em detalhe | Account Insights | Parcialmente |
| **Ad creative breakdown** / breakdowns por ativo | Reprojeta métricas normais por headline, texto, CTA, imagem/vídeo | Não é métrica — é dimensão | Ads Reporting e Insights API | Não — o cálculo é do analista |
| **Distribution score** | Desempenho de **posts orgânicos** da Página | 0-100 | Meta Business Suite | Não — nem é métrica de anúncio |

### 2.2 Limites operacionais que qualquer painel precisa respeitar

- **Piso de 500 impressões.** "ad relevance diagnostics aren't available for ads with fewer than 500 impressions" ([help/403110480493160](https://www.facebook.com/business/help/403110480493160)).
- **Janela de 35 dias** para os três rankings.
- **Indisponíveis para dynamic creative.** E engagement/conversion rate ranking também são indisponíveis para os optimization goals *ad recall lift, impressions, reach, custom conversions e value*.
- **São relativos, não absolutos.** A comparação é contra concorrentes na mesma coorte. Na API, a coorte é declarada por três eixos: Optimization Goal, Optimized Event e Audience Type.

### 2.3 O ponto contra-intuitivo — e a correção necessária

A Meta afirma literalmente: **"ad relevance diagnostics aren't inputs into the ad auction"** e **"optimize for your advertising objectives, not for quality ranking, engagement rate ranking or conversion rate ranking"** ([help/436113280262012](https://www.facebook.com/business/help/436113280262012)).

**Verificação: parcial.** Isso é verdadeiro sobre o *número reportado*, e enganoso sobre o *sinal por trás dele*. A mesma documentação diz que o vencedor do leilão é o maior `total value = bid + estimated action rates + ad quality` ([help/430291176997542](https://www.facebook.com/business/help/430291176997542)), que "the ad quality component of an ad's total value may be relatively low" quando o criativo tem atributos ruins ([help/1767120243598011](https://www.facebook.com/business/help/1767120243598011)) e que "ads with a lower quality ranking tend to cost more" ([help/423781975167984](https://www.facebook.com/business/help/423781975167984)).

Formulação correta: **o quality ranking é um termômetro ordinal e defasado do mesmo sinal de ad quality que entra no leilão.** Serve para diagnosticar anúncio ruim; não serve como alvo de otimização quando o anúncio já entrega. A Meta nunca publicou estudo causal ligando ranking a custo — o elo é arquitetural (por desenho do leilão), e a linguagem empírica dela é explicitamente correlacional: "high relevance is correlated with high performance, but it's not the only reason for high performance".

Duas ressalvas adicionais que o mercado costuma omitir:
1. **Quality ranking não é métrica de criativo em sentido estrito.** Os sinais incluem `landing page bounce rate`, `landing page dwell time`, `hide ad`, `report ad` e — o único ponto onde repetição alimenta qualidade diretamente — **`hide ad due to repetition`** ([help/1767120243598011](https://www.facebook.com/business/help/1767120243598011)). Um criativo idêntico pode ranquear diferente por causa da página, do domínio ou da conta.
2. **Efeito de entidade.** "if you repeatedly post policy-violating or lower quality ads, our systems may start considering all ads from your page, domain, ad account or other associated entities as lower quality" ([help/423781975167984](https://www.facebook.com/business/help/423781975167984)).

### 2.4 O único limiar numérico publicado sobre repetição de criativo

Artigo "Creative fatigue recommendations in Meta Ads Manager" ([help/1346816142327858](https://www.facebook.com/business/help/1346816142327858)), texto recuperado íntegro em 2026-08-20:

> "when we believe that your audience has seen the same ad too many times, you will see creative limited or creative fatigue in the delivery column status... we consider all recent exposures of the ad's image or video, **including those from other campaigns from your page**. we also consider your ad's cost per result. when cost per result is **more than ads you ran in the past but less than twice as much**, you will see a **creative limited** status. when cost per result is **more than or equal to twice as much**, you will see a **creative fatigue** status."

E, antes de publicar: "if we predict creative fatigue may occur in the first 7 days of your campaign, we will warn you before you publish your ad". A ação recomendada usa a expressão mais próxima de exigir diversidade que a Meta publica: **"create a new ad with a new image or video that is materially different from the original creative"**.

**Verificação: parcial — quatro ressalvas que mudam o uso prático.**
1. **Elegibilidade restrita.** "this feature is only available for ad sets with one creative **except** those with advantage+ catalog ads, dynamic creative, or meta advantage+ app campaigns. it is not available with the sales objective before an ad set is active." Isso exclui boa parte das contas modernas. (Blogs de agência reproduzem esse trecho invertido, trocando o "except" por "ou" — não use fonte secundária aqui.)
2. **O gatilho não é custo.** O gatilho é a exposição; o custo por resultado apenas decide **qual dos dois rótulos** aparece. Não existe "corte de fadiga por custo por resultado" isolado.
3. **Baseline indefinido.** "ads you ran in the past" não tem janela, escopo nem estatística declarada em lugar nenhum. A regra do dobro **não é reproduzível nem auditável por fora**, e contas ou eventos novos sem histórico não recebem aviso.
4. **É sinal de UI, não programático.** Não há campo `creative_fatigue`, `creative_limited` nem `delivery_status` acessível nesta superfície de API.

---

## 3. Evidência de produto: o que a API devolveu

### 3.1 A leitura da conta Qyra Saúde

`ads_get_opportunity_score`, `act_1610215746739005`, 2026-08-20:

- **opportunity_score = 91** (escala 0-100, sempre nível de conta)
- **Recomendação 1** — `aplusc_standard_enhancements_bundle`, 8 anúncios, `opportunity_score_lift = 7`, `lift_estimate = "Redução de 3% no custo por resultado"`. Texto: *"Veicularemos diferentes variações do criativo do seu anúncio quando houver probabilidade de melhorar o desempenho com: retoques visuais, melhorias no texto, adicionar sobreposições e mídia flexível."*
- **Recomendação 2** — `music`, 4 anúncios, `opportunity_score_lift = 2`, `lift_estimate = "Taxa de cliques mais alta"`.

Em uma segunda conta consultada ao vivo (`act_1181570894013658`, score 73), apareceu o tipo `gen_ai_mvp` (lift 1, disparado para oito anúncios distintos), com o texto mais explícito encontrado em toda a pesquisa: *"**Aumente a variedade dos criativos** dos seus anúncios usando suas imagens de produtos ou estilo de vida para criar imagens geradas por IA"*, com `lift_estimate = "Taxa de cliques 10% mais alta"`.

### 3.2 O que isso prova

- Que a Meta **pontua e hierarquiza variação de criativo como alavanca**, com unidade própria (`opportunity_score_lift`, que a documentação da ferramenta manda chamar de "pontos") e estimativa de efeito atrelada.
- Que existem pelo menos três tipos distintos de recomendação de criativo com pontuação diferente: `aplusc_standard_enhancements_bundle` (7), `music` (2), `gen_ai_mvp` (1).
- Que a recomendação é emitida **por anúncio**, mas a pontuação que ela alimenta é **de conta**.

### 3.3 O que isso não prova

- **Não é métrica de qualidade.** A própria Meta: *"Opportunity score (including a high score) itself does not reflect your actual or future performance... Opportunity score is in development and may evolve"* ([help/804913634782260](https://www.facebook.com/business/help/804913634782260)). E a documentação da ferramenta diz explicitamente: *"Do NOT use when the user needs ad-level creative feedback."*
- **Não é diversidade medida.** Uma recomendação pontuada diz "aqui cabe mais variação"; ela não mede quanta variação você já tem, não compara criativos entre si e não devolve nenhum índice.
- **`lift_estimate` não é efeito causal medido na conta.** É estimativa modelada a partir de anunciantes similares. Os 3% de redução no custo por resultado e os 10% de CTR não foram medidos na Qyra.
- **91 não é nota de criativo.** É aderência a recomendações. Nas duas contas testadas, os maiores lifts nem sempre são de criativo — na conta de comparação, os topos eram `capi_performance_match_key_v2` (7) e `capi_event_coverage` (3), ambos de dados/sinal.

### 3.4 O que a API mede de fato sobre variação dentro de um anúncio

Confirmado empiricamente: `ads_get_ad_entities` com `breakdowns=[image_asset]` abriu **um único anúncio** (`120257177846620595`, `creative_id 1035298409501746`) em **dois ativos de imagem distintos**, com entrega desigual — 273 impressões / CTR 1,47% contra 812 impressões / CTR 1,35%. A Meta distribui impressões de forma desigual entre variações e mede cada uma separadamente.

Três limites duros:
- O breakdown **só reprojeta métricas comuns** (impressions, clicks, ctr, spend). Não devolve nenhuma métrica de qualidade nem de diversidade. Quem calcula diversidade é o analista.
- **Apenas um breakdown por chamada.** Não dá para cruzar `image_asset` com `body_asset` — a matriz imagem × texto é inacessível por essa via.
- **A diferença observada está dentro do ruído.** Com 273 e 812 impressões, 1,47% vs 1,35% não sustenta conclusão. O que se sustenta é **estrutural**: a API mede por ativo.

### 3.5 Aviso metodológico obrigatório

Enumerar o catálogo de campos e concluir ausência **é método inválido**. `ads_get_field_context` devolve `quality_ranking`, `engagement_rate_ranking` e `conversion_rate_ranking` em `unknown_fields` — e essas três métricas **existem oficialmente**, documentadas com faixas percentuais, e foram retornadas ao vivo por `ads_insights_auction_ranking_benchmarks`. Portanto: `unknown_fields` neste conector diz o que **este catálogo** expõe, não o que a Meta tem. Qualquer prova de inexistência baseada só nisso deve ser descartada.

---

## 4. O mecanismo: por que variedade afeta entrega

| O que a Meta **afirma** | O que ela **demonstra com número** | O que é **leitura de mercado** |
|---|---|---|
| Volume maior de criativos permite escolher "o criativo certo" por pessoa | Nenhuma curva "N criativos → X% de ganho" foi publicada. Nenhuma. | Que existe um número ótimo de criativos por conjunto |
| Andromeda foi construído para "address the scalability challenges presented by the exponential growth of creatives" | Andromeda: **+6% recall** no retrieval e **+8% ads quality** "on selected segments"; **10.000x** de aumento na complexidade dos modelos de recuperação (confirmado em earnings call Q4/2024) | Que o +8% seja efeito da diversificação feita pelo anunciante — não é: é ganho do sistema de recuperação |
| Lattice generaliza aprendizado entre objetivos e superfícies | **~12%** de alta em ad quality, **até 6%** em conversões, **20%** de economia de infraestrutura | Que isso valide estratégia de criativo do anunciante |
| GEM aprende de "a diverse array of ads data including... creative formats" | **+5%** conversões no Instagram, **+3%** no Facebook Feed (Q2); GEM + sequence learning: **+3,5%** cliques FB e **>1%** conversões IG (Q4/2025) | Idem |
| Advantage+ creative "shows a personalized variation to each account center account based on what they're most likely to respond to" | Advantage+ standard enhancements: **-4%** no custo por resultado — sem amostra, período ou desenho publicados, e sem verificação independente | Que ligar Advantage+ substitua estratégia de criativo |
| Recomendações de creative fatigue são "experimentally proven" | Nenhuma metodologia, amostra ou tamanho de efeito publicados | Que o rótulo de fadiga seja preditivo e não atrasado |

### 4.1 O que a documentação prescreve, e o quanto disso ainda vale

A prescrição oficial mais explícita sobre diversidade está em "About managing ad volume" ([help/2720085414702598](https://www.facebook.com/business/help/2720085414702598)):

> "Decrease ads per ad set, but maintain **diverse creative assets** per ad set. One ad can contain multiple (up to 10) creative assets."

Racional declarado (não medido): *"each time an ad is shown, our ads delivery system learns more... when an advertiser runs too many ads at once, each ad delivers less often. this means that fewer ads exit the learning phase, and more budget is spent before the delivery system can optimize performance."* A learning phase termina "usually after about 50 results in the week after the ad set's last significant edit" ([help/112167992830700](https://www.facebook.com/business/help/112167992830700)).

**Verificação: parcial.** A direção — *reduzir fragmentação, não reduzir diversidade* — é fiel ao artigo. Mas:

1. **A fonte é costurada.** Os "50 resultados" estão em outro artigo, e o "thousands of creatives" está em [help/766697140509126](https://www.facebook.com/business/help/766697140509126), onde a frase é **condicionada** e não pode ser truncada: *"advertisers of all sizes can still use thousands of creatives, **but** ad limits ensure that advertisers use the most effective tools to do so."* O que reconcilia teto e volume é uma regra de contagem: *"each dynamic creative ad, meta advantage+ placements ad, or advantage+ catalog ad counts as just one ad — even when that ad uses many creatives."*
2. **Causalidade não medida.** Nenhum estudo, amostra, contrafactual ou tamanho de efeito. A própria Meta reserva a expressão "experimentally proven" para outras recomendações e **não a usa aqui**.
3. **O veículo caducou.** O "até 10 assets" vivia no dynamic creative (bloqueado para *sales* e *app promotion* desde junho/2024) e no flexible ad format, que segundo a Meta *"starting in march 2026... will no longer be available in ad setup"* — prazo vencido há ~5 meses nesta data. O artigo continua no ar recomendando dynamic creative enquanto seu próprio banner o declara indisponível. **Ele se contradiz.** O caminho vivo hoje é Advantage+ Creative.

### 4.2 Conclusão de mecanismo

A evidência sustenta que diversidade criativa **não age como nota de qualidade**. Ela age como **ampliação do espaço de candidatos na etapa de recuperação**: o Andromeda foi construído para escalar o índice diante do crescimento exponencial de criativos, e o Advantage+ Creative escolhe por pessoa a variação com maior probabilidade de resposta. O ganho vem de melhor casamento criativo-pessoa — o "creative/targeting fit" que a própria Meta descreve: *"rather than seek the ideal creative or the ideal targeting, seek the ideal creative/targeting fit. the ideal creative for one audience might not be the ideal creative for a different audience."*

**Armadilha registrada:** o achado de engenharia da Meta *"sequence diversity beats sequence homogeneity"* refere-se a **sequências de ações do usuário** no ranking, não a diversidade de criativo. É citado errado com frequência.

---

## 5. O que os dados de terceiros mostram — e o que é folclore

### 5.1 O que sobrevive à verificação

**Motion Creative Benchmarks 2026** — estudo **proprietário** de um fornecedor de software de criativo, **não auditado por terceiro**. Amostra declarada: US$ 1,29 bi em verba Meta, 578.750 criativos, 6.015 contas.

**Correções obrigatórias sobre como esse estudo circula (verificação: parcial):**

- **A janela é de 4 meses, não de um ano:** 1/set/2025 a 1/jan/2026. A própria Motion descreve como "one of the most competitive promotion cycles of the year, covering pre-holiday testing, Black Friday and Cyber Monday, and the post-holiday reset". **Não serve de linha de base anual.**
- **Dois denominadores, não um.** A manchete da própria Motion é **~5% dos criativos** (base agrupada). As taxas por faixa — Micro ~3,7-3,8% · Small 6,2% · Medium 7,3% · Large 8,1% · Enterprise 8,2% — são **média não ponderada entre contas** ("each account contributes equally regardless of size"). Citar "~7,7% dos criativos" funde os dois. Não faça isso.
- **"Vencedor" é gasto, não resultado.** Definição real: criativo que consome **≥10x a mediana de gasto da conta E ≥US$ 500 no total**. E a Motion declara: *"The report does not tie outcomes to ROAS, revenue, or conversion — it examines where Meta's auction actually allocates budget within accounts."* Um criativo pode ser "vencedor" e queimar dinheiro.
- **A subida por faixa é provavelmente artefato.** O piso absoluto de US$ 500 pesa desproporcionalmente contra contas pequenas, e contas com menos de 10 criativos na janela foram **excluídas**.
- **A própria fonte nega a leitura causal:** *"Volume creates more chances to surface a winner — the per-creative odds don't change"* e *"hit rate alone is a poor measure of creative quality."* Produzir mais não melhora a probabilidade por criativo; compra mais sorteios.

O que resta utilizável, com esses avisos:

| Indicador | Micro | Small | Medium | Large | Enterprise |
|---|---|---|---|---|---|
| Criativos novos/semana (mediana) | 2,80 | 4,10 | 6,67 | 11,24 | 18,85 |
| Criativos novos/semana (top 25%) | 4,83 | 8,09 | 15,95 | 31,11 | 54,64 |
| Taxa de acerto (não ponderada) | ~3,7-3,8% | 6,2% | 7,3% | 8,1% | 8,2% |
| % da verba concentrada em vencedores | 23% | — | — | — | 64% |

Perdedores (desligados antes do dia 28): 50-53% do total. No agregado: ~55% da verba vai para vencedores, 28% para medianos, 17% para perdedores.

**Saúde e bem-estar:** taxa de acerto 3,85% e volume mediano 3,3 criativos/semana — declarado como "unweighted average across **141 accounts**". Base fina, amostra global, **sem recorte Brasil**.

**Conflito de interesse a declarar:** a Motion vende software de análise de criativo para times que produzem criativo em volume. A conclusão "produza mais" é comercialmente conveniente. Não há auditoria independente — mas também não há validação independente.

### 5.2 Folclore — não use como base de decisão

| Alegação que circula | Status |
|---|---|
| "Creative Similarity Score" da Meta, com supressão acima de 60% e alvo abaixo de 40% | **Sem fonte primária.** Nenhum artigo oficial da Meta contém score numérico de similaridade. O rótulo "Creative Diversity Score" só existe em ferramentas de terceiros |
| AdEspresso: acima de frequência 4, CTR -23,34% e CPC +68,02%; frequência 9, CPC +161,15% | **Folclore.** Nenhuma publicação primária, amostra ou período localizáveis |
| "Estudo de 4,2M impressões em 2025"; "92 contas D2C indianas: CTR -28% acima de freq. 3,5" | **Folclore.** Sem autor, metodologia ou publicação |
| Meia-vida do criativo = 22 dias (média 31) | **Sem metodologia rastreável.** Ordem de grandeza, no máximo |
| Hook rate e hold rate como "métricas da Meta" | **Não são nativas.** São razões derivadas pelo anunciante (ex.: `3_second_video_plays / impressions`) |
| "Lift de 46% da Meta" citado como prova de Advantage+ ou de diversidade criativa | **Métrica errada.** Os 46% são de **atribuição incremental**, medidos em 37 conversion lift studies com 30 anunciantes e 8 verticais, jul-out/2024 |
| "3-5 anúncios por conjunto" / "8-15 anúncios, guidance interno da Meta" | Recomendação de agência repetida. O único número oficial é a regra dos ~50 resultados da learning phase |
| Benchmark de hook/hold/ThruPlay para saúde e bem-estar **no Brasil** | **Não existe.** Zero fontes com amostra e metodologia. Quem apresentar um, extrapolou |
| Nielsen/NCS: "criativo = 47% (ou 49%) do impacto de vendas" | Decomposição aditiva de sistema com interações fortes, com criativo definido **por resíduo**. A própria Nielsen admite que contexto e criativo são inseparáveis; Byron Sharp chama a família inteira desses estudos de "creative accounting". Além disso, é sobre **qualidade** criativa, não sobre **diversidade** |

---

## 6. O que a ciência de publicidade diz

**Existe base teórica sólida para variar execução. Não existe base empírica para "diversidade" como escalar.**

**A favor da variedade:**
- **Curva de wear-in/wear-out em U invertido** é consenso desde os anos 80. Pechmann & Stewart (1988) situam o wear-in nas primeiras ~3 exposições; o mecanismo dominante é o Two-Factor Model de Cacioppo & Petty (habituação positiva + tédio negativo).
- **Encoding variability** — Unnava & Burnkrant, *Journal of Marketing Research* 28(4), 1991, p.406-416: repetir **execuções variadas** produz memória de marca superior a repetir a mesma execução, e o efeito persiste com atenção controlada. É a evidência experimental mais limpa a favor de variar execução.
- **Habituação é específica ao estímulo.** Rankin et al., *Neurobiology of Learning and Memory*, 2009: "presentation of a different stimulus results in an increase of the decremented response to the original stimulus". É o mecanismo psicológico pelo qual um criativo novo recupera atenção.
- **Ressalva do mesmo paper:** "upon repeated application of the dishabituating stimulus, the amount of dishabituation produced decreases". Trocar criativo funciona, mas trocar sempre rende cada vez menos — argumento teórico contra "diversidade infinita".

**Contra a leitura simplista:**
- **"Diversidade" não é variável bem definida.** Schumann, Petty & Clemons, *Journal of Consumer Research* 17(2), 1990: variação **cosmética** (cor, cenário, modelo) funciona melhor com baixa motivação de processamento; variação **substantiva** (muda o argumento) funciona melhor com alta motivação. Efeitos **opostos**. Um índice escalar único apaga exatamente a distinção que a literatura diz ser a que importa.
- **Qualidade pode substituir rotação.** Chen, Yang & Smith, *Journal of the Academy of Marketing Science* 44(3), 2016 — experimento 2x2x3 entre-sujeitos: anúncios de alta divergência **e** alta relevância fazem wear-in imediato e "show little sign of wearing-out even over repeated exposures". O U invertido clássico só apareceu em anúncios de baixa divergência e baixa relevância. **Rotacionar criativo ruim não vira criativo bom.**
- **Existe alternativa à diversidade: espaçamento.** Sahni, *Quantitative Marketing and Economics* 13(3), 2015: espalhar exposições no tempo aumenta probabilidade de compra, mesmo afastando anúncios da ocasião de compra.
- **Consistência compõe.** System1 + IPA ("Compound Creativity"): marcas mais consistentes tiveram Star Rating médio 3,3 contra 2,8 (medianamente consistentes) e 2,6 (menos consistentes), e após 5 anos crescem participação de mercado mais que o dobro. Romaniuk (Ehrenberg-Bass), 4º mandamento dos Distinctive Brand Assets: **"Resist change — make 'no' your default setting for changing an asset."**

**A referência mais citada, e por que ela não prova o que dizem que prova (verificação: parcial):**
Braun & Moe, *Marketing Science* 32(5), 2013, p.753-767 (DOI 10.1287/mksc.2013.0802), reportam +12,7% em visitas esperadas e +13,8% em conversões esperadas ao variar o criativo conforme o histórico de exposição do indivíduo. **Isso não é evidência causal.** O próprio abstract diz "**simulation results** suggest". São contrafactuais dentro de um modelo bayesiano estimado sobre dados **observacionais** de **uma única** campanha de display de uma montadora, com 5.803 indivíduos, rodada entre 15/jun e 23/ago de **2009**, sem randomização da entrega. Dois problemas adicionais: o "restoration" do modelo é recuperação por **pausa/tempo**, não desabituação por troca de estímulo; e o contrafactual simulado — escolher o criativo por indivíduo conforme histórico — é exatamente o que o Advantage+ Creative já faz automaticamente hoje, o que sugere que o ganho já está internalizado na plataforma.

**A síntese honesta:** varie a **execução**, congele os **ativos distintivos**. Uma métrica de diversidade útil teria de medir diversidade de execução **com penalidade para deriva de ativo de marca**. Nenhuma métrica pública faz isso hoje.

---

## 7. Como transformar diversidade criativa em métrica de verdade

Como a Meta não entrega pontuação pronta, o caminho é construir indicadores derivados de campos que a Insights API de fato devolve: `impressions`, `clicks`, `ctr`, `cpm`, `frequency`, `amount_spent`, `creative_id`, `date_start/date_stop`, os campos de vídeo (`video_p25..p100_watched_actions`, `video_thruplay_watched_actions`) e os breakdowns por ativo. Os três rankings vêm pela ferramenta `ads_insights_auction_ranking_benchmarks`, não pelo catálogo de campos.

**Aviso que precisa acompanhar o painel inteiro:** todos os limiares abaixo são **arbítrio inicial a calibrar contra a própria conta**, exceto onde marcado como oficial. A literatura e a evidência de mercado disponíveis não fornecem cortes universais.

### 7.1 Conceitos vivos (`N_live`)

- **Fórmula:** contagem de `creative_id` distintos com `amount_spent ≥ p` nos últimos 7 dias, agregados por **conceito** (mapeamento manual de `creative_id` → conceito; variações de aspect ratio e recorte não contam como conceito novo).
- **API:** `ads_get_ad_entities`, `level=ad`, `date_preset=last_7d`, campos `creative_id`, `amount_spent`, `impressions`.
- **Limiar:** alerta se `N_live < 3`. **Arbítrio.** O único ancoramento externo é o volume mediano de 3,3 criativos novos/semana em saúde e bem-estar (Motion, 141 contas, global) — que é volume de *produção*, não de conceitos *vivos*. Calibrar.

### 7.2 HHI de concentração de verba por criativo

- **Fórmula:** `HHI = Σ (spend_i / spend_total)²`, sobre criativos ativos nos últimos 30 dias. Varia de ~0 (verba pulverizada) a 1 (tudo em um criativo).
- **API:** mesmo pull do item anterior com `date_preset=last_30d`.
- **Limiar:** `HHI > 0,50` = concentração alta; `HHI < 0,15` = pulverização (risco de fragmentação de aprendizado). **Arbítrio, com ressalva importante:** os dados da Motion mostram que a concentração de verba em poucos criativos **sobe naturalmente com a escala da conta** (23% → 64%). Concentração alta não é necessariamente defeito — é comportamento do leilão. Trate como sinal de fragilidade (dependência de um único ativo), não como erro de gestão.

### 7.3 % da verba no top-1 criativo

- **Fórmula:** `max(spend_i) / spend_total`, últimos 30 dias.
- **Limiar:** alerta acima de 60%. **Arbítrio.** É o indicador de risco de ruptura: se o criativo dominante entrar em fadiga, a conta inteira entra junto. Deve ser lido junto com o item 7.5 (idade).

### 7.4 Taxa de renovação mensal

- **Fórmula:** `spend em criativos cuja primeira entrega ocorreu nos últimos 30 dias / spend_total dos últimos 30 dias`.
- **API:** requer histórico próprio de primeira data de entrega por `creative_id` — a API não devolve "idade do criativo". **Persistir isso no banco do dashboard é pré-requisito.**
- **Limiar:** alerta abaixo de 20%. **Arbítrio**, ancorado apenas na ordem de grandeza de meia-vida de criativo que circula sem metodologia. Calibrar contra a curva real da conta.

### 7.5 Idade mediana ponderada por verba

- **Fórmula:** mediana de `(hoje − data_primeira_entrega_i)` ponderada por `spend_i`.
- **Limiar:** cruzar com frequência. Alerta quando idade ponderada > 30 dias **e** frequência crescente **e** CPM crescente simultaneamente. Nenhum dos três isolado é diagnóstico.

### 7.6 Frequência média ponderada

- **Fórmula:** campo `frequency` (existe no catálogo, tipo FLOAT, disponível em ad_account / campaign / adset / ad), ponderado por impressões.
- **Limiar:** **não use limiar de terceiro.** Todos os cortes que circulam (4, 3,5, 5,0) são folclore sem publicação primária. O caminho honesto é levantar a curva `frequency × CPA` da própria conta ao longo de 90 dias e achar o joelho dela. Até lá, use frequência como **variável de contexto**, não como gatilho.

### 7.7 Proxy de similaridade: dispersão intra-anúncio por ativo

- **Fórmula:** coeficiente de variação do CTR entre `image_asset` (ou `body_asset`) do mesmo anúncio. `CV = desvio_padrão(ctr_asset) / média(ctr_asset)`.
- **API:** `ads_get_ad_entities` com `breakdowns=["image_asset"]`, uma chamada por breakdown (a API aceita **apenas um** por chamada).
- **Leitura:** CV muito baixo com impressões suficientes sugere que os ativos são funcionalmente intercambiáveis — sinal indireto de baixa diversidade real.
- **Limiar:** exigir **mínimo de 1.000 impressões por ativo** antes de calcular. Abaixo disso o número é ruído — como demonstrado na própria conta Qyra (273 vs 812 impressões, CTR 1,47% vs 1,35%: diferença sem significado).

### 7.8 Distribuição dos rankings de qualidade

- **Fonte:** `ads_insights_auction_ranking_benchmarks`. Devolve, por anúncio, `Quality Ranking`, `Engagement Rate Ranking`, `Conversion Rate Ranking`, um campo textual `Diagnosis` e o `Cohort Info` (Optimization Goal, Optimized Event, Audience Type).
- **Indicador:** % da verba em anúncios com **algum** ranking em "below average", por dimensão.
- **Regra de priorização — esta é oficial, não arbítrio:** *"It's more impactful to move a ranking from low to average than it is to move a ranking from average to above average, so focus on improving low rankings"* ([help/436113280262012](https://www.facebook.com/business/help/436113280262012)).
- **Mapa de ação, também oficial:** quality ranking baixo → problema de **criativo**; engagement baixo → criativo mais engajante; conversion baixo → **CTA e experiência pós-clique**.
- **Não transforme em meta.** A Meta: *"sometimes high performing ads have below average ad relevance diagnostics rankings and that's ok."*

### 7.9 Cobertura de diagnóstico (indicador de confiabilidade do próprio painel)

- **Fórmula:** `% da verba em anúncios com ≥500 impressões nos últimos 35 dias`.
- **Por quê:** abaixo de 500 impressões os rankings não existem; fora da janela de 35 dias, também não; em dynamic creative, também não. **Limiar oficial, não arbítrio.**
- **Limiar de alerta:** se a cobertura cair abaixo de 50%, o painel de qualidade está cego para metade do dinheiro e não deve ser usado para decisão.

### 7.10 O que este conjunto **não** entrega, e o substituto honesto

Nenhum desses indicadores mede **similaridade semântica ou visual** entre criativos. Para isso, o ferramental existe — similaridade de cosseno entre embeddings, distância média ao centroide, entropia semântica sobre clusters — mas vem da literatura de criatividade/LLM e **não tem nenhuma validação publicada contra resultado publicitário**. É caminho de construção futura, não evidência.

E, para qualquer afirmação de ganho causal por diversificação: **o único caminho válido é teste próprio** — A/B test ou Conversion Lift na conta, com randomização real. Nem a Meta, nem a academia, nem o mercado publicaram a curva que permitiria pular essa etapa.

---

## 8. O que ficou sem resposta

### 8.1 Refutado no caminho (não use estas formulações)

- **"Não existe nada na Meta que meça criativos repetidos."** Refutado. `Creative similarity` é insight nomeado em Account Insights e `creative fatigue` é status oficial de coluna com limiar publicado.
- **"O catálogo de campos da API prova que a métrica não existe."** Método inválido: `quality_ranking` existe oficialmente e retorna `unknown_fields`.
- **"Quality ranking alimenta o leilão"** e o oposto, **"ignore o quality ranking porque não é input do leilão"** — ambos errados. Ver §2.3.
- **"Braun & Moe provaram causalmente +12,7% / +13,8%."** Refutado: são resultados de simulação sobre dados observacionais de 2009, uma campanha, sem randomização.
- **"~7,7% dos criativos viram vencedores" (Motion).** Denominador errado: ~5% é a base agrupada; 7,7% é média não ponderada entre contas.
- **"Vencedores por mês: 0,00 (Micro) a 3,99 (Enterprise)."** **Não localizado em nenhuma fonte.** Trate como não verificado.
- **"Creative Similarity Score da Meta, com corte em 60%/40%."** Sem fonte primária. Invenção de mercado.
- **Todos os números de frequência × CTR/CPC que circulam.** Folclore reciclado sem publicação primária.
- **A prescrição dos "10 assets em um anúncio via dynamic creative / flexible ad format"** está operacionalmente obsoleta em agosto/2026, apesar de o artigo continuar no ar.

### 8.2 Lacunas reais

1. **Não existe métrica publicada de diversidade criativa com fórmula ou limiar** — nem da Meta, nem da academia. A Meta orienta diversificar; não pontua diversidade.
2. **A fórmula do Opportunity Score não é pública**, e não foi possível confirmar com que peso criativo entra nela.
3. **A lista completa de recomendações de criativo dentro do Opportunity Score permanece parcialmente desconhecida.** O artigo "Types of opportunity score recommendations" não pôde ser recuperado; só `creative fatigue` está confirmado por nome na documentação, e `aplusc_standard_enhancements_bundle`, `music` e `gen_ai_mvp` foram observados ao vivo na API.
4. **A documentação não diz se os três rankings existem para o flexible ad format**, que substituiu dynamic creative. Lacuna não resolvida.
5. **O baseline do creative fatigue ("ads you ran in the past") não tem janela, escopo nem estatística definidos.** A regra do dobro não é auditável por fora.
6. **Nenhum estudo mediu o custo da fragmentação de aprendizado.** Existe a regra dos ~50 resultados e recomendações de agência — nada mais.
7. **Nenhum paper da Meta sobre multi-armed bandit para escolha entre variações do mesmo anúncio.** Os papers de bandit/creative optimization encontrados são de terceiros. O mais próximo da Meta é o AdLlama (+6,7% de CTR, p=0,0296, ~35.000 anunciantes, 640.000 variações), que é **geração de texto por RL**, não seleção de criativo.
8. **Nenhum benchmark de hook/hold/ThruPlay para saúde e bem-estar no Brasil** com amostra e metodologia declaradas.
9. **Nenhum teste independente do -4% do Advantage+ Creative.** A Meta afirma, o mercado repete, ninguém verificou.
10. **Nenhum índice acadêmico de diversidade de portfólio criativo validado contra resultado de negócio.** O único paper de fadiga criativa em mídia digital localizado (arXiv 2509.09758) é validado em **dados sintéticos** e mede fadiga de um criativo, não diversidade de portfólio.

### 8.3 Limitações de acesso desta sessão

- **O domínio `qyra.com.br` não pôde ser acessado nesta sessão**, porque a política de rede do ambiente bloqueia o domínio. Nenhuma informação sobre o site, a oferta ou a landing page da Qyra entrou nesta análise.
- **`www.facebook.com`, `pt-br.facebook.com`, `developers.facebook.com`, `engineering.fb.com`, `ai.meta.com`, `arxiv.org`, `motionapp.com`** e a maioria dos domínios acadêmicos retornaram `EGRESS_BLOCKED`. **Nenhuma página web foi aberta diretamente.**
- **O que é fonte primária confiável nesta pesquisa:** todo o conteúdo do Business Help Center veio do endpoint oficial da Meta (`ads_get_help_article`), que retorna o **texto integral** dos artigos com a URL canônica — as citações preservam as palavras exatas, mas o texto vem normalizado em minúsculas. Todos os achados marcados como "produto observado" vieram de chamadas reais à API.
- **O que precisa ser reverificado antes de virar material de cliente:** todos os números de `engineering.fb.com`, `ai.meta.com`, arXiv, earnings calls e Motion vieram de extração de motor de busca, não de leitura da página. São consistentes entre buscas independentes, mas não foram conferidos na fonte.
- **Nenhum dos artigos do Help Center traz data de publicação ou revisão.** Os números (percentil 35-55, piso de 500 impressões, janela de 35 dias, limiar de 2x) só podem ser afirmados como **o texto servido pela Meta em 2026-08-20**.

---

## 9. Fontes

### Meta — documentação oficial (Business Help Center)

| Tema | URL |
|---|---|
| About ad relevance diagnostics | https://www.facebook.com/business/help/403110480493160 |
| About quality ranking | https://www.facebook.com/business/help/303639570334185 |
| About engagement rate ranking | https://www.facebook.com/business/help/2351270371824148 |
| About conversion rate ranking | https://www.facebook.com/business/help/617529305373441 |
| How to use ad relevance diagnostics | https://www.facebook.com/business/help/436113280262012 |
| About ad auctions (total value) | https://www.facebook.com/business/help/430291176997542 |
| About ad quality | https://www.facebook.com/business/help/423781975167984 |
| Best practices to improve ad quality | https://www.facebook.com/business/help/1767120243598011 |
| **About account insights** (creative similarity, creative fatigue, top creative themes) | https://www.facebook.com/business/help/1784925068944145 |
| Creative fatigue recommendations | https://www.facebook.com/business/help/1346816142327858 |
| About opportunity score | https://www.facebook.com/business/help/804913634782260 |
| About campaign score | https://www.facebook.com/business/help/3864826443789572 |
| About managing ad volume | https://www.facebook.com/business/help/2720085414702598 |
| About the learning phase | https://www.facebook.com/business/help/112167992830700 |
| Ad limits per page | https://www.facebook.com/business/help/766697140509126 |
| Limites por ad account | https://www.facebook.com/business/help/652738434773716 |
| About Advantage+ creative | https://www.facebook.com/business/help/297506218282224 |
| Advantage+ creative — previews e placements | https://www.facebook.com/business/help/376490293773516 |
| Advantage+ creative — variações por pessoa | https://www.facebook.com/business/help/1720288338140238 |
| About flexible media | https://www.facebook.com/business/help/1126725172362626 |
| About the flexible ad format (descontinuação mar/2026) | https://www.facebook.com/business/help/835561738423867 |
| Best practices for dynamic creative | https://www.facebook.com/business/help/257326614846024 |
| Ad creative breakdown (Ads Reporting) | https://www.facebook.com/business/help/243916866413404 |
| View ad creative performance | https://www.facebook.com/business/help/325150884947303 |
| Combine ad sets to reduce audience fragmentation | https://www.facebook.com/business/help/2419480091640105 |
| Distribution score (orgânico — não confundir) | https://www.facebook.com/business/help/894478704480648 |
| Advantage+ creative standard enhancements (-4%) | https://developers.facebook.com/blog/post/2023/04/14/advantage-plus-creative-standard-enhancement-API-launch/ |
| Advantage+ creative (Marketing API) | https://developers.facebook.com/docs/marketing-api/creative/advantage-creative |

Nomes pt-BR confirmados por título de URL `pt-br.facebook.com` (confiança média, não por leitura de página): Classificação de qualidade, Classificação da taxa de engajamento, Classificação da taxa de conversão, Diagnóstico de relevância do anúncio, Pontuação de oportunidade.

### Meta — engenharia, pesquisa e relações com investidores

| Tema | URL |
|---|---|
| Meta Andromeda (+6% recall, +8% ads quality) | https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/ |
| Meta Lattice (~12% ad quality, até 6% conversões) | https://ai.meta.com/blog/ai-ads-performance-efficiency-meta-lattice/ |
| Meta Lattice — paper técnico | https://arxiv.org/abs/2512.09200 |
| GEM (+5% IG, +3% FB Feed) | https://engineering.fb.com/2025/11/10/ml-applications/metas-generative-ads-model-gem-the-central-brain-accelerating-ads-recommendation-ai-innovation/ |
| Ads ranking multi-stage / sequence learning | https://engineering.fb.com/2026/08/05/ml-applications/from-user-sequences-to-scaling-laws-a-multi-stage-architecture-for-metas-ads-ranking/ |
| AdLlama (+6,7% CTR, p=0,0296) | https://arxiv.org/abs/2507.21983 |
| Earnings call Q4 2024 (10.000x, 8%) | https://s21.q4cdn.com/399680738/files/doc_financials/2024/q4/META-Q4-2024-Earnings-Call-Transcript.pdf |
| Earnings call Q4 2025 (+3,5% cliques FB) | https://s21.q4cdn.com/399680738/files/doc_financials/2025/q4/META-Q4-2025-Earnings-Call-Transcript.pdf |
| The Creative Advantage — Andromeda (página de marketing) | https://www.facebook.com/business/news/the-creative-advantage-unlocking-the-power-of-diversification-with-meta-andromeda |
| Demystifying Creative Diversification (orientação, não métrica) | https://www.facebook.com/business/news/demystifying-creative-diversification |

### Terceiros com dado declarado

| Tema | URL |
|---|---|
| Motion Creative Benchmarks 2026 | https://motionapp.com/library/research/creative-benchmarks-2026/ |
| Motion — metodologia e definições | https://motionapp.com/thumbstop-pulse/cb2026-methodology-and-definitions |
| Motion — "winners are rare" (~5%) | https://motionapp.com/library/research/creative-benchmarks-2026/winners-are-rare |
| Motion — recorte por vertical (saúde 3,85%) | https://motionapp.com/library/research/creative-benchmarks-2026/testing-by-vertical |
| Haus — os 46% são de atribuição incremental | https://www.haus.io/article/meta-incrementality-testing |
| Nielsen — criativo 47% (com as ressalvas de §5.2) | https://www.nielsen.com/insights/2017/when-it-comes-to-advertising-effectiveness-what-is-key/ |
| Crítica de Byron Sharp ("creative accounting") | https://www.marketingweek.com/creative-dividend-accounting-byron-sharp/ |
| System1 + IPA — Compound Creativity | https://system1group.com/compound-creativity-system1-ipa |
| Ehrenberg-Bass / Romaniuk — "Resist change" | https://marketingscience.info/news-and-insights/the-four-commandments-future-proofing-a-brands-identity |

### Acadêmico

| Referência | URL |
|---|---|
| Unnava & Burnkrant (1991), *JMR* 28(4):406-416 — encoding variability | https://doi.org/10.1177/002224379102800403 |
| Schumann, Petty & Clemons (1990), *JCR* 17(2):192-202 — cosmética vs substantiva | https://fbaum.unc.edu/teaching/articles/Schuman_1990.pdf |
| Braun & Moe (2013), *Marketing Science* 32(5):753-767 — simulação, não causal | https://pubsonline.informs.org/doi/10.1287/mksc.2013.0802 |
| Chen, Yang & Smith (2016), *JAMS* 44(3):334-349 — criatividade e wear-out | https://link.springer.com/article/10.1007/s11747-014-0414-5 |
| Sahni (2015), *QME* 13(3):203-247 — espaçamento temporal | https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2380375 |
| Rankin et al. (2009), *Neurobiology of Learning and Memory* — habituação/desabituação | https://pubmed.ncbi.nlm.nih.gov/18854219/ |
| Pechmann & Stewart (1988) — revisão de wear-in/wear-out | https://www.semanticscholar.org/paper/Advertising-Repetition%3A-A-Critical-Review-of-Wearin-Pechmann-Stewart/5a49ffd4f3444e11074bc34998be6b3b976667a4 |
| Cacioppo & Petty — Two-Factor Model | https://journals.sagepub.com/doi/10.1177/002224378602300106 |
| Lee, Hosanagar & Nair (2018), *Management Science* 64(11) | https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2290802 |
| Shaw (2025), path signature para fadiga criativa — **validado em dados sintéticos** | https://arxiv.org/abs/2509.09758 |
| Medição de diversidade por embeddings (literatura de LLM, sem ponte para vendas) | https://arxiv.org/html/2509.09702v2 |

### Fontes da própria conta (produto observado, sem URL pública)

`mcp__Meta_Ads__ads_get_opportunity_score` · `ads_insights_auction_ranking_benchmarks` · `ads_get_ad_entities` (com `breakdowns`) · `ads_insights_anomaly_signal` · `ads_get_field_context` · `ads_get_help_article` — todas executadas contra `act_1610215746739005` e `act_1181570894013658` em 2026-08-20.