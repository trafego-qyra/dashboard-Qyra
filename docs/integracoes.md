# Integrações

Sem credencial o painel roda em **modo de demonstração**, com dados fictícios e
um aviso visível em cada tela. Nada quebra — é assim que se desenvolve e se
avalia a interface sem tocar em conta de produção.

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
| Cota diária baixa | O resultado é cacheado por 30 minutos e a chamada nunca é repetida em erro. |

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
