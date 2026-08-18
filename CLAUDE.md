# CLAUDE.md

O padrão de trabalho deste repositório está em **[`AGENTS.md`](./AGENTS.md)**.
Leia antes de implementar qualquer mudança.

Resumo do que ele exige — os detalhes estão lá:

1. **Toda tarefa vira uma Issue** classificada como Correção, Melhoria ou Nova
   função, usando os templates de `.github/ISSUE_TEMPLATE/`.
2. **Toda entrega vira um Pull Request** que menciona a Issue (`Closes #N`),
   explica o que mudou, como foi validado, e registra riscos, limitações e
   próximos passos. Nada entra na `main` por push direto.
3. **`npm run verify` e `npm run test:e2e` passam antes do PR.**
4. **O contrato de arquitetura é cravado na CI**: `components/` nunca importa
   `server/`.
5. **O visual segue `docs/design-system.md`** — tokens da marca, nada inventado.

Este arquivo existe só para apontar. Regra nova vai no `AGENTS.md`.
