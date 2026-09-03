# Integrações

Sem credencial o painel roda em **modo de demonstração**, com dados fictícios e
um aviso visível em cada tela. Nada quebra — é assim que se desenvolve e se
avalia a interface sem tocar em conta de produção.

## Acesso ao painel

O painel é protegido por **uma senha, compartilhada pela equipe**. Não há
cadastro de usuário: o volume de gente é pequeno e uma lista de contas seria
mais coisa para manter do que para proteger.

| Variável | Obrigatória | O que é |
|---|---|---|
| `QYRA_SENHA` | **em produção** | A senha de acesso |
| `QYRA_SESSAO_SECRET` | não | Chave de assinatura da sessão, quando se quer trocar a senha sem deslogar ninguém |

**Sem `QYRA_SENHA` em produção o painel tranca tudo** e mostra um aviso na tela
de login. É de propósito: uma variável esquecida no painel da Vercel deixaria o
faturamento da empresa aberto na internet sem ninguém perceber, e um erro que se
anuncia é melhor que um vazamento silencioso. Em desenvolvimento, deixar em
branco libera o acesso local.

Quem entra recebe um cookie assinado, válido por **sete dias**. O cookie não
guarda a senha — guarda um prazo de validade e a assinatura HMAC desse prazo,
então nem se extrai a senha dele nem se forja um novo sem a chave.

**Trocar a senha derruba todas as sessões em aberto**, porque a assinatura usa a
própria senha como chave. É o comportamento esperado de uma troca de senha —
tirar acesso de quem não deve mais ter. Se a intenção for outra (rotação de
rotina, sem incomodar ninguém), defina `QYRA_SESSAO_SECRET` e a sessão passa a
depender só dele.

A porta cobre **tudo**: telas, `/api` e os endpoints de diagnóstico. Proteger só
as telas deixaria o dado cru acessível por URL direta, que é o descuido comum
nesse tipo de barreira.

### Trocar a senha

1. Painel da Vercel → Settings → Environment Variables → `QYRA_SENHA`
2. Salve e **faça um novo deploy** — variável de ambiente só entra em vigor no
   próximo build
3. Avise a equipe: todo mundo precisa entrar de novo

`QYRA_FORCE_MOCK=true` força a demonstração mesmo com credencial configurada.

Verifique o que está ativo em **`/api/health`** — ele reporta apenas se a
credencial existe, nunca o valor.

---

## Meta Ads

**API:** Marketing API (Insights) · **Escopos:** `ads_read`

