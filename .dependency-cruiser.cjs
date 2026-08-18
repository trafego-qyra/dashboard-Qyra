/**
 * Contrato de arquitetura.
 *
 * As camadas do projeto e quem pode depender de quem:
 *
 *   app/         telas e rotas HTTP  → pode tudo
 *   components/  UI                  → lib/ apenas
 *   server/      backend e segredos  → lib/, mocks/
 *   lib/         puro, compartilhado → nada do projeto
 *   mocks/       fixtures            → lib/
 *
 * A regra que mais importa: `components/` nunca importa `server/`. É ela que
 * impede um segredo de vazar para o bundle do cliente.
 */
module.exports = {
  forbidden: [
    {
      name: "ui-nao-importa-servidor",
      severity: "error",
      comment:
        "Componente de UI não pode importar a camada de servidor — é assim que credencial vaza para o cliente. Passe o dado pronto por props ou busque em um server component.",
      from: { path: "^src/components" },
      to: { path: "^src/server" },
    },
    {
      name: "lib-e-pura",
      severity: "error",
      comment:
        "src/lib é a base compartilhada: não pode depender de UI, servidor ou telas, senão deixa de ser importável dos dois lados.",
      from: { path: "^src/lib" },
      to: { path: "^src/(components|server|app|mocks)" },
    },
    {
      name: "servidor-nao-importa-ui",
      severity: "error",
      comment: "A camada de servidor não renderiza nada; não deve depender de componentes.",
      from: { path: "^src/server" },
      to: { path: "^src/components" },
    },
    {
      name: "mocks-nao-importam-servidor",
      severity: "error",
      comment: "Fixtures são dados puros: não podem arrastar conector nem credencial.",
      from: { path: "^src/mocks" },
      to: { path: "^src/(server|components|app)" },
    },
    {
      name: "sem-ciclos",
      severity: "error",
      comment: "Dependência circular quebra tree-shaking e torna a ordem de carga imprevisível.",
      from: {},
      to: { circular: true },
    },
    {
      name: "sem-orfaos",
      severity: "warn",
      comment: "Módulo sem ninguém importando: ou falta ligar, ou deveria ter sido removido.",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$",
          "^src/app/",
          "^src/instrumentation\\.ts$",
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require"] },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
