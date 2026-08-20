# Padrão de UTM

Todo link publicado fora do site vai **com parâmetros, nunca puro**. Sem UTM a
sessão cai em "direto" ou "referral" no GA4, e não há como saber qual post
trouxe a visita.

Este documento é a referência do padrão. O painel lê exatamente estes campos na
tabela **"Origem das visitas"** da tela de Analytics.

## Regras comuns

- Tudo minúsculo, sem acento, sem espaço — separador é `_`
- `utm_source` é a rede: `linkedin`, `instagram`
- O que muda entre orgânico e pago é **só** o `utm_medium`
- Com encurtador, a UTM vai na **URL de destino**, não na encurtada

## LinkedIn

**Post orgânico**

```
?utm_source=linkedin&utm_medium=social&utm_campaign=TEMA_MES&utm_content=IDENTIFICACAO_DO_POST
```

**Anúncio**

```
?utm_source=linkedin&utm_medium=paid_social&utm_campaign=NOME_DA_CAMPANHA&utm_content=CRIATIVO
```

**Exemplo pronto**

```
https://qyra.com.br/plano?utm_source=linkedin&utm_medium=social&utm_campaign=institucional_ago&utm_content=post_caneta
```

Link no primeiro comentário funciona igual: mantém a UTM normalmente.

## Instagram

**Post orgânico (link na bio)**

```
?utm_source=instagram&utm_medium=social&utm_campaign=TEMA_MES&utm_content=IDENTIFICACAO_DO_POST
```

**Stories (sticker de link)**

```
?utm_source=instagram&utm_medium=social&utm_campaign=TEMA_MES&utm_content=stories_IDENTIFICACAO
```

**Anúncio**

```
?utm_source=instagram&utm_medium=paid_social&utm_campaign=NOME_DA_CAMPANHA&utm_content=CRIATIVO
```

**Exemplo pronto**

```
https://qyra.com.br/plano?utm_source=instagram&utm_medium=social&utm_campaign=institucional_ago&utm_content=stories_caneta
```

### A diferença que muda a operação

No LinkedIn cada post carrega o próprio link, então cada um vira uma linha
sozinho na tabela. **No Instagram legenda e comentário não são clicáveis** —
link só funciona na bio e no sticker de stories.

Consequência: se a bio fica com um link fixo o mês inteiro, todos os posts do
mês chegam com a mesma UTM e viram **uma linha só**. Para separar post a post, a
bio precisa ser trocada a cada post, com o `utm_content` daquele post.

Stories é onde a atribuição fica limpa sem esforço — cada sticker carrega a
própria URL. O prefixo `stories_` no `utm_content` separa na tabela sem precisar
de coluna nova.

Se a bio aponta para Linktree ou encurtador, a UTM tem que estar em **cada link
de destino dentro dele**. Na URL encurtada, o GA4 recebe a mesma marcação para
todo mundo.

## O que cada campo vira no painel

| Parâmetro | Dimensão no GA4 | Coluna na tela |
|---|---|---|
| `utm_source` + `utm_medium` | `sessionSource`, `sessionMedium` | Origem / mídia |
| `utm_campaign` | `sessionCampaignName` | Campanha |
| `utm_content` | `sessionManualAdContent` | Post / criativo |

**`utm_campaign` é o tema, `utm_content` é o post.** Essa distinção é o que
torna a tabela útil: sem `utm_content`, todos os posts de `institucional_ago`
viram uma linha só, e some justamente a granularidade que responde "qual post
trouxe gente".

## Por que a caixa importa

O GA4 trata `Instagram` e `instagram` como valores diferentes — viram duas
linhas separadas na mesma tabela, cada uma com parte das sessões. Não há como
juntar depois sem reprocessar. Por isso minúsculas sempre.

## Por que `utm_medium` importa

O `utm_medium` é o que decide o agrupamento padrão do GA4:

| `utm_medium` | Agrupamento |
|---|---|
| `social` | Organic Social |
| `paid_social` | Paid Social |
| `cpc` | Paid Search |

Marcar um post orgânico como `cpc` mistura ele com o tráfego pago do Meta e do
Google no consolidado. É erro difícil de perceber depois.
