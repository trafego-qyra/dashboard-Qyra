# A ponte de captura

Este é o desvio que faz a atribuição funcionar **sem o questionário mudar uma
linha**. Ele existe porque o caminho certo depende de outra equipe, e a
atribuição não podia ficar parada esperando.

O caminho certo continua sendo o descrito em [`captura-fbc.md`](./captura-fbc.md):
o questionário grava o `fbc` direto no negócio do Kommo. Quando isso acontecer,
esta ponte **sai de cena sozinha** — o webhook lê o campo do negócio primeiro e
só consulta a ponte quando ele não existe.

## O problema

```
anúncio → qyra.com.br → questionario.qyra.com.br → Kommo → nosso CAPI → Meta
                ↑                    ↑
         fbc nasce aqui      e morre aqui: o questionário
                             não repassa o fbc ao Kommo
```

Sem o `fbc`, a Meta recebe a venda mas não sabe de qual anúncio ela veio.

## A chave que resolve

O questionário grava um UUID no `localStorage`:

```js
localStorage.setItem("qyra_auth", JSON.stringify({ token, cliente_id }))
```

E o **mesmo valor** aparece no campo `qyra_cliente_id` do negócio no Kommo.

Isso é uma chave de junção pronta. Guardando `cliente_id -> fbc` no nosso banco,
o webhook junta os dois lados na hora do GANHO:

```
navegador do questionário
  cliente_id + _fbc + utm
        ↓ tag no GTM
  POST /api/captura  →  Supabase (captura_clique)
        ↓
  Kommo marca GANHO → webhook lê qyra_cliente_id do negócio
        ↓ busca o fbc pela chave
  Meta
```

**O que atravessa é um UUID opaco e um identificador de clique.** Nome,
telefone, e-mail e resposta de saúde continuam onde estão — o que torna este
caminho mais limpo, sob a LGPD, do que mandar contato para o nosso servidor.

## 1. Criar a tabela

Rode [`sql/captura-clique.sql`](./sql/captura-clique.sql) no SQL Editor do
Supabase. Uma vez só.

## 2. A tag no GTM

No contêiner `GTM-KZ4JV5L9`, **Tags → Novo → HTML personalizado**, acionamento
**All Pages**. Nome sugerido: `Qyra — ponte de captura`.

O mesmo contêiner serve a landing page e o questionário, e a tag só faz algo
onde encontra o `cliente_id` — então não há problema em ela rodar nos dois.

```html
<script>
(function () {
  var PAINEL = 'https://dashboard.qyra.com.br/api/captura';
  var INTERVALO = 2000;
  var TENTATIVAS = 300;   // 10 minutos: o questionario e longo.
  var MAXIMO_DE_FALHAS = 3;

  var concluido = false;
  var enviando = false;
  var falhas = 0;

  function guardado(chave) {
    try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch (e) { return null; }
  }

  function cookie(nome) {
    var achado = document.cookie.match('(^|;)\\s*' + nome + '\\s*=\\s*([^;]*)');
    return achado ? decodeURIComponent(achado[2]) : '';
  }

  // O MESMO sinal que o pixel do questionario usa. Sem "sim" para marketing,
  // nada sai daqui -- nem para o nosso proprio servidor.
  function consentiu() {
    var c = guardado('qyra_cookie_consent_v1');
    return !!(c && c.marketing === true);
  }

  // O identificador que o questionario tambem grava no negocio do Kommo. Ele
  // so aparece depois da tela de e-mail, por isso a espera.
  function clienteId() {
    var a = guardado('qyra_auth');
    return (a && a.cliente_id) || '';
  }

  function jaMandou(id) {
    try { return sessionStorage.getItem('qyra_ponte_' + id) === '1'; } catch (e) { return false; }
  }

  function marcar(id) {
    try { sessionStorage.setItem('qyra_ponte_' + id, '1'); } catch (e) { /* aba anonima */ }
  }

  function tentar() {
    if (concluido) return true;
    if (!consentiu()) return false;

    var id = clienteId();
    if (!id) return false;

    if (jaMandou(id)) { concluido = true; return true; }

    var carga = {
      cliente_id: id,
      fbc: cookie('_fbc') || undefined,
      fbp: cookie('_fbp') || undefined,
      utm_source: cookie('qyra_utm_source') || undefined,
      utm_medium: cookie('qyra_utm_medium') || undefined,
      utm_campaign: cookie('qyra_utm_campaign') || undefined,
      utm_content: cookie('qyra_utm_content') || undefined
    };

    // Sem clique nem origem nao ha o que ligar: a pessoa veio direto. Mandar
    // assim so criaria linha vazia no banco.
    if (!carga.fbc && !carga.utm_source && !carga.utm_campaign) { concluido = true; return true; }

    if (enviando) return false;
    if (falhas >= MAXIMO_DE_FALHAS) { concluido = true; return true; }

    enviando = true;
    fetch(PAINEL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(carga),
      mode: 'cors',
      keepalive: true
    }).then(function (r) {
      enviando = false;
      if (r && r.ok) { marcar(id); concluido = true; } else { falhas++; }
    })['catch'](function () { enviando = false; falhas++; });

    return false;
  }

  if (!tentar()) {
    var n = 0;
    var relogio = setInterval(function () {
      if (tentar() || ++n >= TENTATIVAS) clearInterval(relogio);
    }, INTERVALO);
  }
})();
</script>
```

Esta tag **depende** da tag de repasse de parâmetros descrita em
[`captura-fbc.md`](./captura-fbc.md) — é ela que faz o `fbc` e as UTMs
existirem no domínio do questionário.

## 3. Conferir

Abra a landing page com parâmetro, atravesse para o questionário, aceite os
cookies e chegue até a tela de e-mail. Depois:

```
/api/diagnostico/kommo
```

O bloco `captura` mede a causa: `comClique` sobe quando o `fbc` passa a chegar
no negócio — seja pela ponte, seja pelo caminho certo.

## O que a ponte **não** resolve

- **Lead de WhatsApp e DM.** Não passa pelo questionário, não tem `cliente_id`.
  Para esses, o telefone continua sendo a única identificação.
- **Quem recusa cookies.** A tag respeita o mesmo consentimento do pixel. É uma
  escolha de conformidade, não uma falha.
- **Quem desiste antes do e-mail.** O `cliente_id` só nasce ali. Mas quem
  desiste antes também não vira negócio no Kommo, então nada se perde.

## Por que a rota é pública, e o que a protege

`/api/captura` fica fora do porteiro do painel: quem chama é o navegador de um
visitante, sem sessão. E **não existe segredo possível** — qualquer valor
embutido numa tag do GTM é público por definição.

O que segura a porta:

| Defesa | Efeito |
|---|---|
| `cliente_id` precisa ser UUID | Adivinhar um é inviável |
| `fbc` e `fbp` no formato exato da Meta | Não vira campo de texto livre |
| Corpo com teto de 4 KB | Não dá para despejar dado |
| Origem restrita aos domínios da Qyra | Chamada de outro site é recusada |

O pior caso que sobra é alguém alterar a atribuição do **próprio**
`cliente_id`, que é dado dele. Está registrado em [`seguranca.md`](./seguranca.md).
