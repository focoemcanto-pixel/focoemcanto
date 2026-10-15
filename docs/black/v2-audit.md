# BLACK FOCO 2026 — auditoria V2

Registro da primeira V2. Inventário ampliado, uso de todas as provas e valores aprovados foram atualizados em [proof-value-refinement.md](proof-value-refinement.md).

Data: 14/10/2026. Escopo: leitura de fontes públicas, código dos repositórios relacionados e consultas SELECT nos projetos existentes. Nenhuma alteração em banco, storage, Escola, Harmomus ou Harmonics. Os prazos abaixo são condições expressamente definidas pelo responsável pela campanha; não inferidos das assinaturas avulsas.

## Matriz de produto / público / entregáveis / duração

| Produto | O que é / público | Entregáveis confirmados | Acesso Black | Fonte / status |
|---|---|---|---|---|
| Foco em Canto Premium | Mentoria vocal para iniciantes e cantores que buscam aperfeiçoamento | Diagnóstico; mentalidade/fisiologia; respiração, controle e afinação; extensão/registros; curso completo; exercícios; aulas semanais ao vivo; grupo exclusivo; sala virtual; prioridade em dúvidas e acompanhamento Premium | 12 meses | focoemcanto.com e `focoemcanto/app/page.tsx`, publicado |
| Foco em Harmonia | Treinamento prático de divisão vocal para ministros, backings e coralistas | Firmar afinação; construir segunda voz; desenvolver intuição/percepção e independência vocal; exercícios práticos | Vitalício | promo.focoemcanto.com, harmonia.focoemcanto.com, `harmonia-promo/app/page.tsx`, publicado |
| Harmomus Premium | Plataforma de kits vocais / estudo de repertório | Catálogo ilimitado; partes vocais; tons disponíveis; playlists; solicitações de kits/tons; comunidade/votações | 12 meses | harmomus.com; `harmomus-app/src/lib/data/official-plans.ts`; plano Premium ativo em `plans`, publicado |
| Escola Premium / GVIP | Ambiente de aulas, prática e comunidade | Sala VIP; aulas/duetos; envio de atividades; avaliação individual do professor; publicação/interação na comunidade; módulos Firmar Afinação, Aprendendo a Segunda Voz, Duetos para Treino, Desenvolver Intuição | 12 meses | escola.focoemcanto.com, código Hub e exercícios ativos com mídia, publicado |
| Biblioteca Digital | Ebooks/guias e materiais complementares | Categoria/capa confirmada. Nenhum inventário de arquivos finais confirmável nesta auditoria. Não anunciar quantidade nem nomes como inclusão | PENDENTE | Hub produto Ebooks e Guias; seleção Black pendente |
| Bônus | Reserva comercial | Nenhum bônus definido | PENDENTE | Definição do responsável pendente |

## Escola: ativo versus código disponível

- **Publicado/entregável:** login público apresenta aulas/duetos, comunidade, correção individual VIP e módulos acima. SELECT em `exercises` confirmou atividades ativas com mídia, inclusive duetos e aquecimento.
- **Implementado, disponibilidade operacional não comprovada:** Central de Treinamento (diários, personalizado, repertório), `app/aluno/central/*`, `lib/training-center.ts`, `lib/central-access.ts`. Regras podem vir de `hub-config/settings/central-access-rules.json`; tabela `central_access_rules` não apareceu no schema consultado. Não executar rotinas de gravação/configuração para testar. Não anunciar central inteira como benefício confirmado.
- **Não anunciado:** análise automática/IA de vídeo, catálogo de aplicativos, quantidades de avaliações, recursos experimentais, limites de pedidos e promessa de prioridade sem condições confirmadas.
- `reviews` da Escola são avaliações pedagógicas de atividades, não depoimentos comerciais consentidos. Não reutilizadas.
- `ebook_store_items` é referenciado no código, mas não apareceu no schema consultado; SELECT em `lesson_assets` por tipos PDF/document/download/ebook não encontrou registros. Alias “Vencendo a Rouquidão” no código é indicação de legado, não confirmação de arquivo incluído. Inventário e duração da biblioteca continuam pendentes.

## Provas e proveniência

