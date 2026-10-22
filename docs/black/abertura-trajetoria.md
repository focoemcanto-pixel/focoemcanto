# Aula especial + abertura — proposta implementada no preview

Base: `00d973eccd124de6b3094af1000ca5fb0741a292`.
Branch: `feat/black-prelaunch-capture`. Somente landing `/black`.

## Evento aprovado

12 de novembro de 2026, quinta-feira, 20h, horário de Brasília.
Formato: aula especial + abertura da BLACK. Oferta apresentada e liberada durante
a transmissão. O início da aula não é uma troca automática de estado: o HUB
continua responsável por PRE-LAUNCH / OPEN. Nenhum horário exato para a oferta
foi inventado na landing.

No primeiro ato: campanha, professor, proposta, data/hora e CTA da lista.
No OPEN: convite futuro não é renderizado; aparece BLACK ABERTA. Valor,
parcelamento, checkout, benefícios e duração permanecem intactos.

“Por que entrar na Lista Prioritária?” complementa a ponte existente, sem pin.
Não promete desconto exclusivo, vagas reservadas, materiais extras ou endosso.

## Documento visual

Fonte: `IMG_5770 4(2).JPG`, enviada pelo Marcos, 2048 × 1365.
WebP desktop 1600 × 1066 / mobile 900 × 600, proporção preservada, sem geração ou
animação de pessoas. Imagem lazy-loaded como passagem editorial de trajetória,
antes da cena de acompanhamento existente; ambas as pessoas/contexto preservados.
Legenda factual: “Marcos Cruz ao lado de Raul Gil, no palco.” Não é depoimento,
recomendação, parceria nem participação na Black. IMG_5785 permanece no hero.

Parallax da fotografia limitado a 24px no total, dirigido pelo RAF existente,
com geometria lida apenas no rebuild. Nenhum novo pin ou spacer. Reduced motion
mantém documento e legenda estáticos. CTA do primeiro ato recebe inert enquanto
está invisível e é restaurado no scroll reverso/fallback.

## Encerramento ainda não aprovado

Recomendação: 16/11, com encerramento real das condições caso aprovado.
17/11 somente se houver razão operacional concreta; não extensão automática por
vendas abaixo da expectativa. `deadline` continua null, sem prazo, timer ou urgência
publicados. Nenhuma configuração do checkout foi alterada.

## Integração preservada / pendências

Nenhum deploy do HUB, CORS, mensagem privada, grupo, captação ou dado real foi
alterado. A configuração de data/mensagem do HUB precisa ser alinhada ao evento
aprovado antes da ativação real; o preview novo precisa de origem autorizada para
E2E público. Não foi criado proxy, wildcard ou atalho de autenticação para QA.
