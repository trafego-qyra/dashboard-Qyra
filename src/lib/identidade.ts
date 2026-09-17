/**
 * Normalização dos identificadores que a Meta usa para casar um evento de CRM
 * com uma conta.
 *
 * Mora em `lib/` porque é manipulação de string pura — nenhum segredo, nenhuma
 * rede, teste sem stub. O hash fica no conector, que é onde o `node:crypto`
 * entra sem arrastar a camada de servidor para cá.
 *
 * A regra que governa o arquivo inteiro: **a Meta compara hash exato**. Um
 * espaço a mais, um `+` no telefone ou uma maiúscula produzem um hash
 * diferente, e a pessoa simplesmente não é encontrada — sem erro na resposta,
 * sem aviso no Gerenciador, só uma taxa de correspondência baixa que ninguém
 * sabe explicar três meses depois.
 */

/** `fb.<subdominio>.<criacao_ms>.<fbclid>` — o formato do cookie `_fbc`. */
const FBC_COMPLETO = /^fb\.\d+\.\d+\..+/;

export function normalizarEmail(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpo = valor.trim().toLowerCase();
  // Validação mínima. O que não tem cara de e-mail não vira correspondência em
  // lugar nenhum: só entra na conta de eventos sem match e suja o diagnóstico.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpo) ? limpo : null;
}

/**
 * Telefone em E.164 sem `+` e sem separador, que é a forma que a Meta compara.
 *
 * O caso brasileiro tem duas armadilhas. A primeira é o número salvo sem o
 * país: `(11) 99999-9999` e `5511999999999` são a mesma pessoa e hashes
 * diferentes. A segunda é o `0` de operadora e o `00` de discagem
 * internacional, que entram junto quando o número é copiado de uma agenda e
 * não fazem parte do E.164.
 */
export function normalizarTelefone(valor: string | null | undefined): string | null {
  if (!valor) return null;

  const digitos = valor.replace(/\D/g, "").replace(/^00/, "").replace(/^0+/, "");

  // Sem DDD não há como reconstruir o número. Chutar um produz hash errado, que
  // é pior que não mandar nada: conta como evento sem correspondência.
  if (digitos.length < 10) return null;
  // E.164 termina em 15 dígitos. Acima disso o campo tem duas coisas coladas.
  if (digitos.length > 15) return null;

  // 10 é DDD + fixo, 11 é DDD + celular: número brasileiro sem o código do país.
  // De 12 para cima o país já está lá — inclusive de outro país, e nesse caso
  // reescrever para 55 é que estragaria o número.
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

/**
 * Nome próprio como a Meta espera: minúsculo, sem acento e sem pontuação.
 *
 * Acento é o detalhe que mais custa aqui — `André` e `andre` são hashes
 * diferentes, e metade da base de uma clínica brasileira tem acento no nome.
 */
export function normalizarNome(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpo = valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return limpo === "" ? null : limpo;
}

/**
 * O `fbclid`, venha ele como for.
 *
 * O campo personalizado do CRM recebe coisas diferentes conforme quem
 * preencheu: o parâmetro cru, o cookie `_fbc` inteiro, ou a URL de entrada da
 * landing page sem nenhum tratamento. Os três casos são a mesma informação.
 */
export function extrairFbclid(valor: string | null | undefined): string | null {
  const texto = valor?.trim();
  if (!texto) return null;

  const naUrl = texto.match(/[?&]fbclid=([^&#\s]+)/);
  if (naUrl?.[1]) return decodeURIComponent(naUrl[1]);

  // O `fbclid` pode conter ponto, então o que vem depois do terceiro é tudo dele.
  if (FBC_COMPLETO.test(texto)) return texto.split(".").slice(3).join(".");

  // Cru: base64 url-safe. Espaço ou acento aqui significa que veio outra coisa
  // no campo — nome do anúncio, observação da recepção, o que for.
  return /^[A-Za-z0-9_-]+$/.test(texto) ? texto : null;
}

/**
 * O valor de `fbc` pronto para enviar.
 *
 * Quando o formulário gravou o cookie inteiro, ele passa intacto — o timestamp
 * de dentro dele é o do clique de verdade, melhor que qualquer reconstrução.
 * Quando gravou só o `fbclid`, a criação do negócio é a melhor aproximação
 * disponível do instante do clique.
 */
export function montarFbc(valor: string | null | undefined, criadoEmMs: number): string | null {
  const texto = valor?.trim();
  if (texto && FBC_COMPLETO.test(texto)) return texto;

  const fbclid = extrairFbclid(texto);
  if (!fbclid) return null;
  if (!Number.isFinite(criadoEmMs) || criadoEmMs <= 0) return null;

  return `fb.1.${Math.trunc(criadoEmMs)}.${fbclid}`;
}
