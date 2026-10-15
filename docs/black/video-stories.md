# Seção 04 — Histórias reais

Revisão de 14/10/2026 (Bahia). Escopo: prova principal da `/black/`, preservando PR #32 draft, demais seções/rotas, preços, checkout e motor pinned.

## Função e conteúdo

Substitui a seleção principal de dois screenshots por **todos os cinco vídeos já verificados**. Headline: “Algumas coisas precisam ser ouvidas.” Microcopy: “Relatos individuais de alunos dos produtos indicados.” Não são depoimentos sobre a oferta Black e não há frases/transcrições fabricadas.

| Registro central | Produto | Vídeo original / título verificado |
|---|---|---|
| canto-video | Foco em Canto / Mentoria Premium | rDzhJn2SYbI / DEPOIMENTO FOCO EM CANTO - JOILMA |
| canto-video-2 | Foco em Canto / Mentoria Premium | kenwsDb_0XM / Depoimento — Juliana Torquato (Foco em Canto) |
| canto-video-3 | Foco em Canto / Mentoria Premium | 8LbwCcpvEdw / Evolução Talita — Foco em Canto |
| canto-video-4 | Foco em Canto / Mentoria Premium | vbLXwcRl4NQ / DEPOIMENTOS FOCO EM CANTO |
| harmonia-video | Foco em Harmonia / Curso de divisão vocal | T0rDCxXoCR0 / Depoimento Juliana — Foco em Harmonia |

Proveniência publicada permanece em `blackProofs.source`: https://focoemcanto.com/ e https://promo.focoemcanto.com/. `globalVideoProofIds` seleciona esses registros sem duplicar conteúdo. O vídeo compilado é um registro de mídia, não uma alegação de pessoa única. Nenhum depoimento novo foi inventado.

## Interação e apresentação

`VideoStories.tsx` é exclusivo da cena principal. Trilho horizontal nativo com scroll-snap central, previews laterais, profundidade discreta por transform/opacity e contador editorial 01/05–05/05. Setas de 48px, teclado (esquerda/direita/Home/End no trilho) e swipe nativo. Não há autoplay, wheel/touch handlers, preventDefault de gestos ou pin. Scroll vertical permanece do documento. Posições medidas em resize e offsets reutilizados em scroll com rAF. Sem alteração da altura reservada das outras cenas.

Mobile: trilho com padding lateral de 14% e card ocupando 72% da viewport, equivalente a **81,8% da largura útil** (seção com margens editoriais de 6%). Em 390px: card 280,8px; em 430px: 309,6px. Próximo vídeo aparece parcialmente. Imagens 4:3 com contain, sem deformação/corte; caption identifica produto e tipo reais. Sem altura em vh, mínimo artificial ou spacer. Rodapé se dissolve em linhas graduais e dá lugar à seção 05 existente, sem aumentar seu espaçamento.

## Mídia, desempenho e acessibilidade

Posters originais do YouTube em `hqdefault.jpg`, 480×360, centralizados na configuração, com dimensões explícitas, lazy loading e async decode. O download para otimização local foi tentado, mas o host i.ytimg.com retorna página de indisponibilidade neste ambiente; não foi criado arquivo inválido nem imagem substituta. Mantida entrega original pelo CDN já usado pelo projeto. O carregamento efetivo dos posters e a reprodução externa precisam de teste no dispositivo/rede final.

Nenhum iframe no HTML inicial. Somente o vídeo escolhido recebe iframe youtube-nocookie após clique; sem autoplay nem permissão autoplay. Pode exigir o play explícito do YouTube depois de abrir o player. Trocar de estado desmonta o iframe imediatamente; sair da seção também. Botão fechar vídeo devolve foco ao poster sem mover a página. Contador com live region, slides inativos inert/aria-hidden, foco visível herdado da Black, iframe com título do vídeo real. Reduced motion elimina profundidade/transições e usa navegação sem smooth scroll. Noscript fornece links aos cinco vídeos originais.

Product Experiences preservadas: Canto = 8 screenshots + 4 vídeos; Harmonia = 7 screenshots + 1 vídeo. Nenhuma prova excluída. `ProofSignal` apenas passa a consumir o poster central configurado (mesma URL anteriormente usada).

## Validação

- Build estático passou; typecheck estrito isolado da Black passou; 13 testes Black passaram.
- Verificação do HTML exportado: cinco posters/vídeos corretos, zero iframes iniciais, ausência dos screenshots e disclaimer longo na seção 04, seção 05 imediatamente seguinte.
- CSS revisado para 390/430, trilho contido horizontalmente e proporção explícita. Isto é análise estática, não certificação visual de overflow.
- Ambiente sem skill control-browser; Sites orienta não improvisar navegador neste ambiente. **QA visual/interativo 390/430, swipe real, teclado, Safari iOS e reprodução continuam pendentes no novo preview.** Não afirmar testes visuais que não ocorreram.
- Sem dependências novas; nenhuma alteração de Worker, backend, Escola, Harmomus, outras rotas ou publicação de produção.
