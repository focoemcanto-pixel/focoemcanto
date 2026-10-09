# Gestão operacional REAL e provisionamento do EA v2.08

O app é a fonte da policy operacional. Cada salvamento de gestão cria uma versão auditável e desarma a sessão, como antes. Os campos do EA `MaxRiskBRL`, `MaxLoss24hBRL`, `MaxSlippagePoints`, `MaxContracts` e `MaxPositions` são hard caps locais: o backend nunca os altera. Zero bloqueia. O limite efetivo é sempre o menor entre policy, teto administrativo (quando houver) e hard cap. Aumentar a policy acima do teto local não aumenta o risco permitido; a UI mostra o teto que prevalece.

## Provisionamento inicial (uma vez)

Instale/compile `mt5/FocoTradeBridge.mq5` v2.08 no MetaEditor, substituindo o EA v2.07. Preserve token, fingerprint e limites atuais. Não apague FILE_COMMON, ledger, pending, cursor ou arquivos de reconciliação. Só uma instância pode possuir o bridge.

Configure conta, `ExpectedAccountFingerprint`, `EnableExecution`, permissões de Algo Trading e hard caps deliberadamente. Não aumente um teto para copiar a policy. Valores atuais do operador: 15/45/50, um contrato e uma posição. Não foram ampliados. Esses tetos deixam a gestão variar pelo app até seus respectivos máximos; exceder um teto exige uma decisão local de segurança.

Depois da instalação, a rotina é: configurar gestão no app, autorizar versões específicas, esperar policy sincronizada, armar sessão, aguardar proposta válida, escolher entrar e confirmar no passo final. Nenhum desses passos anteriores à confirmação humana envia ordem.

## Protocolo v2, compatibilidade e identidade

v2.08 anuncia `policyProtocol=1`, reporta `policyReceipt.version/hash/validUntil` e `localLimitsSemantics=HARD_CAPS`. EAs antigos mantêm CMD2 original e gates originais, sem receber o novo formato. Nenhum limite legado é relaxado. O painel informa quando o EA continua legado.

Resposta: `OK\nPOLICY2|version|hash|accountHash|bridgeSession|symbol|maxRiskBRL|maxLossBRL|maxSlippagePoints|maxContracts|maxPositions|maxPositionContracts|maxNotionalBRL|maxOrdersPerSession|maxOrdersPerDay|maxSessionMinutes|realSessionId|armedAtMs|expiresAtMs|armed|issuedAtMs|validUntilMs|HMAC-SHA256\n`.

O hash é o fingerprint MD5 existente da policy persistida (identificador de versão/conteúdo, não autenticação). A autenticidade é HMAC-SHA256 com o token já provisionado. O snapshot é emitido novamente em cada exchange; sua expiração curta não é a duração da sessão. Conta, símbolo, identidade do bridge, versão, todos os limites e tempo são autenticados. O EA não restaura esse permit após reiniciar e não aceita versão inferior. Snapshot desarmado sincroniza a policy sem permitir ordem.

CMD2 estendido conserva os 14 campos canônicos antigos e acrescenta `P2|policyVersion|policyHash|realSessionId` antes da assinatura. O EA v2.08 exige os campos e valida a correspondência com o snapshot recebido na mesma resposta. Comandos antigos não executam no v2.08. Atualizar a policy invalida sessões/confirmações/fila pelo fluxo existente. SQL confere o receipt antes de armar, validar proposta ou despachar; a confirmação humana existente continua obrigatória.

A policy inclui risco, perda, slippage, quantidade, posições, notional, frequência e duração. O EA verifica risco via OrderCalcProfit, hard caps com min(), metadados/lote/SL/TP, exposição vazia, limite nocional, sessão e frequência conservadora por intents duráveis. Tentativas rejeitadas podem consumir a contagem local (comportamento conservador; o backend também impõe frequência). O dia local usa o relógio do broker. SL técnico nunca é deslocado para caber no risco.

## Transporte e reconciliação

5203 é ERR_WEBREQUEST_REQUEST_FAILED. Status 1003 não é HTTP; não deve ser tratado como ACK. HTTP 200 intercalado prova recuperação, mas não identifica sozinho Wine, proxy, TLS, rede ou build do MT5 como origem. v2.07 não persistia o erro de rede nem o build, e seu pending congelava a telemetria até ser drenado: não é possível atribuir uma causa específica com essa evidência histórica.

v2.08 envia `X-Foco-Transport` autenticado, separado do batch durável: contador acumulado, falhas consecutivas, status, erro de rede, último erro/recuperação, latência e build do terminal. O backend aceita somente campos numéricos limitados e não muda identidade, ticks, eventos, cursores ou policy receipt do batch. A UI distingue CONNECTED, DEGRADED (erro pendente/recuperação recente) e OFFLINE (heartbeat antigo).

Falha mantém o mesmo pending e desativa o permit local imediatamente. O primeiro ACK de recuperação não executa comando; o próximo heartbeat informa recuperação para reconciliação. Um comando já claimed permanece dispatch_unknown e nunca é leased novamente. Resposta interrompida ao reiniciar fica em quarentena, nunca é replay de OrderSend. Nenhum retry transforma entrega ambígua em nova ordem. Após indisponibilidade crítica/sessão desarmada, rearmar continua sendo uma decisão humana.

## Validação e limites da entrega

Testes cobrem assinatura, identidade, policy × hard caps, mudança/versionamento e desarme, receipts/reconnect, telemetria e duplicação de batch. A suíte existente cobre confirmação humana, dispatch_unknown, reconciliação e idempotência. Build TypeScript/Worker não compila MQL5. Compilação no MetaEditor e heartbeat real v2.08 são necessários antes de declarar sincronização de produção validada. Nunca enviar uma ordem REAL para homologar.