| Produto | Inventário encontrado | Utilização | Força / ressalva |
|---|---|---|---|
| Mentoria Foco em Canto | 8 WebPs em `public/images/depoimentos/`; 4 vídeos na página principal: rDzhJn2SYbI, kenwsDb_0XM, 8LbwCcpvEdw, vbLXwcRl4NQ | Original 01 (Léia Rosali, inspecionado visualmente) reutilizado diretamente; primeiro vídeo da grade existente | Print B: específico sobre material/didática/proximidade. Vídeo A por formato; transformação detalhada não transcrita/verificada |
| Foco em Harmonia | 7 prints e vídeo T0rDCxXoCR0 em `harmonia-promo/app/components/TestimonialCarousel.tsx` | Print 1 original inspecionado: just_thalii, relato sobre manter a própria voz; vídeo existente | Print B; vídeo A por formato, sem inventar nome/transcrição |
| Harmomus | Falas estáticas na home; mecanismo `premium_requests.testimonial_public` | SELECT de feedbacks públicos retornou zero. Falas estáticas não verificadas excluídas | PROVA SOCIAL AINDA NECESSÁRIA |
| Harmonics | Fluxo de coleta/admin `components/avaliacoes/AvaliacoesPageClient.js`, tabela `client_reviews` | SELECT agregado por status retornou zero; nenhuma fala reutilizada | PROVA DE AUTORIDADE AINDA NECESSÁRIA. Harmonics não incluído na oferta |
| Escola / GVIP | Avaliações docentes, não depoimentos comerciais | Nenhuma reutilizada | PROVA SOCIAL AINDA NECESSÁRIA |
| Biblioteca / bônus | Nenhuma prova específica confirmada | Estrutura configurável disponível, não renderizar bloco vazio | PROVA SOCIAL AINDA NECESSÁRIA |

Arquivo copiado **sem modificação da arte**: `public/images/black/proof-harmonia-01.webp` (1080×1920, 86.854 bytes), origem `https://promo.focoemcanto.com/images/depoimentos/%20depoimento-1.webp`. A Escola e a página de origem permanecem intactas. Capas oficiais e suas variantes existentes preservadas. Nenhum depoimento, identidade, resultado ou número foi criado artificialmente. Ausência de registro nesta consulta não prova ausência de outras fontes futuras.

## Funil e interação

Abertura → manifesto → universo pinned e CTA “Conhecer por dentro” → experiência do produto com prazo, público, entregáveis modulares e provas específicas → retorno ao mesmo estado → retrato do professor → fusão → vozes reais do ecossistema → inclusões/prazos → value stack sem números → oferta pendente → acesso/FAQ → CTA final.

Product Experience é um ambiente de tela inteira com capa original e luz derivada do produto, abertura em escala suave, módulos editoriais e prova contextual. Native dialog fornece top layer, fundo inerte, ESC e foco contido; trap adicional, botão fechar e retorno de foco. Rolagem interna natural com overscroll contido. Guarda posição do documento e pausa cálculos/rebuild do motor durante abertura; restaura posição e geometria ao fechar, sem reiniciar componente ou timeline. Movimento reduzido elimina zoom/transição. Fallback SSR sequencial contém produtos, descrições e entregáveis em details.

Provas usam fluxo editorial vertical escalonado no desktop, leitura vertical ampla no mobile; sem autoplay, sem promessas de resultado. Iframes são criados somente após clique e exigem reprodução explícita. Prints com lazy loading; abertura do original em nova aba. Não há grid de avaliações fictícias nem seção vazia para produtos sem prova.

## Configuração e pendências comerciais

`app/black/black-config.ts`: `productDetails`, `products`, `blackProofs`, FAQs, checkout, preços, duração, fonte e listas de provas. Fontes internas não aparecem ao consumidor. Cada prova deve apontar para o produto correto. Checkout permanece null e valida HTTPS antes de habilitar link. Não conectar checkout/Kiwify/backend nesta etapa.

Pendentes: preços/totais/parcelas/desconto; data; garantia Black (não importar garantias avulsas de 7/15 dias); renovação após 12 meses; alunos atuais; provisionamento de acesso; seleção/duração da biblioteca; bônus; provas de Harmomus/Escola/Harmonics; validação operacional dos aplicativos. Não há limitação de pedidos numérica anunciada.

## QA

Ver relatório de execução no PR. Build estático, typecheck isolado da Black, testes de conteúdo e motor, suíte Trade e comparação do typecheck global. Sem biblioteca adicional. Product Experience tem chunk separado e só é montada após escolha; nenhuma mídia de vídeo carregada inicialmente. Apenas rota Black, testes e documentação Black alterados.

Limitação: ambiente sem navegador de controle disponível; não foi possível certificar visualmente Safari físico, 390/430px, focus trap no Safari, reprodução externa nem FPS. A revisão de CSS cobre safe areas, 100dvh do diálogo, layout de uma coluna e imagens contain. O preview precisa da validação no iPhone; não afirmar QA visual executado.

Execução concluída: build passou (`/black`: 13,7 kB, first load 101 kB); typecheck estrito isolado da rota passou; 9 testes Black e 296 testes Trade passaram. Typecheck global continua com 42 erros preexistentes: mesma lista de arquivos/códigos de diagnóstico em checkout limpo do commit anterior, nenhum na Black. Lint continua sem configuração ESLint no projeto. Smoke HTTP do export: `/`, `/black/`, `/privacy/`, `/terms/`, `/trade/` responderam 200. Todos os caminhos locais src/href do HTML Black existem no export. Nenhuma ocorrência do nome antigo na implementação/documentação Black. Verificações estáticas não substituem revisão visual/interativa em Safari.
