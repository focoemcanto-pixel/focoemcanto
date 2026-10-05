# Foco Trade — homologação de sessão REAL

## Objetivo

Deixar o produto pronto para a transição PAPER → REAL sem esconder ou remover proteções de execução. A ativação de dinheiro real continua sendo uma ação operacional consciente e cada ordem exige confirmação humana explícita.

## Estado exigido antes de armar REAL

- feed XP/MT5 `LIVE` dentro do limite de freshness;
- símbolo/contrato vigente e consistente entre bridge, backend e proposta;
- fingerprint da conta MT5 autorizado;
- somente uma sessão de bridge ativa;
- nenhuma entrega indeterminada pendente;
- política de risco carregada e válida;
- limite de contratos, risco por operação, perda diária e exposição simultânea respeitados;
- estratégia/versionamento explicitamente autorizados para LIVE;
- stop técnico e alvo válidos;
- reconciliação de ordens e posições saudável;
- kill switch operacional;
- backend e EA preparados para execução;
- zero envio automático por detecção de setup.

## Fluxo operacional pretendido

1. PAPER continua disponível como laboratório principal.
2. A tela REAL mostra readiness server-side e cada gate individual.
3. O operador arma uma sessão REAL conscientemente somente depois de todos os gates passarem.
4. O scanner pode detectar setups, mas não envia ordem.
5. Uma proposta REAL mostra direção, entrada de referência, stop, alvo, quantidade, risco em pontos/R$, potencial e R:R.
6. O operador escolhe `NÃO ENTRAR` ou `ENTRAR · ORDEM REAL`.
7. Antes do envio existe uma segunda confirmação explícita (`CONFIRMAR ORDEM REAL`).
8. O backend revalida feed, proposta, conta, política, exposição e freshness imediatamente antes de enfileirar o comando.
9. MT5/XP devolvem o resultado efetivo; HTTP/click nunca é tratado como execução.
10. Entrega indeterminada bloqueia reenvio automático até reconciliação.
11. O operador pode bloquear novas ordens pelo kill switch a qualquer momento.

## Critério de homologação

PAPER valida lógica/estratégia, mas não prova execução real. Antes de usar capital, validar o caminho de execução em ambiente apropriado da corretora quando disponível e, no primeiro uso REAL, limitar a exposição ao mínimo definido na política.

## Segurança de produto

Não transformar readiness em bypass. Não remover `TRADE_EXECUTION_ENABLED`, autorização de estratégia, account hash, kill switch, `EnableExecution` do EA, validação de risco ou segunda confirmação. Esses controles devem convergir para uma experiência operacional clara, não desaparecer.

## Pendências de infraestrutura

A configuração/migration de produção deve ser aplicada e verificada no Supabase/Cloudflare/MT5 antes de declarar `REAL PRONTO`. Uma alteração apenas de interface não constitui homologação.
