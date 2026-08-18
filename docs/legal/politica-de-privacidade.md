# Política de privacidade — Dashboard QYRA

> **MINUTA — pendente de aprovação jurídica.** Não publicar como vigente.
> Ver `docs/legal/README.md`.

**Versão:** rascunho · **Última revisão técnica:** — · **Aprovação jurídica:** pendente

## 1. A quem se aplica

Esta política descreve como o Painel trata dados pessoais, nos termos da Lei
13.709/2018 (LGPD). Aplica-se aos usuários autorizados do Painel.

## 2. O que o Painel trata

### 2.1 Dados agregados de campanha

O Painel exibe **métricas agregadas**: investimento, impressões, cliques,
leads, conversões, sessões, alcance e engajamento. Esses números descrevem
comportamento de audiência em conjunto e **não identificam pessoas**.

O Painel **não** coleta, exibe ou armazena nome, e-mail, telefone, CPF, dado de
saúde ou qualquer informação de paciente. Ele não tem acesso a formulários de
lead nem a prontuário.

### 2.2 Dados do usuário do Painel

Para operar o controle de acesso e a observabilidade, são tratados:

| Dado | Finalidade | Base legal (a confirmar pelo jurídico) |
|---|---|---|
| Identificação de acesso | Autorizar o uso | Execução de contrato / legítimo interesse |
| Endereço IP | Rate limit e proteção contra abuso | Legítimo interesse |
| Registro técnico de erro | Diagnóstico e correção | Legítimo interesse |

## 3. Onde os dados ficam

- **Nenhum banco de dados próprio.** O Painel não persiste dados de campanha:
  consulta as APIs de origem sob demanda e mantém um cache temporário em
  memória (padrão: 5 minutos), perdido a cada reinício.
- **Hospedagem:** Vercel, região São Paulo (`gru1`).
- **Monitoramento de erro:** Sentry, quando configurado, com envio de dados
  pessoais desabilitado (`sendDefaultPii: false`) e remoção de tokens da URL
  antes do envio.

## 4. Compartilhamento

Não há compartilhamento de dados com terceiros além dos operadores necessários
à prestação do serviço (Vercel e Sentry). As plataformas de origem — Meta e
Google — são **fontes** dos dados agregados e tratam dados pessoais segundo as
próprias políticas.

## 5. Segurança

- Comunicação exclusivamente por HTTPS, com HSTS.
- Credenciais de API armazenadas como variáveis de ambiente cifradas na Vercel,
  nunca no código.
- Separação técnica entre frontend e backend, verificada automaticamente a cada
  alteração, impedindo que credenciais cheguem ao navegador.
- Política de segurança de conteúdo (CSP) restritiva e proteção contra
  incorporação em outros sites.
- Limite de requisições por origem.

## 6. Retenção

- Cache de métricas: minutos, em memória.
- Registros de erro no Sentry: conforme a retenção contratada (padrão 90 dias).
- Logs da plataforma de hospedagem: conforme a política da Vercel.

## 7. Direitos do titular

Usuários do Painel podem solicitar confirmação de tratamento, acesso, correção,
anonimização, portabilidade ou eliminação dos seus dados, pelo contato abaixo.

## 8. Encarregado (DPO)

**A definir antes da publicação.**

## 9. Contato

`trafego@qyra.com.br`

## 10. Atualizações

Alterações relevantes serão comunicadas aos usuários autorizados.
