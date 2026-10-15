# BLACK FOCO 2026 — Proof Stream e revelação de valor

14/10/2026. Branch local `feat/black-focus-2026`; PR previsto #32. Revisão da implementação existente, sem redesign, dependências, checkout, backend ou alterações em outras rotas.

## Inventário completo revisitado

| Contexto | Encontrado / verificável | Usado dentro do produto | Origem |
|---|---|---|---|
| Mentoria Foco em Canto | 8 screenshots + 4 vídeos | 12/12 provas | `focoemcanto.com`, `app/page.tsx`, `public/images/depoimentos/depoimento-print-01..08.webp`, array `videoTestimonials` |
| Foco em Harmonia | 7 screenshots + 1 vídeo | 8/8 provas | `promo.focoemcanto.com`, páginas harmonia/v1/v2/b reutilizam `harmonia-promo/app/components/TestimonialCarousel.tsx` |
| Harmomus | 3 falas estáticas publicadas, mas sem origem documental verificável; zero solicitações `testimonial_public=true` | 0; prova social pendente | `harmomus-app/src/app/page.tsx`, `premium_requests`; `public/testimonials/harmomus-home-mobile.svg` contém PLACEHOLDER, excluído |
| Escola | Nenhuma prova comercial verificável adicional | 0; prova social pendente | Busca em Hub, tabelas e configurações; `live_sessions.offer_config.waiting_testimonials` não retornou configurações; `reviews` são correções pedagógicas |
| Harmonics | Mecanismo de coleta/admin, zero `client_reviews` no SELECT agregado | 0; autoridade pendente | `harmonics-app/components/avaliacoes/*`, `client_reviews`; não é produto ou entregável Black |
| Geral/ecossistema | Duas provas selecionadas dos contextos confirmados | Seleção global com indicação explícita de produto | Bárbara Mira / Mentoria e screenshot 7 / Harmonia, função de conexão entre formação e prática |

Contagem significa **registros de prova**, não pessoas únicas: Léia tem dois registros; vídeo de compilação pode reunir pessoas que também aparecem em outros materiais. Não anunciar “20 alunos diferentes”. Nenhum depoimento, pessoa, foto, frase, resultado, estrela, número de avaliação ou história foi inventado. Imagens originais conservam sua arte documental; nenhuma estrela nova foi adicionada. Ausência nas fontes auditadas não prova ausência em outras fontes futuras.

### Origem dos arquivos

Mentoria: os oito WebPs existentes são reutilizados diretamente, sem mover ou modificar. Harmonia: os sete originais 1080×1920 foram baixados de `https://promo.focoemcanto.com/images/depoimentos/%20depoimento-N.webp` (espaço no nome original); arquivo 1 já existia, 2–7 foram adicionados em `public/images/black/`. Somados: 368.674 bytes. Sem crop, filtro ou redesenho. Inspeção visual de todos os 15 screenshots em folha de contato.

Árvores completas dos repositórios de Harmomus, Harmonics, Hub e harmonia-promo foram pesquisadas por depoimentos/testimonials/reviews/avaliações; componentes, arrays e arquivos não simultaneamente visíveis também foram considerados. Não foram extraídos registros privados de clientes. As falas estáticas do Harmomus precisam de confirmação da sua origem antes de reutilização.

### Vídeos

Todos responderam ao endpoint público YouTube oEmbed, autor Foco Em Canto:

| ID | Título publicado | Produto |
|---|---|---|
| rDzhJn2SYbI | DEPOIMENTO FOCO EM CANTO - JOILMA | Mentoria |
| kenwsDb_0XM | Depoimento / Juliana Torquato (Foco em Canto) | Mentoria |
| 8LbwCcpvEdw | Evolução Talita / Foco em Canto | Mentoria |
| vbLXwcRl4NQ | DEPOIMENTOS FOCO EM CANTO | Mentoria |
| T0rDCxXoCR0 | Depoimento Juliana - Foco em Harmonia | Harmonia |

Não houve transcrição ou promessa de transformação inferida do título. Prioridade é editorial: resultado específico legível nos screenshots → experiência detalhada/vídeos já publicados → comentário sobre benefício → elogio curto. `priority`, `context`, `source`, `videoTitle` e IDs estão centralizados em `black-config.ts`.

## Experiência de prova

- Dentro da Product Experience, depois dos entregáveis: uma prova protagonista com vizinhas visíveis em escala/profundidade discreta; contador real; linha editorial de progresso. Não há troca automática.
- Desktop: controles, foco no palco com esquerda/direita/Home/End, scroll horizontal nativo e catálogo “Explorar todas” com acesso direto a qualquer registro.
- Mobile: swipe horizontal nativo; nenhum listener touch/wheel ou preventDefault de gesto cancela o scroll vertical. A Product Experience continua rolando verticalmente. Controles de 48px; sem dependência de hover.
- Só a prova ativa e suas vizinhas têm mídia montada. Provas distantes mantêm identificação leve. Apenas o vídeo ativo pode montar iframe; ao trocar, o player anterior é desmontado. Posters lazy e vídeo somente após clique; sem autoplay. O player ocupa o próprio quadro.
- Altura documental reservada, imagens contain sem crop, identificação por produto e contexto. Inativos ficam inert/aria-hidden, controles fora deles. Foco/ESC/retorno ao universo existentes preservados.
- Reduced motion remove escala/transições e usa deslocamento instantâneo nos controles. Todos os registros continuam alcançáveis.
- A seção global reduz de quatro provas repetidas para duas selecionadas com função de ecossistema; não apresenta depoimentos de Harmonics como inclusão.

