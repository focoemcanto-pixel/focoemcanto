# Foco Trade — validação antes do deploy

Este checklist serve para revisar o pacote sem alterar nenhuma configuração operacional.

## Código

- confirmar que PAPER continua independente;
- confirmar que selecionar REAL não dispara ação externa;
- confirmar que propostas antigas expiram;
- confirmar que quantidade, entrada, stop, alvo e risco pertencem ao mesmo snapshot;
- confirmar que mudança de estratégia/versão invalida propostas antigas;
- confirmar que o backend rejeita dados incompletos ou divergentes;
- confirmar que nenhuma credencial ou fingerprint é renderizada no cliente.

## Feed e bridge

- heartbeat recente;
- tick recente e coerente;
- Bid menor ou igual ao Ask;
- símbolo do feed igual ao símbolo autorizado;
- contrato não expirado;
- sessão de mercado coerente;
- histórico e reconciliação recentes;
- nenhum comando indeterminado pendente.

## Risco

- limite por operação configurado;
- limite diário configurado;
- limite de contratos configurado;
- limite de posições configurado;
- exposição nocional configurada;
- frequência por sessão/dia configurada;
- stop respeita distância mínima;
- lote respeita mínimo, máximo e step;
- perda corrente mais risco reservado não ultrapassa limite diário.

## Experiência

- mostrar PAPER/REAL sem sugerir que selecionar REAL executa ordem;
- exibir os gates bloqueados com motivo legível;
- manter proposta, revisão e confirmação final como etapas distintas;
- manter ação de emergência visível quando houver execução habilitada externamente.

## Critério de liberação

Não publicar como operacional se qualquer gate crítico falhar, se o build/teste falhar, se a migration estiver pendente ou se a reconciliação com MT5 estiver inconsistente. Nenhum teste de interface deve enviar ordem real.