1. Crie um app em [developers.facebook.com](https://developers.facebook.com/) do
   tipo *Business*.
2. Vincule a conta de anúncios ao Business Manager.
3. Gere um **token de longa duração** de usuário do sistema (Business Settings →
   Users → System Users → Generate Token) com `ads_read`.
4. Pegue o ID da conta em Gerenciador de Anúncios (formato `act_1234567890`).

```env
META_ACCESS_TOKEN=EAAG...
META_AD_ACCOUNT_ID=act_1234567890
META_API_VERSION=v21.0
```

Token de usuário do sistema não expira sozinho, mas é revogado se a pessoa sair
do Business. Prefira sempre um usuário do sistema dedicado.

---

## Orgânico (Instagram e Facebook)

**API:** Graph API — Instagram Insights
**Escopos:** `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`

1. Converta o perfil do Instagram em **Conta Comercial** e vincule a uma Página.
2. Adicione a Página ao mesmo app do Meta Ads.
3. Reaproveite o `META_ACCESS_TOKEN`, incluindo os escopos acima.
4. Obtenha o ID do usuário do Instagram:
   `GET /{page-id}?fields=instagram_business_account`

```env
META_IG_USER_ID=17841400000000000
META_PAGE_ID=1234567890
```

**Limite da plataforma:** Insights de conta aceitam janela de no máximo 30 dias
por chamada — o conector quebra períodos maiores em blocos automaticamente.
Sem `instagram_manage_insights` as métricas de conta continuam vindo, mas a
tabela de publicações fica vazia e a tela avisa.

---

## Google Ads e Google Analytics

Ambos usam o **mesmo** OAuth de app instalado. Peça os dois escopos no mesmo
consentimento:

```
https://www.googleapis.com/auth/adwords
https://www.googleapis.com/auth/analytics.readonly
```

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um
   projeto e habilite **Google Ads API** e **Google Analytics Data API**.
2. Crie credencial OAuth 2.0 do tipo *Desktop app*.
3. Gere o **refresh token** com o fluxo de consentimento
   (`access_type=offline&prompt=consent`), pedindo os dois escopos.

```env
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REFRESH_TOKEN=1//0g...
```

### Google Ads — específico

4. Solicite o **developer token** em API Center da conta MCC. Ele nasce com
   acesso *Test* — só lê contas de teste até a aprovação para *Basic*.

```env
GOOGLE_ADS_DEVELOPER_TOKEN=abcdef...
GOOGLE_ADS_CUSTOMER_ID=123-456-7890
GOOGLE_ADS_LOGIN_CUSTOMER_ID=999-888-7777   # o MCC, se o acesso for via gerente
GOOGLE_ADS_API_VERSION=                      # opcional, ver abaixo
```

Os hífens são removidos pelo conector — pode colar como aparece na interface.

### O que a API não entrega

**Informações de leilão.** O relatório que mostra quem mais aparece nas mesmas
buscas não existe na API do Google Ads — nem por GAQL nem por recurso próprio.
Consultas a `auction_insight_*` respondem `BAD_RESOURCE_TYPE_IN_FROM_CLAUSE`, e
o programa de acesso por lista está fechado para novas contas. É dado exclusivo
da interface: Insights → Relatórios → Informações do leilão.

Não há aviso disso na tela, por decisão de quem opera — a limitação fica
registrada aqui.

### O token de desenvolvedor

O token nasce com acesso *Test* e só lê contas de teste. Para ler a conta de
produção é preciso solicitar o **acesso básico** na Central de API da conta
gerente — o token não muda, só o nível de acesso, e a tela vira tempo real
sozinha no carregamento seguinte.

O pedido é analisado por gente, leva dias, e costuma voltar com pergunta por
e-mail antes de ser aprovado. **A pergunta chega no e-mail de contato cadastrado
na Central de API**, e o caso fica parado até alguém responder — sem prazo e sem
cobrança. Vale usar um endereço de função, não o pessoal de quem configurou.

O painel não tem plano B: falha da API sobe como em qualquer canal, a visão
geral registra o erro e a tela do canal diz o que aconteceu. Houve um piso —
os relatórios em CSV exportados da plataforma, congelados num período fixo —
que serviu enquanto o token aguardava aprovação; ele saiu junto com a aprovação,
porque número congelado servido no lugar de dado atual, sem nada na tela dizendo
qual dos dois se está lendo, é pior que uma tela de erro.

Para diagnosticar: `/api/diagnostico/google` traz `tokenDeDesenvolvedor`, que
diz em uma linha se o acesso básico já saiu — e, quando a consulta falha havendo
conta gerente configurada, refaz a mesma consulta sem o cabeçalho, o que separa
"problema de credencial" de "problema de por onde estamos entrando".

**Sobre a versão da API.** Deixe `GOOGLE_ADS_API_VERSION` vazio: o conector
desce uma lista de candidatas e usa a primeira que responder.

Isso existe porque o Google publica cerca de três versões por ano e aposenta
cada uma depois de ~13 meses. Versão aposentada **não devolve erro de API** — a
URL deixa de existir e a resposta é uma página HTML de 404, que na tela parecia
problema de token. O painel ficou meses apontando para uma versão morta por
causa disso.

Para fixar depois de saber qual está viva: abra `/api/diagnostico/google`, veja
a etapa `ads-versao`, e cadastre o valor que ela reporta. Com a variável
preenchida o conector obedece e não sonda.

Se a etapa disser que nenhuma candidata respondeu, a lista em
`VERSOES_CANDIDATAS` (`src/server/connectors/google-ads.ts`) envelheceu e
precisa de uma versão mais nova.

### GA4 — específico

5. Pegue o **ID numérico da propriedade** em Administrador → Detalhes da
   propriedade. Não é o `G-XXXXXXX` (esse é o ID de medição).

```env
GA4_PROPERTY_ID=123456789
```

### Microsoft Clarity — específico

O Clarity responde o que o GA4 não responde: até onde a pessoa rolou, onde
clicou no que não era clicável, onde desistiu.

6. Instale o script no site. A integração nativa com o Tag Manager, dentro do
   Clarity, cria e publica a tag sozinha — **ligar o Clarity ao GA4 ou ao
   Google Ads não instala nada**, apenas cruza os dados.
7. O **Project ID** está na URL do projeto, entre `view/` e `/settings`.
8. O **token da API** sai em Settings → Exportação de dados.

```env
CLARITY_PROJECT_ID=y5l8wdf890   # não é segredo, vai no script público do site
CLARITY_API_TOKEN=...           # este é segredo
```

Sem o token, a seção some da tela do Analytics e o resto continua igual.

**Duas restrições da API moldam o que dá para mostrar:**

| Restrição | Consequência |
|---|---|
| Janela máxima de 3 dias | A seção é uma fotografia recente, não série histórica. Não acompanha o filtro de datas. |
| **10 requisições por projeto por dia** | O conector gasta 2 por atualização — uma geral, uma por URL. O cache vale **6 horas**, o que dá 4 atualizações e 8 chamadas, com 2 de folga para um deploy. A chamada nunca é repetida em erro. |

**A conta do cache não é opcional.** A primeira versão usava 30 minutos, o que
daria até 48 atualizações e 96 chamadas por dia contra um teto de 10: a cota
acabava antes do almoço e a tela passava o resto do dia em `429 Exceeded daily
limit`. Ao mexer nesse intervalo, refaça a conta.

E o cache precisa ser o **compartilhado**, não o de memória. O de memória é por
instância, e a Vercel sobe várias — cada partida a frio recomeçava com o cache
vazio e gastava mais duas chamadas. É o que faz o `httpJson` aceitar
`revalidateSeconds`, usado só aqui.

**Quando a cota acabar mesmo assim**, a tela mostra a última leitura que deu
certo, com o carimbo de quando foi feita, em vez de uma tela de erro. Dado de
ontem rotulado como de ontem vale mais que nada — quem abre o painel quer ver o
comportamento do site, e cota estourada é problema do painel, não da pergunta.

#### Para essa lembrança sobreviver a uma partida a frio

Sem Redis, a última leitura vive na memória da instância — e a Vercel sobe
instâncias novas o tempo todo. A instância nova nasce sem lembrança nenhuma, e
é justamente quando alguém abre o painel para mostrar a alguém.

Com um Redis cadastrado, a lembrança passa a valer para todas as instâncias, por
sete dias. É **opcional**: sem ele o painel funciona igual, só perde a memória
entre instâncias.

Na Vercel: **Storage → Create Database → Upstash for Redis**, e conectar ao
projeto. Ela injeta as variáveis sozinha, com um dos dois conjuntos de nomes:

```env
KV_REST_API_URL=...            # ou UPSTASH_REDIS_REST_URL
KV_REST_API_TOKEN=...          # ou UPSTASH_REDIS_REST_TOKEN
```

O painel aceita os dois — quem cadastra não escolhe qual a Vercel usa. Confira
em `/api/health` que apareceram.

O limite não é ajustável pelo próprio painel do Clarity; aumentar exige pedir
ao suporte da Microsoft.
[Documentação](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api)

**O mapa de calor em si não sai por API** — o Clarity não expõe a imagem. O que
o painel traz é o número por trás dele (profundidade de rolagem por página) e o
atalho para ver o mapa lá.

---

## Erros comuns

| Sintoma | Causa provável |
|---|---|
| Tela mostra "Dados de demonstração" com credencial configurada | Alguma variável do conjunto está faltando — confira em `/api/health` |
| `401` no Google | Refresh token revogado; gere de novo com `prompt=consent` |
| Google Ads `PERMISSION_DENIED` | Falta `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, ou o developer token ainda é *Test* |
| GA4 devolve zero em tudo | ID de medição no lugar do ID da propriedade |
| Tabela de publicações vazia | Falta `instagram_manage_insights` |
| Meta com `spend` mas sem leads | O tipo de ação do pixel não está em `LEAD_ACTIONS` (`src/server/connectors/meta-ads.ts`) |

---

## Kommo (vendas)

O CRM é o que fecha o ciclo do painel: os outros canais param no lead, e o
Kommo diz quanto daquilo virou dinheiro.

### O que cadastrar

| Variável | Valor |
|---|---|
| `KOMMO_SUBDOMAIN` | `marketingqyracombr` — o nome na URL da conta. Não é segredo |
| `KOMMO_ACCESS_TOKEN` | Chave de longa duração da integração privada. **É segredo** |
| `KOMMO_PIPELINE_ID` | Opcional. O funil de vendas, quando a conta tem mais de um — o do Kommo aparece na URL do funil |

### Passo a passo

1. No Kommo, **Configurações → Integrações → Criar integração** (a aba fica ao
   lado de "Instaladas"). Marque que é uma **integração privada** — ela vale só
   para esta conta e não passa por revisão do Kommo.
2. Preencha nome e descrição. O campo de **redirect URI** é obrigatório mesmo
   sem usar OAuth; pode ser `https://dashboard.qyra.com.br/api/kommo/callback`.
3. Nos **escopos**, marque leitura de negócios (leads), contatos e funis. O
   painel **nunca escreve** no Kommo — se houver opção de somente leitura, é
   ela que deve ficar marcada.
4. Salve. Abra a integração e vá em **Chaves e escopos**: ali fica a **chave de
   longa duração**. É esse valor que vai em `KOMMO_ACCESS_TOKEN`.
5. Cadastre as duas variáveis na Vercel e faça um novo deploy.

### O que o painel lê

Só leitura, e só o necessário:

- **negócios** (`/api/v4/leads`) criados no período, com valor, etapa e datas de
  criação e fechamento;
- **funis e etapas** (`/api/v4/leads/pipelines`), para o funil sair com o nome
  das etapas em vez de números.

O Kommo herdou do amoCRM dois identificadores fixos, iguais em toda conta:
**142 é venda ganha, 143 é perdido**. As demais etapas são as que a clínica
criou.

### A UTM é o que liga venda a campanha

Sem `utm_source` e `utm_campaign` gravados **no negócio**, o painel mostra
receita e ticket médio, mas não consegue dizer **qual campanha gerou a venda** —
que é a pergunta que justifica o painel inteiro.

Isso depende de o formulário (ou a integração de WhatsApp) passar as UTMs para
campos personalizados do negócio no Kommo. O conector procura pelos nomes
`utm_source`, `utm_campaign` e também por `origem` e `campanha`, então campo em
português funciona. Quando nenhum negócio traz UTM, a tela avisa quem opera —
não o cliente.

O padrão de UTM dos links publicados está em [`utm.md`](./utm.md).

### Duas coisas que o painel não resolve sozinho

**Valor do negócio.** O funil da conta hoje mostra `R$ 0` em todas as etapas: o
campo de valor não vem preenchido. Enquanto for assim, receita e ticket médio
aparecem zerados — corretamente, porque não há valor registrado. A tela avisa
quem opera, com o número de negócios ganhos sem valor, para o zero não ser lido
como "não vendemos nada".

**UTM em lead de WhatsApp e Instagram.** Boa parte dos negócios entra por DM,
que não passa por URL com parâmetro e portanto não carrega UTM naturalmente.
Ligar venda a campanha nesses casos exige uma automação capturando a origem da
conversa e gravando no negócio — é o ponto em que uma ferramenta como o n8n
tem função de verdade.

### Quando uma venda conta

**Pela data de fechamento.** "Vendemos 17 em agosto" significa 17 negócios que
foram marcados como ganhos em agosto — não 17 que entraram em agosto e
fecharam algum dia. É a conta que a operação usa, e é a que faz o total dos
indicadores bater com a soma das barras do gráfico.

Por isso o conector faz **duas consultas**: uma por data de criação, que
responde "quantos negócios entraram e onde estão agora", e outra por data de
fechamento, que responde "quanto vendemos".

A taxa de conversão é a exceção, e de propósito: ela olha só os **criados** no
período e pergunta quantos daquela safra já viraram venda. Cruzar "fechados no
mês" com "criados no mês" produziria uma taxa que pode passar de 100% quando o
ciclo é longo.

### Mais de um funil

`142` é a etapa de ganho em **todo** funil do Kommo. Numa conta com pipeline de
suporte ou pós-venda, negócios ganhos ali entrariam no faturamento sem ninguém
notar. `KOMMO_PIPELINE_ID` restringe ao funil de vendas; sem ele, a conta
inteira é somada.

### Leads de entrada

A área de **leads de entrada** (não organizados) vive num endpoint separado e
**não aparece em `/leads`**. O conector conta esses registros e os mostra como
uma linha do funil; sem isso o topo do funil simplesmente sumiria.

Só a contagem: o formato desses registros difere do de um negócio comum, e
adivinhar a forma para extrair valor renderia um total inventado.

### Limites

A API do Kommo limita a cerca de **7 requisições por segundo** e devolve no
máximo **250 negócios por página**. O conector pagina até 20 páginas — 5.000
negócios num período —, o que cobre com folga o volume de uma clínica.
