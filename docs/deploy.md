# Deploy

## Vercel

O repositório está conectado à Vercel. O fluxo é o padrão do Git:

| Evento | Resultado |
|---|---|
| PR aberto ou atualizado | **Deploy de preview**, com URL própria no PR |
| Merge na `main` | **Deploy de produção** |

**Região:** configure em Settings → Functions → Function Region. `gru1`
(São Paulo) é a escolha natural — as funções ficam perto de quem usa, e a
latência das APIs do Meta e do Google é a mesma de qualquer região. Fica no
painel, e não no `vercel.json`, porque a fixação por arquivo é rejeitada em
planos que não permitem escolher região e derruba o deploy inteiro.

**Tempo limite das rotas de API:** 30s, declarado na própria rota
(`export const maxDuration = 30`). É o modo idiomático do Next: fica junto do
código e não depende de um glob no `vercel.json` casar com a saída do build.

## Variáveis de ambiente

Configure em **Project Settings → Environment Variables**. Nenhuma delas é
`NEXT_PUBLIC_*` (exceto o DSN do Sentry, que é público por natureza).

| Variável | Production | Preview | Observação |
|---|---|---|---|
| `META_ACCESS_TOKEN` | ✓ | opcional | Sem ela o preview roda em demonstração |
| `META_AD_ACCOUNT_ID` | ✓ | opcional | |
| `META_IG_USER_ID` | ✓ | opcional | |
| `GOOGLE_CLIENT_ID` | ✓ | opcional | |
| `GOOGLE_CLIENT_SECRET` | ✓ | opcional | |
| `GOOGLE_REFRESH_TOKEN` | ✓ | opcional | |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | ✓ | opcional | |
| `GOOGLE_ADS_CUSTOMER_ID` | ✓ | opcional | |
| `GA4_PROPERTY_ID` | ✓ | opcional | |
| `NEXT_PUBLIC_SENTRY_DSN` | ✓ | — | Sem ela, nada é enviado |
| `QYRA_FORCE_MOCK` | — | `true` | Preview com dados fictícios |
| `REPORT_CACHE_TTL` | `300` | `60` | Segundos |
| `RATE_LIMIT_MAX` | `60` | `60` | Por minuto, por IP |

**Recomendação para o preview:** deixe `QYRA_FORCE_MOCK=true`. A revisão visual
de PR não deveria consumir cota da API nem expor número real de cliente em URL
pública de preview.

Variável em branco é tratada como ausente — o app cai em demonstração em vez
de quebrar no boot.

## Domínio

Produção prevista: **`dashboard.qyra.com.br`**, após validação.

Quando for a hora:

1. Vercel → Project → Settings → Domains → adicionar `dashboard.qyra.com.br`.
2. No DNS de `qyra.com.br`, criar o registro que a Vercel indicar:
   - `CNAME dashboard → cname.vercel-dns.com` (recomendado), ou
   - `A dashboard → 76.76.21.21` se o provedor não aceitar CNAME em subdomínio.
3. Aguardar a emissão do certificado (automática, alguns minutos).
4. Definir como **domínio primário** para que a URL `.vercel.app` redirecione.

**Antes de expor o domínio público**, três itens de bloqueio:

- [ ] **Autenticação.** O painel não tem controle de acesso — hoje qualquer um
      com a URL vê os números. Até resolver, use *Vercel Authentication*
      (Settings → Deployment Protection), que exige login da equipe.
- [ ] **Termos de uso e política de privacidade** aprovados pelo jurídico
      (`docs/legal/`).
- [ ] **Sentry** configurado, para que erro em produção não passe despercebido.

O `metadata.robots` já está em `noindex, nofollow`: mesmo exposto, o painel não
entra em buscador.

## Rodar localmente

```bash
npm ci
cp .env.example .env.local     # opcional: sem ele, roda em demonstração
npm run dev
```

Build de produção local:

```bash
npm run build && npm start
```
