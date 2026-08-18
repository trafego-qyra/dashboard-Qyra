# Arquitetura

## Camadas

```
┌─────────────────────────────────────────────────────────┐
│ src/app/            telas (server components) e rotas    │
│   _shared/          composições que buscam dados         │
│   api/v1/           contrato HTTP público                │
├─────────────────────────────────────────────────────────┤
│ src/components/     UI pura — não conhece rede           │
├─────────────────────────────────────────────────────────┤
│ src/server/         backend: conectores, OAuth, cache    │
│   connectors/       um arquivo por plataforma            │
│   lib/              http, cache, rate limit, api         │
├─────────────────────────────────────────────────────────┤
│ src/lib/            puro: tipos, formatação, datas       │
│ src/mocks/          fixtures determinísticas             │
└─────────────────────────────────────────────────────────┘
```

O contrato está em `.dependency-cruiser.cjs` e é verificado na CI. A regra
central — `components/` não importa `server/` — é o que impede uma credencial
de ir parar no bundle do cliente. `src/server/env.ts` importa `server-only`,
então a violação quebra o build mesmo que alguém contorne o linter.

## Fluxo de dados

```
Tela (server component)
  └─ parseRange(searchParams)         intervalo vem da URL
      └─ getChannelReport(canal, intervalo)
          ├─ cached(chave, …)          TTL em memória
          │   └─ conector              fetch → API da plataforma
          │       └─ (sem credencial)  → fixture de src/mocks
          └─ comparação                mesma janela, deslocada
```

Nenhuma tela chama conector direto. `src/server/reports.ts` é o ponto único —
é por isso que cache, comparação e degradação de erro são idênticos em toda a
aplicação.

## Decisões e o porquê

**Estado do filtro na URL.** O intervalo é `?preset=` ou `?from=&to=`. Isso
torna o período compartilhável, sobrevive ao refresh, é lido no servidor sem
hidratação, e o botão "voltar" funciona. `useTransition` mantém a tela anterior
visível durante a troca, com progresso no botão.

**Busca no servidor, não no cliente.** As telas são server components. O
segredo não sai do backend, o HTML chega pronto e não há cascata de fetch. O
`loading.tsx` de cada rota cobre a espera com skeleton.

**REST em vez de SDK.** O SDK oficial do Google Ads carrega gRPC e protobuf —
mais peso que todo o resto do servidor, para usar uma query. Os quatro
conectores usam `fetch` com uma política única de timeout, retry e erro
(`src/server/lib/http.ts`).

**Cache é um `Map` com TTL.** O gargalo real é a latência das APIs externas, e
uma instância serverless serve muitas requisições da mesma janela. Redis entra
quando houver múltiplas regiões ou invalidação cross-instância — não antes.

**Rate limit é janela fixa em memória.** Protege contra loop de cliente e
scraping. Não é barreira distribuída: com várias instâncias, cada uma aplica o
próprio teto. Para limite global, trocar por Vercel KV / Upstash.

**Falha de um canal não derruba a tela.** `getAllReports` busca em paralelo e
devolve `{ report, error }` por canal. A visão geral mostra o que carregou e
avisa sobre o que faltou.

**Dias sem entrega viram zero.** As APIs omitem dias sem dado; a série precisa
deles ou o eixo do gráfico "pula" e sugere uma queda que não existe.

**Gráfico entra por `next/dynamic`.** Recharts é ~145 kB — mais que todo o
resto. Carregar sob demanda derrubou o First Load JS de 247 kB para 145 kB.

**Fixtures são determinísticas.** Hash FNV-1a sobre `canal + métrica + data`.
Sem isso o snapshot dos testes mudaria a cada execução e o painel exibiria
números diferentes a cada render.

## Extensão

**Novo canal** (ex.: TikTok Ads):

1. `src/lib/channels.ts` — id, rótulo, rota e **slot de cor**.
2. `src/lib/types.ts` — acrescente o id em `CHANNEL_IDS`.
3. `src/server/connectors/tiktok.ts` — devolva `ChannelReport`, com modo mock.
4. `src/mocks/reports.ts` — a fixture correspondente.
5. `src/server/reports.ts` — registre em `FETCHERS`.
6. `src/app/tiktok/page.tsx` + `loading.tsx` — quatro linhas cada.

A UI não muda: ela só conhece `ChannelReport`.

**Nova métrica:** acrescente ao `series` e aos `kpis` do conector e da fixture.
Se for plotável, entre em `seriesDefs` com um slot livre. Nunca ultrapasse
`maxSlotsFor()`.
