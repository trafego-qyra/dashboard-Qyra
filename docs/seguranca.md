# Estudo de segurança

Avaliação do painel a partir do código que está em produção, não de boas
práticas genéricas. Cada afirmação aqui aponta para um arquivo, e cada achado
traz o risco concreto — não "poderia ser explorado", mas o que acontece na
prática se ninguém mexer.

**Última revisão:** agosto de 2026, sobre a `main`.

---

## 1. O que está sendo protegido

Antes de falar de defesa, vale nomear o que tem valor aqui. As três coisas não
têm o mesmo peso.

| Ativo | Onde vive | Se vazar |
|---|---|---|
| **Credenciais das plataformas** | Variáveis de ambiente na Vercel | O pior caso do projeto: dão acesso de escrita à conta de anúncios. Quem tem o token da Meta pode criar campanha e gastar dinheiro |
| **Dado de negócio** | Nunca armazenado — buscado por requisição | Investimento, leads, CPL e origem de tráfego. Constrangedor e útil para concorrente; não é dado pessoal |
| **Dado de comportamento** | Microsoft Clarity, fora daqui | Gravação de sessão de visitante. É o único ponto com implicação de LGPD, e ele não mora neste sistema |

**O painel não tem banco de dados.** Nada é persistido: cada visita busca na
origem e devolve. Isso elimina de saída uma classe inteira de problema —
injeção de SQL, vazamento de dump, backup exposto. Não é mérito de design
defensivo, é consequência da arquitetura, mas conta a favor.

## 2. De quem, realisticamente

Modelo de ameaça honesto para uma clínica com um painel interno. Ordenado por
probabilidade, não por drama.

1. **Alguém com o link.** O endereço circula em WhatsApp, é aberto em reunião,
   fica no histórico de um navegador emprestado. **É a ameaça número um** e a
   única que já se concretizou: o painel esteve público.
2. **Varredura automatizada.** Robô que testa caminhos comuns (`/.env`,
   `/api/*`, `/admin`) em qualquer domínio que responda. Não é dirigida a você;
   é constante.
3. **Credencial que escapa por um canal errado** — colada em chat, em ticket,
   em print de tela, em log de plataforma.
4. **Ex-integrante da equipe** que continua com a senha depois de sair.
5. **Ataque dirigido por concorrente.** Possível, improvável, e caro de defender
   contra. Não vale desenhar o sistema em torno disso.

O que **não** está no modelo: invasão de infraestrutura da Vercel, do Google ou
da Meta. Se isso acontecer, o problema não é seu.

---

## 3. Postura atual

O que já existe hoje, com onde conferir.

### Cabeçalhos e transporte

`next.config.ts` aplica em todas as rotas:

| Cabeçalho | Efeito |
|---|---|
| `Content-Security-Policy` | Só carrega recurso do próprio domínio. `frame-ancestors 'none'` e `object-src 'none'` |
| `Strict-Transport-Security` | 2 anos, com subdomínios e `preload` — impede downgrade para http |
| `X-Frame-Options: DENY` | Ninguém embute o painel num iframe |
| `X-Content-Type-Options: nosniff` | Navegador não adivinha tipo de arquivo |
| `Referrer-Policy` | O endereço do painel não vaza para sites de terceiro |
| `Permissions-Policy` | Câmera, microfone e localização negados |

`/api/*` responde com `Cache-Control: no-store` — dado de negócio não pode
parar em cache de intermediário.

### Credenciais

- **Nunca no repositório.** `.env.local` está no `.gitignore`, e a CI roda
  **gitleaks sobre o histórico inteiro**, não sobre um intervalo de commits.
- **Lidas por requisição**, não na carga do módulo (`src/server/env.ts`) — o que
  também evita que fiquem congeladas em memória de build.
- **Nunca chegam ao navegador.** `src/server/env.ts` importa `server-only`: se
  alguém tentar usá-lo de um componente cliente, o build quebra de propósito.
- **Redigidas antes de virar log ou resposta** (`redactSecrets`, em
  `src/server/lib/http.ts`).

### Superfícies que falam com fora

Os dois proxies de imagem (`/criativos/[id]/imagem` e
`/publicacoes/[id]/imagem`) são o único ponto onde uma URL vinda de resposta
externa vira requisição de saída. Ambos têm:

- ID validado como **só dígitos** — string livre viraria injeção de caminho;
- **allowlist de host** (`fbcdn.net`, `cdninstagram.com`, `facebook.com`,
  `instagram.com`) e exigência de `https`;
- verificação de `content-type` de imagem na resposta;
- tempo limite e falha silenciosa em 404.

Sem a allowlist, esses proxies seriam SSRF — um pedido para endereço interno da
infraestrutura, feito a partir do servidor.

### Esteira

`npm audit` bloqueante para **crítico em dependência de produção**, gitleaks,
`dependency-cruiser` cravando que `components/` nunca importa `server/`, e mais
de duzentos testes automatizados.

