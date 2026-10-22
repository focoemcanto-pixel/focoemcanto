> Registro histórico superado pela correção seletiva descrita em `motion-restoration.md`. A landing atual não exibe aviso de acréscimo nem total parcelado e mantém o pin original da cena de valor.

# Fechamento comercial da BLACK FOCO 2026 — 19/10/2026

Escopo: apresentação comercial e links da `/black/`. Não alterar Comunicação, Kiwify, webhooks, grants, Ficha 360, banco, automações ou produtos nas plataformas.

## Fonte de verdade

Definição explícita do responsável pela campanha:
- Checkout único: https://pay.kiwify.com.br/ZVKGmNk
- À vista: R$ 997,00.
- Parcelamento: 12 × R$ 103,11, com acréscimo; total calculado em centavos: R$ 1.237,32.
- Universo Foco em Canto vitalício: Formação/Mentoria Foco em Canto e Foco em Harmonia são componentes do mesmo Universo, não três compras.
- 1 ano incluído: Foco Premium, Harmomus Premium, GVIP / Plataforma de Duetos.
- eBooks/Guias integrantes da Black incluídos; sem inventar quantidade, duração ou novos bônus.

Checkout conferido no navegador: título BLACK FOCO 2026, país Brasil, seletor exibindo “12x de R$ 103,11”, alternativa “R$ 997,00” e aviso “Parcelamento com acréscimo”. Nenhum dado de comprador preenchido; nenhuma compra realizada. Geolocalização inicial EUA apresentou moeda internacional; apenas a seleção pública de país foi alterada, sem modificar produto/configuração Kiwify.

## Implementação

`black-config.ts` centraliza pagamento, checkout e grupos de acesso. A economia monetária/percentual do value stack mantém os valores de referência previamente aprovados e é explicitamente rotulada **à vista**, sem aplicar essa economia ao parcelamento. Descrições do Canto, inclusões e FAQ ajustadas para separar conteúdo vitalício de acompanhamento Premium por 1 ano; mensagens de checkout pendente e pré-abertura removidas dos blocos ativos.

CTAs de compra auditados:
1. Header: “GARANTIR ACESSO”.
2. Revelação da oferta: “QUERO GARANTIR MEU ACESSO”.
3. Encerramento cinematográfico: mesmo CTA.

Todos utilizam a mesma configuração e são links reais, sem iframe de checkout nem captura de informações de pagamento. “Conhecer por dentro”, voltar ao universo, navegação de produtos, vídeos, FAQ e âncoras editoriais mantêm suas ações próprias; não são CTAs de compra. Não existe novo CTA sticky.

## Mobile e movimento

Parcela em uma única linha com espaço não separável e fonte responsiva; preço à vista próximo, legível; aviso de acréscimo e total parcelado explícitos. O contrato completo da oferta usa fluxo natural em telas até 760px ou com menos de 850px de altura estável. Somente a cena de valor é dispensada do pin nesses casos, evitando comprimir/esconder condições em uma viewport. Universo, intro e fusão mantêm o motor anterior. Reduced motion continua estático, com todas as condições disponíveis.

## Validação e publicação

Build estático, typecheck estrito Black e testes da rota. Inspeção do export deve confirmar três links de compra iguais e condições corretas, sem promessas de juros zero. Navegador desktop: verificar layout da oferta e clique chegando ao checkout; não comprar. As APIs de navegador disponíveis não fornecem emulação de viewport/iPhone: registrar separadamente revisão estática 390/430 e limitação de QA Safari físico, sem afirmar certificação visual mobile.

PR #32 permanece draft e sem merge. Publicação direta segue a estratégia anterior: preservar todos os arquivos da produção que não pertencem à Black, acrescentar chunks novos e substituir apenas `/black/` e seus assets quando necessário. Nenhuma mudança de código em Functions ou Worker. Antes de publicar, validar que o deployment anterior continua sendo o ativo.

Rollback inicial desta revisão: deployment Pages `ec8ba268-5bd6-47f1-af39-8475307c6273`, publicado anteriormente e mantido no histórico. A versão nova deve ter seu ID registrado no PR. Um futuro deploy de main ainda pode substituir a publicação direta enquanto o PR não for integrado por autorização separada.
