# Captura do identificador de clique

Este é o documento que decide o teto da integração com a Meta. Tudo o mais já
está pronto: o negócio muda de etapa, vira evento, chega na Meta. O que falta é
a Meta **reconhecer a pessoa** do outro lado — e isso depende de um dado que só
existe no navegador de quem clicou no anúncio.

## O problema, em uma frase

A Meta só credita a venda à campanha se souber que aquela pessoa veio de um
anúncio. Telefone e e-mail funcionam, mas casam menos: dependem de a pessoa ter
o mesmo contato cadastrado lá. O **identificador de clique** (`fbc`) é
determinístico — ou é aquela pessoa, ou não é.

Ele nasce quando alguém clica no anúncio e chega na landing page com `?fbclid=`
na URL. O pixel grava isso no cookie `_fbc`. **E morre ali**, se ninguém levar
o valor adiante.

## O caminho completo

```
anúncio → landing page (?fbclid=…) → pixel grava cookie _fbc
                                       ↓
                            formulário envia junto com nome e telefone
                                       ↓
                            Kommo grava em campo personalizado do negócio
                                       ↓
                            webhook lê o campo e manda para a Meta
```

Os dois últimos passos já funcionam. Os dois primeiros são trabalho na landing
page, que não vive neste repositório.

## 1. Criar os campos no Kommo

**Configurações → Campos personalizados → Negócios.** Dois campos de texto:

| Nome do campo | O que guarda |
|---|---|
| `fbc` | Identificador do clique |
| `fbp` | Cookie do navegador |

O nome pode ser outro — o conector procura por `fbc`, `_fbc`, `fbclid`,
`click id` e `clickid`, e por `fbp` e `_fbp`. Mas `fbc` e `fbp` são os mais
curtos e os menos sujeitos a erro de digitação.

## 2. Ler os cookies na landing page

O pixel já grava `_fbc` e `_fbp`. Este trecho lê os dois e preenche campos
escondidos do formulário. Cole antes do `</body>`:

```html
<script>
(function () {
  function cookie(nome) {
    var achado = document.cookie.match("(^|;)\\s*" + nome + "\\s*=\\s*([^;]+)");
    return achado ? achado.pop() : "";
  }

  // O pixel demora alguns milissegundos para gravar o cookie. Se a pessoa for
  // rápida no formulário, `_fbc` ainda não existe -- e aí ele é reconstruído
  // do parâmetro da URL, no mesmo formato que a Meta espera.
  function fbc() {
    var doCookie = cookie("_fbc");
    if (doCookie) return doCookie;

    var fbclid = new URLSearchParams(location.search).get("fbclid");
    return fbclid ? "fb.1." + Date.now() + "." + fbclid : "";
  }

  function preencher() {
    var valores = { fbc: fbc(), fbp: cookie("_fbp") };
    for (var nome in valores) {
      var campo = document.querySelector('input[name="' + nome + '"]');
      if (campo) campo.value = valores[nome];
    }
  }

  preencher();
  // De novo no envio: em formulário de uma página só, o cookie pode ter sido
  // gravado depois do carregamento.
  document.addEventListener("submit", preencher, true);
})();
</script>
```

E os campos escondidos, dentro do `<form>`:

```html
<input type="hidden" name="fbc" value="">
<input type="hidden" name="fbp" value="">
```

**Se o formulário for de uma ferramenta** (RD Station, Typeform, Elementor), o
caminho é outro: quase todas permitem campos ocultos preenchidos por parâmetro
de URL ou por JavaScript. Procure por "campo oculto" ou "hidden field" na
documentação dela.

## 3. Conferir se funcionou

```
/api/diagnostico/kommo
```

O bloco `captura` olha os 50 negócios mais recentes:

```json
"captura": {
  "amostra": 50,
  "comClique": 31,
  "comNavegador": 29,
  "comUtm": 44,
  "camposVistos": ["EMAIL", "PHONE", "fbc", "fbp", "utm_source"]
}
```

`camposVistos` é o que resolve o erro mais chato desta configuração: o
formulário grava num campo chamado `fb_click_id`, o conector procura por `fbc`,
e **os dois lados parecem certos enquanto nada funciona**. Vendo a lista, a
diferença aparece na hora.

## O que esperar

`comClique` nunca chega a 100%, e não é defeito:

- **Lead de WhatsApp e DM** não passa por landing page. Não tem `fbc`, nunca vai
  ter. Para esses, o telefone é o que há — e é por isso que ele também é enviado.
- **Tráfego orgânico** não tem `fbclid`. Correto: a Meta não deveria receber
  crédito por ele.

O número que importa não é o absoluto, é o movimento. Se `comClique` subir
depois de instalar isto, a captura funcionou. O placar da tela de Vendas mostra
o efeito disso algumas semanas depois, quando a Meta passa a casar mais evento.

## Sobre lead de WhatsApp

Existe um equivalente para campanhas de "clique para WhatsApp": o `ctwa_clid`,
que chega junto da primeira mensagem. Se ele estiver disponível na integração de
WhatsApp do Kommo, grave-o no mesmo campo `fbc` — o conector envia igual.

Se não estiver, não há caminho: esse lead é identificado por telefone, ou não é
identificado.
