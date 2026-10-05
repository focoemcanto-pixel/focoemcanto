# Homologação do transporte EA v2 em produção

## Diagnóstico confirmado

O POST real autenticado do EA foi capturado no audit server-side em 05/10/2026 UTC: HTTP 400, `error="Identidade/batch inválido"`, `errorCode=BRIDGE_ID_MISMATCH`, `stage=validateBatch`, `field=bridgeId`. Payload: xp-mt5-primary, WINV26, protocolo 2, batch 8883, 0 ticks, 1.500 candles, 0 eventos. Não alcançava a RPC.

O runtime confirmou TRADE_BRIDGE_ID definido com 31 caracteres, diferente da identidade do EA e da bridge persistida. A divergência não desaparece ao remover whitespace externo. Nenhum token ou fingerprint foi registrado. O valor correto desse binding de produção é `xp-mt5-primary`, conforme a identidade já autorizada/persistida. Corrigir esse binding e publicar a configuração; não trocar o token ou parâmetros financeiros do EA para resolver a rejeição.

As duas RPCs estão presentes com `(p_batch jsonb,p_execution boolean,p_max integer,p_account text,p_max_age integer)`. A RPC v2 foi testada no Supabase real com SET LOCAL ROLE service_role e execution=false, em transação revertida: resultado `{command:null}`. Nenhuma migration nova necessária.

## Diagnóstico agora disponível

Exchange retorna código estável, stage, campo e contagens sanitizadas. Registra console server-side e `trade_bridge_audit` por RPC existente `trade_real_audit`; payload.kind distingue TRANSPORT_REJECTED/TRANSPORT_ACCEPTED. O nome histórico action=real_attempt dessa RPC não significa criação de ordem. Registros são limitados por intervalo; feed nunca usa esse cache como persistência substituta.

Com backend disarmado, `commandWire(null)` é aplicado independentemente de qualquer comando inesperado devolvido pela RPC. Recibo de transporte registra HTTP 200/OK e commandCount=0. Dois batches sucessivos do EA provam que ele recebeu HTTP 200 e OK, porque o terminal só libera pending/incrementa o fluxo após esse retorno.

Nenhum tick atual é exigido para ACK de transporte. Domingo pode ter ticks vazios/históricos e candles fechados; LIVE continua dependendo de freshness e será validado no pregão.

## FILE_COMMON e atualização v2.01

O batch rejeitado atual já declara protocolVersion=2. Isso não indica pending v1 como causa do HTTP 400 observado. Não temos acesso ao disco do Mac para afirmar se há outros arquivos legados.

EA v2.01 melhora logs: HTTP não-200 mostra código retornado pelo backend; GetLastError só aparece para falha de rede, depois de ResetLastError. Evita associar o stale error 5004 de leitura de arquivo a um HTTP 400. HTTP 200 OK é registrado no Experts na primeira recuperação; status/ACK anterior são transmitidos no heartbeat seguinte.

Upgrade de pending v1 exige mesma bridge, símbolo e fingerprint local, execução desabilitada e tickSize válido. Arquivo original é copiado para pending_upgrade_<hash>.txt. Substitui somente state por metadados atuais v2, mantendo sessão, batch, ticks, candles e IDs de eventos. Não reinicia watermark/cursor nem gera novo ID para o mesmo lote. Se identidade divergir ou protocolo for desconhecido, mantém evidência e bloqueia recovery.

ledger.txt, refs.txt, seen.txt e events.txt não são apagados. reply interrompido é arquivado em reply_quarantine_<hash>.txt e seus comandos são colocados no ledger sem execução; nunca são reenviados ao broker. Backup/migration repetida é idempotente. O contrato de upgrade está coberto por teste de referência TS; a compilação MQL5 continua sendo feita no MetaEditor do usuário.

Instalar 2.01: baixar o .mq5 atualizado, F4/MetaEditor, F7 (0 errors), recarregar uma única instância no WINV26 mantendo o token privado e EnableExecution=false. Não apagar arquivos FocoTrade_* e não habilitar Algo Trading. A correção do binding é suficiente para destravar o batch v2 atual; 2.01 traz diagnóstico/recovery e não é exigido para corrigir a identidade do Worker.

## Gates preservados

TRADE_EXECUTION_ENABLED=false; EnableExecution=false; kill_switch=true; política enabled=false; live_authorized=false. Nenhum teste cria comandos ou envia BUY/SELL/OrderSend à XP. Testes de API usam fixtures locais; teste real de RPC é revertido, sem inventar feed atual no banco de produção.

Validação desta correção: 114 testes Trade aprovados, typecheck strict, build Pages Functions e Next/export aprovados. Transporte de produção ainda requer corrigir o binding e comprovar ACK/batches sucessivos; não foi marcado concluído por testes locais.
