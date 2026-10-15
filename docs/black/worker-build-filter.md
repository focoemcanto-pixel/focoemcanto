# Worker build filter — BLACK FOCO

Auditoria realizada em 15/10/2026 UTC (14/10/2026, Bahia), via plugin Cloudflare, após autorização específica. Worker: `foco-whatsapp-scheduler`; repositório `focoemcanto-pixel/focoemcanto`.

## Causa confirmada

O build `df17da0d-4c25-4353-82fc-327831d7c54d` foi originado por `push_event` da branch `feat/black-focus-2026`, commit `5ddeb32`. O gatilho do Cloudflare Workers Builds `4f3769a4-bc05-449d-9bca-477e276e5ee8`, “Deploy non-production branches”, aceitava `branch_includes: ["*"]`, excluía somente `main` e aceitava qualquer caminho. Diretório `/workers/whatsapp-scheduler`; comando `npx wrangler versions upload`; sem build command; sem deploy hook nesse acionamento.

**Correção do diagnóstico anterior:** a URL do check continha `/production/builds/`, mas isso não demonstrava promoção de versão para produção. A API confirmou upload de versão, não `wrangler deploy`. O deployment ativo continuava sendo de 13/10/2026, anterior aos pushes da Black. A investigação inicial foi conservadora, mas a afirmação de deploy de produção era imprecisa.

O único workflow GitHub versionado é `extract-closet.yml`, restrito a main e ao próprio arquivo; não publica o scheduler. A origem deste acionamento é o gatilho externo Cloudflare conectado ao GitHub, não esse workflow, cron ou hook.

## Menor alteração aplicada

PATCH exclusivo em `/accounts/{account_id}/builds/triggers/4f3769a4-bc05-449d-9bca-477e276e5ee8`:

```json
{"branch_excludes":["main","feat/black-focus-2026"]}
```

| Gatilho | Antes | Depois | Comando |
|---|---|---|---|
| Versões / não produção | Inclui todas; exclui main | Inclui todas; exclui main e feat/black-focus-2026 | `npx wrangler versions upload` — preservado |
| Produção | Inclui somente main; nenhuma exclusão | Idêntico | `npx wrangler deploy` — preservado |

A produção já utilizava lista restrita a main. Por isso não foi necessário reestruturar CI/CD nem desabilitar previews legítimos de outras branches. Uma única exclusão adicional no gatilho não produtivo impede qualquer build automático dessa branch para esse Worker, além de manter o bloqueio produtivo já existente.

## Verificação

GET independente após PATCH confirmou a exclusão. Comparação integral do gatilho produtivo antes/depois: idêntico, incluindo modified_on. Deployment ativo antes/depois: `965d5f0f-18dc-4d11-8ef4-02a6c1bf86e5`, versão `fecd21f0-9465-46c1-a605-e7352b27f40c` a 100%, criado em 13/10/2026 10:43:26 UTC. O histórico também confirmou build legítimo de main com sucesso pelo gatilho produtivo.

Não foi disparado deploy de produção de teste: validação do fluxo legítimo por configuração preservada e histórico. A verificação empírica da exclusão utiliza o envio autorizado da revisão Black e a inspeção de builds/deployments depois do preview Pages.

Nenhum código/configuração versionada do Worker, cron, fila, webhook, secret, variável, binding, banco, Worker adicional ou comportamento de runtime foi modificado. Somente filtro externo de branch. PR #32 permanece draft; não há merge nem publicação da landing em produção.