## Oferta e matemática

| Item | Referência oficial | Total |
|---|---|---|
| Mentoria Premium | 12 meses | R$ 697,00 |
| Foco em Harmonia | Vitalício | R$ 89,90 |
| Harmomus Premium | R$ 39,90 × 12 | R$ 478,80 |
| Escola/GVIP Premium | R$ 19,90 × 12 | R$ 238,80 |
| Ebooks + materiais | Incluídos; seleção/prazo ainda a detalhar | R$ 200,00 |
| Total separado | Soma de cinco itens; bônus não monetizado | **R$ 1.704,50** |
| BLACK FOCO 2026 | Preço oficial informado pelo responsável | **R$ 997,00** |
| Economia | Total menos preço Black | **R$ 707,50 / aproximadamente 41,5%** |

Soma e economia em inteiros de centavos, formatadas somente para apresentação. Marcos da timeline: 697,00 → 786,90 → 1.265,70 → 1.504,50 → 1.704,50. Nenhum preço de bônus adicionado. `blackCashPrice` é a única definição do preço de 997; `payment.installments`, `installmentValue` e `paymentLabel` permanecem null e não geram parcelamento.

A cena usa o motor de pin existente e o mesmo referencial de 100svh. Percurso **1,35H**, container total **2,35H**: soma em 0–65%, leitura do total até 76%, convergência/escala em 76–94%, oferta final até liberação. As duas composições possuem opacidades complementares, nunca um intervalo sem ato visível. O scroll reverso deriva do mesmo progresso. CTA final só recebe foco/interação quando visível. Sem JS, movimento reduzido ou viewport baixa, soma e oferta ficam sequenciais no HTML. Sem números dependentes de JS para existir.

Hierarquia final: 997 → campanha/slogan → cinco acessos → valor separado/economia → CTA. Sem cronômetro, urgência falsa, parcelas, Pix ou checkout fictício. `checkoutUrl` continua null; o botão informa que as inscrições ainda não abriram. FAQs atualizadas com inclusões/prazos, sem inventar renovação ou garantia.

## Verificação e limitações

Build passou; typecheck estrito Black passou; 12 testes Black e 296 testes existentes passaram. Typecheck global continua nos mesmos 42 diagnósticos preexistentes por arquivo/código em comparação ao checkout base. `npm run lint` continua solicitando configuração ESLint inicial; não alterada. Nenhuma dependência adicionada. Verificações de assets/HTML e escopo registradas na entrega.

Sem control-browser disponível no ambiente managed Linux: não há QA visual/interativo certificado em desktop, 390/430px ou Safari, screenshots ou métricas LCP/CLS/INP/FPS medidas. CSS revisado para dimensões, safe areas, uma coluna, screenshot contain e fluxo vertical. Testes de matemática/motor não substituem teste real do swipe, player e foco no iPhone.

## Bloqueio do envio remoto / preview

O push anterior da própria branch acionou `Workers Builds: foco-whatsapp-scheduler`, sucesso com URL de ambiente **production**, além do preview Pages. O gatilho externo não está versionado em arquivos da Black e não há conector Cloudflare disponível para consultar/alterar seus filtros. Por isso nenhum novo push/update-ref ou deploy foi feito nesta etapa. Não usar `[skip ci]` como tentativa especulativa de proteção.

A mudança está pronta e testada na mesma branch local. Para atualizar PR #32 e gerar novo preview Pages sem repetir o acionamento de produção, é necessário excluir `feat/black-focus-2026` dos builds desse Worker (ou confirmar outra proteção equivalente) antes do push. Isso altera configuração externa fora da rota Black e precisa de autorização específica. PR permanece draft e sem merge; preview anterior não contém esta revisão.

## Arquivos desta revisão

- `app/black/BlackExperience.tsx`
- `app/black/BlackProof.tsx`
- `app/black/ProductExperience.tsx`
- `app/black/ProofStream.tsx`
- `app/black/ValueExperience.tsx`
- `app/black/black-config.ts`
- `app/black/product-experience.module.css`
- `app/black/proof-stream.module.css`
- `app/black/scroll-model.ts`
- `app/black/use-black-scroll.ts`
- `app/black/value-experience.module.css`
- `app/black/value-model.ts`
- `docs/black/README.md`
- `docs/black/proof-value-refinement.md`
- `docs/black/v2-audit.md`
- `public/images/black/proof-harmonia-02.webp`
- `public/images/black/proof-harmonia-03.webp`
- `public/images/black/proof-harmonia-04.webp`
- `public/images/black/proof-harmonia-05.webp`
- `public/images/black/proof-harmonia-06.webp`
- `public/images/black/proof-harmonia-07.webp`
- `tests/black/content.test.ts`
- `tests/black/value.test.ts`

Export verificado: referências locais src/href presentes; preços/subtotais, fallback e conteúdo SSR presentes; arquivos das rotas `/`, `/black/`, `/privacy/`, `/terms/`, `/trade/` continuam no export. Bundle Black: 16 kB; first load 104 kB. Não foram executados requests de produção para testar mutações.