O gitleaks varre o **histórico inteiro**, não um intervalo de commits — e é
severo o bastante para barrar até segredo de mentira. Aconteceu ao escrever os
testes deste estudo: uma isca com formato de credencial real reprovou a CI, com
razão. **Isca de teste se monta em tempo de execução**, nunca escrita por
extenso: segredo falso no repositório treina a equipe a ignorar o alarme, o que
é pior que não ter alarme.

---

## 4. Achados em aberto

Severidade pelo risco real neste contexto, não pela nota de um scanner.

### 🔴 S1 — O painel está público

**Estado:** correção pronta e revisada, parada no PR #35 esperando a variável
`QYRA_SENHA` ser cadastrada na Vercel.

Qualquer pessoa com o endereço vê investimento, leads e CPL. Não é hipótese —
é o estado de agora, e o endereço já circulou. **Este é o único achado que
justifica pressa.**

**Correção:** cadastrar `QYRA_SENHA` e mergear o PR #35.

### 🟠 S2 — Os diagnósticos descrevem a configuração

`/api/health`, `/api/diagnostico/meta` e `/api/diagnostico/google` devolvem:
quais variáveis existem, o ID da conta de anúncios mascarado, e **tamanho,
primeiros e últimos caracteres do token**.

Nada disso é a credencial. Mas em conjunto entrega o mapa da integração para
quem estiver procurando por onde entrar — e o formato do token confirma qual
plataforma está do outro lado.

**Correção:** entram atrás da senha junto com o S1 — o porteiro é um middleware
e cobre `/api` inteiro. Depois disso, o risco cai para "quem já entrou". Se um
dia houver acesso por pessoa, vale restringir o diagnóstico a quem opera.

### 🟠 S3 — Segredo do Google podia escapar para o log

**Corrigido neste estudo.** `redactSecrets` cobria os formatos da Meta e
parâmetros em query string, mas não os padrões do Google (`ya29.`, `GOCSPX-`,
`1//`) nem segredo em **corpo JSON** — que é exatamente como o Google responde.

Um erro de autenticação do Google Ads podia levar o segredo do cliente para o
log da Vercel. Agora os dois formatos são cobertos, com teste para cada um.

### 🟡 S4 — O teto de tentativas é por instância

`src/server/lib/rate-limit.ts` guarda a contagem em memória. A Vercel roda
várias instâncias, então o limite efetivo é o configurado **multiplicado pelo
número de instâncias ativas**.

Serve contra cliente em laço e varredura preguiçosa. Não serve contra força
bruta distribuída e paciente.

**Correção:** Vercel KV ou Upstash para contagem compartilhada. Vale a pena
**se** o painel virar alvo — hoje é otimização prematura.

### 🟡 S5 — CSP permite script inline

`script-src 'self' 'unsafe-inline'` está lá porque o Next injeta script inline
para hidratação. Na prática significa que, **se** algum dia existir um XSS
refletido, a CSP não vai impedir a execução.

O painel hoje não renderiza HTML vindo de fora — todo texto passa por JSX, que
escapa sozinho. O risco é sobre o futuro, não sobre o código de agora.

**Correção:** nonce por requisição, gerado no middleware. Mexe em layout e CSP
juntos; custo médio, benefício de longo prazo.

### 🟡 S6 — Sessão de sete dias, sem revogação individual

Como a senha é única, tirar o acesso de uma pessoa é trocar a senha de todo
mundo. E uma sessão aberta dura sete dias mesmo depois disso — a menos que a
senha mude, porque a assinatura usa a senha como chave.

**Correção:** é a consequência aceita da senha compartilhada. Resolve de vez
com acesso por pessoa (seção 6).

### 🟢 S7 — Sem registro de acesso

Ninguém sabe quem entrou, quando, nem de onde. Se algo vazar, não há como
reconstruir o caminho.

**Correção:** só faz sentido junto com acesso por pessoa. Registrar "alguém
entrou" numa senha compartilhada não responde nada.

### ⚪ S8 — As dez vulnerabilidades "high" do `npm audit`

Investigadas uma a uma. **Nenhuma tem caminho de exploração aqui:**

| Pacote | Por que não se aplica |
|---|---|
| `postcss` | Roda na **compilação**, sobre o CSS do próprio projeto. As falhas exigem CSS controlado por atacante |
| `sharp` | Otimização de imagem do Next. **Este projeto não usa `next/image`** — a arte da Meta é servida pelo proxy em bytes crus, direto ao navegador. `sharp` não está no caminho |
| `lighthouse`, `@puppeteer/browsers`, `extract-zip` | Ferramenta de CI. Não vão para produção |

Saem sozinhas na atualização para o Next 16, que é troca de versão maior e
merece uma janela própria. **Não é urgência.**

---

## 5. Parâmetros

Os valores, e o motivo de cada número. Onde diz "atual", já está assim.

### Senha de acesso

