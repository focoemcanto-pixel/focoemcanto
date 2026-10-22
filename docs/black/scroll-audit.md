# Auditoria e correção do scroll — BLACK FOCO 2026

Escopo: PR #32, branch `feat/black-focus-2026`, somente `/black`. Sem alterações nos estilos globais, Escola, assets, produtos, preço, checkout ou backend.

## Causas identificadas no código

1. `app/globals.css` define `html` e `body` com `overflow-x:hidden`. Em CSS, o outro eixo `visible` computa para `auto` quando combinado com `hidden`. O `body` constitui um ancestral de scroll; o palco `position:sticky` depende desse ancestral, mas a timeline antiga seguia `window.scrollY`/retângulo da seção. Com o documento rolando e esse ancestral não rolando da mesma maneira, o conteúdo se deslocava enquanto a timeline avançava. O CSS local adicionava `overflow:clip` no `main` e herdava `overflow-x:clip` nas seções, outro ponto de fragilidade de composição/sticky no WebKit. Não foi instrumentado um iPhone real; esta é a cadeia causal identificada no código, compatível com o relato observado.
2. Introdução, Universo e Fusão reservavam respectivamente 310, 390 mobile/430 desktop e 220 `svh`, mas não havia uma garantia de que o palco permanecesse na viewport. Quando o sticky falhava, restava o percurso inteiro do container sem o conteúdo que deveria cobri-lo.
3. O progresso era `-rect.top / (rect.height - innerHeight)`. O palco usava `100svh` e mínimos de 650/700/720/680px, diferentes do denominador. O `innerHeight` varia com a barra do Safari. Isso desacoplava duração, área reservada e posição real da cena.
4. As capas se moviam por um índice inteiro e uma transição temporal de 700ms; textos mudavam por `floor(p*6)`. Não existia uma câmera contínua compartilhada. Mudar índice enquanto o palco subia afastava capa e descrição.
5. A abertura usava três fórmulas independentes de opacidade, com pontos onde a soma caía muito. A revelação não garantia um ato legível durante todo o percurso.
6. O modo sem JavaScript ainda reservava a altura gigantesca do Universo e só mostrava a descrição do primeiro item no espaço principal.

## Correção

O scroll do documento continua nativo e vertical. Sem `touchmove`/`wheel` interceptados, body lock ou dependências novas.

`use-black-scroll.ts` mede uma sonda CSS `100svh`. Para cada cena, reserva **altura do palco + percurso útil**, em px. O palco é absoluto antes da entrada, **fixed com top 0 somente durante a cena**, e absoluto no offset do fim depois da saída. Assim, o pin não depende dos ancestrais overflow do site. O `main` e os containers das cenas recebem `overflow:visible` somente no módulo CSS da Black; o recorte fica dentro dos palcos.

Uma verificação ao entrar na cena confirma `getBoundingClientRect().top≈0`. Se o pin não ocupar a posição esperada, a página retorna ao modo estático com o catálogo completo e mantém o fallback, sem um ciclo de novas tentativas em ResizeObserver. A posição dos blocos e os percursos são cacheados fora do hot path. O frame de scroll lê `scrollY` e escreve variáveis de `transform`/`opacity`; não mede o layout a cada frame. Cenas cujo progresso não mudou não recebem novas escritas; o núcleo da fusão usa escala em vez de animar width/height. Resize, fontes e mudança de tamanho do conteúdo atualizam o cache. A expansão/retração da barra do Safari não altera a distância baseada em svh. Safe areas entram no padding interno.

| Cena | Percurso animado | Altura total reservada | Justificativa |
|---|---:|---:|---|
| Abertura | 1,10 × altura estável | 2,10 × altura estável | Duas transições entre nome, primeira frase e segunda frase |
| Universo | 1,90 × altura estável | 2,90 × altura estável | Cinco transições de 0,38 × altura entre seis estados |
| Fusão | 0,65 × altura estável | 1,65 × altura estável | Uma convergência, com o slogan sempre visível |
| Oferta/valor | Sem percurso extra | Altura natural | Contador acompanha a entrada da oferta no campo de visão |

Exemplo de palco com 664px: Universo reserva 1.261,6px de scroll animado e 1.925,6px de container total. Ao terminar, a seção seguinte começa na borda inferior do palco, sem spacer adicional.

## Estado compartilhado

`progress=clamp((scrollY-início)/percurso)`; `cursor=progress*(6-1)`; item ativo é `round(cursor)`. Categoria, headline, descrição, contador `01 / 06` e navegação usam esse mesmo índice. Cada capa calcula sua distância fracionária ao cursor; escala, opacidade e inclinação variam continuamente. O produto ativo permanece no primeiro plano visível; não há transição temporal independente da câmera. Os botões de navegação calculam `início+percurso*índice/5`, sem alterar o estado antes de o scroll chegar.

O scroll reverso percorre a mesma função, sem timelines disparadas uma única vez nem estados irreversíveis. Abertura usa pesos triangulares que somam 1 para todos os progressos: sempre há pelo menos um ato com opacidade ≥0,5. Nenhuma troca deixa todos os atos invisíveis.

## Mobile e fallback

O Universo mobile usa um grid no palco: identificação/contador, headline, plano das capas, texto e navegação. O texto não é uma coluna de seis descrições fora da câmera. Capas continuam `object-fit:contain`, inalteradas. A navegação tem seis botões; gesto principal permanece vertical. Hastes/planos laterais são recortados no palco, não nos ancestrais de scroll.

Sem JS, com reduced motion, sem suporte à viewport estável ou em uma viewport menor que 620px de altura/320px de largura, há um catálogo sequencial com **todas as seis capas/representações, categorias, títulos e descrições**. Sem pin longo. Pin que falhar na verificação também retorna a esse catálogo. Pinch zoom recebe o fallback legível. A intro e a fusão têm altura natural nesse modo. As outras seções já usam fluxo normal; foram verificadas para não reservar novos percursos.

## Validação e limites

- Build completo e typecheck estrito dos arquivos Black.
- Testes do modelo: limites do pin, seis estados e navegação, ida/volta, continuidade espacial, visibilidade da abertura, estabilidade frente à barra dinâmica e overscroll.
- Suite Trade existente para regressão.
- Export estático com catálogo completo disponível sem JS e todos os assets locais; capas mantidas sem modificação.
- Lint geral continua sem configuração ESLint preexistente.
- `control-browser` não está disponível no ambiente managed Linux. Não foi feita reprodução em Safari real, QA visual automatizado, medição de overflow no navegador ou screenshots. Os testes matemáticos e do export **não substituem** o teste do novo preview em iPhone/Safari 390 e 430px. Não declarar essa validação visual como concluída.
