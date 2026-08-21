/**
 * Sessão do painel: uma senha compartilhada, um cookie assinado.
 *
 * **Este módulo não é `server-only` de propósito.** Ele roda também no
 * middleware, que executa antes de qualquer rota e fora do runtime Node —
 * `server-only` quebraria ali. Nada aqui toca dado de negócio: só assina e
 * confere um carimbo de validade.
 *
 * O cookie **não guarda a senha**. Guarda um instante de expiração e a
 * assinatura HMAC desse instante. Quem tiver o cookie não consegue extrair a
 * senha dele, e quem não tiver o segredo não consegue forjar um novo.
 *
 * O segredo padrão é a própria senha, e isso é intencional: trocar a senha
 * invalida toda sessão em aberto, que é exatamente o que se espera de uma
 * troca de senha. Quem quiser separar as duas coisas define
 * `QYRA_SESSAO_SECRET`.
 */

export const COOKIE_DA_SESSAO = "qyra_sessao";

/** Uma semana. Painel de trabalho: pedir senha todo dia vira post-it no monitor. */
export const DURACAO_DA_SESSAO_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Lê e limpa um valor do ambiente.
 *
 * Mesmo cuidado do `env.ts`: colar no painel da Vercel arrasta espaço e quebra
 * de linha com facilidade, e aqui um caractere invisível faria a senha certa
 * ser recusada para sempre — sem nenhuma pista do motivo.
 */
function doAmbiente(nome: string): string | null {
  const bruto = process.env[nome];
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim();
  return limpo === "" ? null : limpo;
}

/** A senha de acesso, quando configurada. */
export function senhaConfigurada(): string | null {
  return doAmbiente("QYRA_SENHA");
}

function segredo(): string | null {
  return doAmbiente("QYRA_SESSAO_SECRET") ?? senhaConfigurada();
}

/**
 * Comparação de tempo constante.
 *
 * Comparar com `===` vaza, pelo tempo de resposta, quantos caracteres iniciais
 * estão certos — o que transforma adivinhar uma senha de N caracteres em N
 * tentativas por posição em vez de todas as combinações.
 */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const bytesA = new TextEncoder().encode(a);
  const bytesB = new TextEncoder().encode(b);
  // O tamanho ainda vaza, e vazar o tamanho da senha é aceitável; o conteúdo não.
  if (bytesA.length !== bytesB.length) return false;

  let diferenca = 0;
  for (let i = 0; i < bytesA.length; i++) diferenca |= bytesA[i] ^ bytesB[i];
  return diferenca === 0;
}

function paraBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function assinar(mensagem: string, chaveBruta: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(chaveBruta),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return paraBase64Url(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(mensagem)));
}

/** A senha digitada confere com a configurada? */
export function senhaConfere(digitada: string): boolean {
  const esperada = senhaConfigurada();
  if (!esperada) return false;
  return iguaisEmTempoConstante(digitada.trim(), esperada);
}

/** Cria o valor do cookie para uma sessão que começa agora. */
export async function criarToken(agora = Date.now()): Promise<string | null> {
  const chave = segredo();
  if (!chave) return null;

  const expiraEm = String(agora + DURACAO_DA_SESSAO_MS);
  return `${expiraEm}.${await assinar(expiraEm, chave)}`;
}

/** O cookie apresentado é autêntico e ainda está no prazo? */
export async function tokenValido(token: string | undefined, agora = Date.now()): Promise<boolean> {
  const chave = segredo();
  if (!chave || !token) return false;

  const separador = token.indexOf(".");
  if (separador <= 0) return false;

  const expiraEm = token.slice(0, separador);
  const assinatura = token.slice(separador + 1);

  // Confere a assinatura ANTES do prazo: sem isso, um token forjado com data
  // no passado seria descartado sem custo, e um com data no futuro entraria na
  // verificação — a ordem não muda o resultado, mas mantém o caminho único.
  if (!iguaisEmTempoConstante(assinatura, await assinar(expiraEm, chave))) return false;

  const limite = Number(expiraEm);
  return Number.isFinite(limite) && limite > agora;
}