| Parâmetro | Valor | Por quê |
|---|---|---|
| Comprimento mínimo | **20 caracteres** aleatórios, ou 5 palavras sorteadas | Senha compartilhada não pode depender de memória. Ela vai para um gerenciador de senha, então tamanho é grátis |
| Origem | **Gerada**, nunca escolhida | Senha escolhida por pessoa é adivinhável; senha derivada da marca (`Qyra@2026`) é a primeira que um robô tenta |
| Onde guardar | Gerenciador de senha da equipe (1Password, Bitwarden) | Não em planilha, não em grupo de WhatsApp, não em bloco de notas |
| Troca programada | A cada **6 meses** | |
| Troca imediata | Quando alguém **sai da equipe**, ou se houver suspeita de exposição | É o único mecanismo de revogação que existe hoje |

Para gerar no Mac, sem passar por nenhum site:

```bash
LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24; echo
```

**Não me peça para gerar a senha no chat, e não cole a senha aqui.** Tudo que
passa por esta conversa fica no histórico dela. Gere no seu terminal e cadastre
direto na Vercel.

### Sessão

| Parâmetro | Valor | Por quê |
|---|---|---|
| Duração | **7 dias** (atual) | Pedir senha todo dia vira post-it no monitor — a proteção que incomoda é contornada |
| Assinatura | HMAC-SHA256, chave = a própria senha (atual) | Trocar a senha derruba toda sessão aberta, que é o comportamento esperado de uma troca de senha |
| `httpOnly` | sim (atual) | Um XSS não leva a sessão junto |
| `secure` | segue o protocolo real (atual) | |
| `sameSite` | `lax` (atual) | Link compartilhado funciona; POST de outro site não |

`QYRA_SESSAO_SECRET` desacopla sessão de senha, para rotação de rotina sem
deslogar ninguém. **Deixe em branco** enquanto a rotação for por saída de
pessoa — aí você *quer* derrubar as sessões.

### Tentativas

| Parâmetro | Valor | Observação |
|---|---|---|
| Login | **10 por IP a cada 10 min** (atual) | Multiplicado pelo número de instâncias — ver S4 |
| API | **60 por minuto** (atual, `RATE_LIMIT_MAX`) | |

### Acesso à infraestrutura

Não é código, e é onde mora o maior risco residual:

- **Verificação em duas etapas obrigatória** nas contas Vercel, GitHub, Google
  e Meta. Uma senha de painel forte não vale nada se a conta que guarda as
  credenciais cai por SMS interceptado.
- **Acesso ao projeto na Vercel** só para quem precisa fazer deploy.
- **Revisar quem tem acesso** a cada saída de pessoa da equipe.

---

## 6. Sobre "login e senha para o pessoal"

Vale ser claro sobre o que cada opção compra, porque a intuição engana aqui.

**Adicionar um campo de usuário a uma senha compartilhada não aumenta a
segurança.** Se todo mundo digita `qyra` / a mesma senha, o usuário é
decoração: não identifica ninguém, não permite tirar o acesso de uma pessoa só,
e não gera trilha. Só acrescenta um campo para preencher.

As opções reais:

| Opção | O que compra | Custo | Quando faz sentido |
|---|---|---|---|
| **Senha única** (implementada) | Fecha o painel para quem não tem a senha | Pronto | Equipe pequena, todo mundo com o mesmo nível de acesso — **é o caso de hoje** |
| **Conta por pessoa** | Tirar acesso de uma pessoa sem afetar as outras; saber quem entrou | Precisa de banco de dados e tela de administração. Semanas, e passa a existir dado pessoal para proteger | Quando a equipe crescer, ou quando entrar gente de fora |
| **Entrar com Google** | Mesma coisa da anterior, sem guardar senha nenhuma. Restringe por domínio `@qyra.com.br` | Dias, não semanas. A conta do Google já existe e já tem 2FA | **É para onde eu levaria quando a senha única apertar** |

Minha recomendação: **fique na senha única agora** e migre para entrar com
Google quando surgir a primeira necessidade concreta — alguém que precisa ver
só um canal, ou uma saída de equipe que incomode trocar a senha de todos.
Construir contas antes disso é criar dado pessoal para guardar sem ter o
problema que ele resolve.

---

## 7. Roteiro

**Agora, e só isto importa:** cadastrar `QYRA_SENHA` na Vercel e mergear o PR
#35 (S1 e S2 caem juntos).

**Nas próximas semanas:** verificação em duas etapas em todas as contas de
plataforma; a senha num gerenciador; a rotina de trocar a senha quando alguém
sai.

**Quando fizer sentido:** entrar com Google (resolve S6 e S7 de uma vez);
nonce na CSP (S5); Next 16 (S8); contagem compartilhada de tentativas se o
painel virar alvo (S4).

## 8. Como reavaliar

```bash
npm audit --audit-level=high     # dependências
npm run verify                   # tipos, lint, contrato de arquitetura, testes
npx gitleaks git . --redact      # segredo no histórico
```

E, no navegador, conferir que `/` sem sessão manda para `/login` e que
`/api/v1/overview` não devolve dado — a suíte `porta` do e2e afirma as duas
coisas a cada PR, mas conferir na produção real custa um minuto.

Revisar este documento a cada mudança na forma de autenticar, a cada nova
integração, e pelo menos uma vez por semestre.
