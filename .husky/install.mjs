/**
 * Instala os ganchos do husky apenas em máquina de desenvolvimento.
 *
 * Em CI e na Vercel não existe hook a instalar (e às vezes nem diretório
 * `.git`), então o `prepare` precisa sair sem erro — caso contrário `npm ci`
 * falha e derruba o build.
 */
if (process.env.CI === "true" || process.env.NODE_ENV === "production" || process.env.VERCEL) {
  process.exit(0);
}

const husky = (await import("husky")).default;
console.log(husky());
