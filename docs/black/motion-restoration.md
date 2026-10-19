# Correção seletiva de motion e copy — 19/10/2026

Base visual imediatamente anterior à intervenção comercial: `dc3e9c8`. Revisão comercial corrigida: `6c8ccec`. Não reverter contrato, checkout, preços nem demais correções comerciais.

## Causa exata e restauração

A intervenção anterior acrescentou `staticValue` em `use-black-scroll.ts`: excluía a cena de valor da geometria quando largura <= 760px **ou altura estável < 850px**. O CSS `data-static-value=true` desativava posição pinned, transforms e opacity da construção/revelação, apresentando ambos os atos estaticamente. Essa exceção foi indevida para o escopo comercial.

O motor `use-black-scroll.ts` foi restaurado **byte a byte** ao commit `dc3e9c8`. Removidos filtro, limiares extras e atributos estáticos. Removidos os quatro overrides CSS estáticos. Retornam pin, soma progressiva, crossfade, escala/translação da revelação e scroll reverso, inclusive no mobile que já era elegível ao motor anterior. A distância original de valor permanece 1,35H.

Preservados os fallbacks anteriores: prefers-reduced-motion, falha de APIs/pin, zoom, altura estável < 620px e largura < 320px. Não remover acessibilidade para forçar animação.

## Auditoria do diff

Comparação com `dc3e9c8` confirma ausência de diferenças nos arquivos de hero/estilos gerais (`black.module.css`), motor CSS (`black-scroll.module.css`), `scroll-model.ts`, `value-model.ts`, Product Experience, Proof Stream, Video Stories e respectivos estilos. Capas e fotos não foram modificadas. Nenhum fundo, hover, transição, efeito de entrada, player ou carrossel foi removido nesses arquivos. Em `BlackExperience.tsx`, permanecem apenas links/copy comerciais; a árvore e os atributos das cenas não mudaram.

Na cena de oferta, mantida a hierarquia editorial existente e a timeline anterior. O CSS adicional acomoda somente o preço parcelado/à vista e o contrato agrupado. No mobile pinned, grupos em duas colunas e materiais em linha inteira preservam tamanho legível e espaço para preço/CTA sem suprimir animação.

## Copy final

12x de R$ 103,11 ou R$ 997,00 à vista. Checkout único https://pay.kiwify.com.br/ZVKGmNk. Removidos da landing e do FAQ aviso sobre acréscimo, total parcelado e helper que o calculava. Não anunciar juros zero. Não alterar a Kiwify: as condições detalhadas permanecem no checkout oficial.

Universo Foco em Canto vitalício reúne Formação/Mentoria + Harmonia; Foco Premium, Harmomus Premium e GVIP/Plataforma de Duetos por 1 ano; eBooks/Guias integrantes da Black. Mantidas as 20 provas originais e os três CTAs de compra.

## Validação e operação

Build, typecheck Black e testes da rota; busca de termos proibidos no export; comparação exata do motor e arquivos visuais com a base. Inspeção desktop do preview/produção e links de checkout, sem compra. API de navegador atual não fornece emulação 390/430 nem Safari: revisão CSS/mobile e restauração comprovada por diff não equivalem a QA visual em iPhone real.

PR #32 continua draft, branch feat/black-focus-2026, sem merge. Publicação corretiva preserva arquivos de outras páginas, Functions existentes e demais sistemas. A versão visual anterior completa `ec8ba268-5bd6-47f1-af39-8475307c6273` permanece no histórico como rollback emergencial, mas não é restaurada cegamente porque não contém o contrato/checkout atual. `ffde26b2` é a revisão substituída, não o rollback visual recomendado. Registrar IDs finais e limitações no PR.
