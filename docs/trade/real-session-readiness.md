# Foco Trade — contrato de prontidão da sessão REAL

## Objetivo

Deixar a execução REAL preparada operacionalmente sem transformar o Foco Trade em robô autônomo e sem exigir alteração de código quando o operador decidir começar a usar conta real.

## Estados operacionais

1. `PAPER` — laboratório e validação de estratégias.
2. `REAL_CAPABILITY_PENDING` — infraestrutura REAL ainda possui gates técnicos pendentes.
3. `REAL_AVAILABLE_DISARMED` — infraestrutura, conta, bridge, feed, política e reconciliação estão aptos, mas nenhuma sessão REAL está armada.
4. `REAL_SESSION_ARMED` — sessão temporária explicitamente armada pelo operador.
5. `REAL_PROPOSAL_PENDING` — existe proposta, mas nenhuma ordem foi enviada.
6. `REAL_PREPARED` — proposta foi revisada e recebeu nonce de confirmação.
7. `REAL_CONFIRMED` — operador confirmou explicitamente a ordem individual.
8. `REAL_RECONCILING` — comando enviado ao bridge e aguardando confirmação/reconciliação do MT5.
9. `REAL_DISARMED` — novas ordens bloqueadas.

## Invariantes

- Selecionar modo REAL nunca arma a sessão automaticamente.
- Armar uma sessão nunca envia uma ordem.
- Cada ordem REAL continua exigindo proposta + revisão + confirmação final explícita.
- O backend permanece fail-closed: qualquer gate inválido bloqueia a execução.
- Kill switch, validação de conta, símbolo, feed, sessão B3/MT5, limites de risco, exposição, frequência, slippage e reconciliação não podem ser contornados pela UI.
- A sessão armada deve expirar automaticamente e possuir ação de desarme imediato.
- Nenhum segredo de bridge, service role ou assinatura pode ser enviado ao cliente.
- Mudança de conta, símbolo, estratégia/versão autorizada ou estado crítico da bridge invalida a prontidão da sessão.
- PAPER permanece independente do estado REAL.

## Separação de responsabilidades

### Capacidade estática

Configuração feita uma única vez na infraestrutura/EA para permitir que o pipeline REAL exista. Ela não representa consentimento para operar.

### Prontidão dinâmica

Readiness calculada pelo servidor a partir de política, autorização da estratégia, conta, bridge, feed, sessão, risco, exposição, frequência e reconciliação.

### Arming humano

Consentimento temporário do operador para aceitar propostas REAL. Deve ser persistido e auditável, com expiração. O arming não substitui a confirmação de cada operação.

### Confirmação por operação

A ordem só pode seguir após o fluxo existente de preparação e confirmação final da proposta específica. Quantidade, entrada, stop, alvo e risco devem continuar vinculados ao snapshot validado.

## UX alvo

A Mesa de Operações deve distinguir claramente:

- `REAL · CONFIGURAÇÃO PENDENTE`
- `REAL · DISPONÍVEL / DESARMADO`
- `REAL · SESSÃO ARMADA ATÉ HH:MM`
- `REAL · BLOQUEADO POR <gate>`

O botão de arming deve ser separado do seletor PAPER/REAL e exigir confirmação explícita. Quando armado, deve existir `DESARMAR REAL` em posição visível.

## Critério de aceite

O operador pode deixar a capacidade REAL configurada uma vez e, posteriormente, armar/desarmar sessões pela aplicação sem editar código. Mesmo com sessão armada, nenhuma ordem é enviada sem a confirmação humana da operação individual. Falhas de qualquer gate crítico bloqueiam a execução e ficam auditáveis.
