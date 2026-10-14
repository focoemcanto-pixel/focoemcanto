# BLACK FOCO 2026

Marca-mãe: **Foco em Canto**. Slogan oficial: **Tudo o que construímos. Em uma única oportunidade.**
A abertura revela o nome/ano e depois as duas frases pelo scroll, com peso tipográfico em “construímos”. A fusão retoma o slogan. Sem JavaScript ou com movimento reduzido, as frases permanecem no fluxo de leitura.

Rota estática isolada: `/black/`. Não modifica layout global, integrações, Functions, autenticação ou dados.

## Editar a campanha

`app/black/black-config.ts` centraliza produtos, descrições, FAQs, CTA, ano, preços e URL de checkout. Os preços são `null` até aprovação comercial. O total regular é derivado dos produtos e só aparece quando todos os valores são definidos. `checkoutUrl` aceita somente uma URL HTTPS; sem ela, o CTA explica que a oferta ainda não abriu. Nenhuma integração foi simulada. `deadline` está reservado e não produz contagem regressiva nem urgência fictícia.

Antes de abrir vendas: confirmar inclusões e duração de cada acesso; revisar a copy editorial provisória; definir os preços reais; informar checkout oficial; revisar FAQs e condições legais. Configurar produtos, liberação dos acessos e automações na Kiwify e nos sistemas correspondentes, fora desta página.

## Implementação

Next App Router + React; CSS Modules; animações CSS e um listener passivo de scroll com requestAnimationFrame. Sem dependências adicionais, WebGL, fontes remotas ou mudança no scroll nativo. Introdução e universo usam sticky local; fusão usa posições e transformações convergentes. Imagens WebP locais, dimensões explícitas e lazy loading abaixo da dobra. A seção clara muda o ritmo antes da conversão. Reduced motion apresenta os produtos em grade estática e remove deslocamentos/animações. Conteúdo renderizado no HTML continua acessível sem JavaScript.

Fotos e logo fornecidos pelo proprietário. As cinco capas de produtos são as oficiais da Escola, mapeadas na configuração e documentadas em [assets.md](assets.md). Somente Bônus permanece sem capa oficial localizada. Todas as sete imagens foram examinadas; as fotos de palco e a foto PB foram selecionadas para a composição principal. Os demais WebPs ficam disponíveis para revisão editorial sem download inicial.

## Limites de verificação

O ambiente não disponibiliza a skill control-browser exigida para QA visual pelo fluxo Sites em managed Linux. Não foram gerados screenshots nem foi afirmada validação visual em 390/430px. A folha inclui layouts específicos para essas larguras; validar no preview do PR antes de merge. Não publicar automaticamente em main.
