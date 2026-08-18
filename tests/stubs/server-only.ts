/**
 * Substituto de `server-only` nos testes.
 *
 * O pacote real existe só para quebrar o build quando um módulo de servidor é
 * importado do cliente. Em teste o módulo roda em Node por definição, então o
 * marcador não precisa fazer nada.
 */
export {};
