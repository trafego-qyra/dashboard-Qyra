/**
 * Gerador determinístico de dados fictícios.
 *
 * Determinismo importa: sem ele o snapshot dos testes muda a cada execução e
 * o dashboard "pisca" números diferentes a cada render. A semente vem da data
 * + canal + métrica, então o mesmo dia sempre rende o mesmo valor.
 */

/** Hash 32-bit (FNV-1a) — barato e estável entre Node e browser. */
function hash(seed: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return h >>> 0;
}

/** Ruído pseudo-aleatório estável em [0, 1). */
export function noise(seed: string): number {
  return hash(seed) / 4_294_967_296;
}

/** Ruído em torno de 1, com amplitude controlada. */
export function jitter(seed: string, amplitude = 0.25): number {
  return 1 + (noise(seed) - 0.5) * 2 * amplitude;
}

/**
 * Série diária com tendência suave, sazonalidade semanal e ruído.
 * Fim de semana cai — é o padrão real de tráfego de clínica.
 */
export function dailyValue(
  seed: string,
  date: string,
  base: number,
  options: { trend?: number; weekly?: number; amplitude?: number } = {},
): number {
  const { trend = 0.15, weekly = 0.18, amplitude = 0.18 } = options;
  const day = new Date(`${date}T00:00:00Z`);
  const dow = day.getUTCDay();
  const index = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

  const trendFactor = 1 + trend * Math.sin(index / 45);
  const weekFactor = dow === 0 || dow === 6 ? 1 - weekly : 1 + weekly / 5;

  return Math.max(0, base * trendFactor * weekFactor * jitter(`${seed}:${date}`, amplitude));
}

export function pick<T>(seed: string, items: readonly T[]): T {
  return items[hash(seed) % items.length];
}
