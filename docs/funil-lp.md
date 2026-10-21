# O funil das LPs de planos

A tela de **Comportamento** mostra em qual pergunta do questionário das LPs de
planos (`planos.qyra.com.br/adv`, `/essencial` e `/digital`) as pessoas desistem.
O Analytics diz quantos chegaram e o Kommo quantos viraram negócio; este funil
é o caminho entre os dois.

```
LP (navegador)                     painel                      Supabase
  cada tela vista   ── POST /api/funil ──→  confere  ──→  funil_lp
                                                              ↓
  Comportamento  ←── soma por etapa ←── funil_lp_por_dia (view)
```

## O que a LP manda

Uma chamada por tela vista, por `navigator.sendBeacon`:

```json
{ "sessao": "<uuid da aba>", "etapa": "objetivo", "lp": "avancado",
  "plano": null, "utm_source": "meta", "utm_campaign": "…" }
```

- **`sessao`** é sorteada pela LP e guardada no `sessionStorage`: some quando a
  aba fecha, não é cookie e não identifica ninguém.
- **`etapa`** vem de uma lista fechada (`src/server/funil/lp.ts`). O que não está
  na lista é recusado com 422.
- **Nada de nome, contato, CEP ou resposta.** Nem o resultado das perguntas de
  saúde: só o fato de a pessoa ter visto a tela.

A mesma sessão passando duas vezes pela mesma tela é uma linha só — a chave da
tabela é `(sessao, etapa)`. Por isso contar linhas é contar pessoas.

## O que a figura mostra

As etapas em que **todo mundo** passa, na ordem: visita, abertura do
questionário, as perguntas de objetivo a CEP, a tela de contato, o envio do
contato, o perfil de saúde, o plano, o clique em "Quero o plano" e o fim.

Ficam guardadas, mas fora da figura, as telas que só parte das pessoas vê:

| Etapa | Por que fica fora |
|---|---|
| `intro`, `prontidao` | Somem quando a pessoa começa pelo cartão do topo da LP |
| `consent`, `exclusao`, `liberado` | Só existem para Essencial e Avançado |
| `dados`, `pagamento`, `pago` | A contratação na própria LP, só para Essencial e Avançado. Os pagamentos aprovados aparecem como número embaixo da figura |

As saídas que o próprio questionário encerra (IMC abaixo de 18,5, IMC adequado,
reprovado nas condições de saúde) aparecem como números embaixo da figura.

Cada degrau conta quem chegou a ele **ou passou dele**: quem volta em outra aba
pode pular telas já vistas, e sem essa regra um degrau teria menos gente que o
seguinte.

## Ligar

1. Rode [`sql/funil-lp.sql`](./sql/funil-lp.sql) no SQL Editor do Supabase do
   painel. Uma vez só.
2. Publique a versão da LP que manda as etapas (repositório `qyra-lp`).
3. Abra a tela de Comportamento. Sem tabela, ela diz que o banco não respondeu
   e aponta este SQL; sem visitas, diz que ainda não chegou nada.

## Prazo

Linhas com mais de noventa dias são apagadas na varredura diária
(`/api/cron/eventos-crm`), pelo mesmo prazo da ponte de captura.

## Próximo passo: carrinho abandonado

A coluna `cliente_id` já existe e fica vazia por enquanto. Quando a LP tiver a
etapa de pagamento, o cadastro na API de checkout da Qyra (`/dados`) devolve um
`cliente_id` — o mesmo do campo `qyra_cliente_id` no Kommo. Com ele nas etapas,
quem chegou ao cadastro e não pagou vira carrinho abandonado com negócio
identificado no CRM.
