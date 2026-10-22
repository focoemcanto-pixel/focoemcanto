# Capas oficiais — BLACK FOCO 2026

Auditoria de leitura em 14/10/2026. Nenhuma escrita no banco, storage ou repositório da Escola.

## Origem e resolução da imagem

A Escola usa `focoemcanto-pixel/hubfocoemcanto`.
- `app/aluno/page.tsx` e `app/aluno/biblioteca/page.tsx`: `products` não arquivados, `productCover()` prioriza `cover_url`, depois `image_url`, `thumbnail_url`, `cover_image_url`, `banner_url`, `card_cover_url` e fallback visual.
- `products.cover_url` é o campo efetivo para os cinco produtos abaixo. O mesmo valor está em `courses.cover_url` para os cursos relacionados.
- Os arquivos são uploads PNG originais do Supabase Storage público, bucket `hub-assets`, caminhos `products/<id>/cover-<timestamp>.png`. Não são screenshots, URLs de thumbnail ou `/render/image`.
- `app/admin/produtos/[id]/salvar/route.ts`, função `uploadCover()`, grava o `file.arrayBuffer()` sem redimensionamento; depois armazena a URL pública. Rota inspecionada, nunca executada nesta tarefa.
- O catálogo da Escola inclui Foco em Canto e Foco em Harmonia mesmo com `status=draft`, porque a consulta exclui somente `archived`. Não foi alterado qualquer status.

## Mapeamento aplicado à Black

| Escola | ID na Black | Original | Arquivo local principal | Origem original |
|---|---|---|---|---|
| Foco em Canto | `canto` | 1024 × 1536 PNG | `/images/black/cover-foco-em-canto.webp` | [PNG original](https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/cf8540ec-66f1-49b1-9847-62fa396a3795/cover-1782338859618.png) |
| Foco em Harmonia | `harmonia` | 1092 × 1440 PNG | `/images/black/cover-foco-em-harmonia.webp` | [PNG original](https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/f385e033-316f-41f4-b168-a04782d3b412/cover-1782215350465.png) |
| Harmomus | `harmomus` | 1024 × 1536 PNG | `/images/black/cover-harmomus.webp` | [PNG original](https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/c8914bdb-269a-492b-b41a-37cc511e9616/cover-1783014478103.png) |
| Grupo VIP / Sala de Atividades VIP | `gvip` | 1672 × 941 PNG | `/images/black/cover-grupo-vip.webp` | [PNG original](https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/dfc8547c-f485-4c44-be9b-29ebc8ca32bc/cover-1782170465037.png) |
| Ebooks e Guias / Biblioteca digital | `biblioteca` | 1024 × 1536 PNG | `/images/black/cover-ebooks-e-guias.webp` | [PNG original](https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/e8ec11d9-8e62-4b00-a628-2523481d22de/cover-1782388708866.png) |

As cinco capas foram copiadas a partir dos originais e codificadas em WebP (qualidade 94, dimensões originais). Cópias responsivas de 320 e 640px (qualidade 92) derivam desses mesmos PNGs e são selecionadas com `srcSet`/`sizes`. Sem recorte, mudança de cor, marca, tipografia, fundo ou composição; a compressão WebP é com perdas de alta qualidade. A renderização usa `object-fit: contain`, sem filtros sobre a imagem. Perspectiva, sombra e transparência permanecem no container externo.

Nenhum asset é carregado diretamente do storage em runtime na Black. `image.sourceUrl` registra a procedência para auditoria, mas `src` e `srcSet` apontam para cópias locais. Isso evita dependência runtime da Escola e alterações futuras silenciosas na campanha. Os originais continuam intactos na Escola.

## Busca por originais maiores

A listagem de `storage.objects` foi consultada somente em leitura para os prefixos de produtos/módulos. Foco em Canto tem dois uploads com o mesmo ETag/tamanho; Grupo VIP tem três uploads com o mesmo ETag/tamanho. Os demais produtos têm um upload. Não foi encontrada versão maior ou diferente dos cinco originais atualmente referenciados. Nenhuma miniatura foi usada como matriz.

## Outros itens encontrados

- Foco em Melismas: produto e curso arquivados, `cover_url` nulo em ambos. Não foi incluído na Black.
- Bônus: não existe produto correspondente no catálogo com capa oficial. Mantido o placeholder neutro já existente, sem criar arte ou atribuir capa de outro curso.
- Módulos pedagógicos com capas oficiais: Firmar Afinação, Aprendendo a Segunda Voz, Desenvolver Intuição, Duetos para Treino. Todos os PNGs atuais têm 1672 × 941px. São módulos da Escola, não novos produtos confirmados da oferta; apenas inventariados, não acrescentados à Black.

| Módulo | Caminho no bucket hub-assets |
|---|---|
| Firmar Afinação | `modules/39a66eac-aec0-4644-bc00-b4a0416425a3/cover-1782004483278.png` |
| Aprendendo a Segunda Voz | `modules/5083351a-57af-4e49-ab47-f4e5436bad81/cover-1782004393844.png` |
| Desenvolver Intuição | `modules/eb6f91f2-72e8-49a7-bbe4-785beb1458de/cover-1782004552517.png` |
| Duetos para Treino | `modules/089c0768-d1d8-4104-971f-ef15a82853e9/cover-1782004597541.png` |

O módulo Aprendendo a Segunda Voz tem uploads históricos de artes diferentes, além do atual. Não foram substituídos por uma versão antiga apenas pelo maior tamanho em bytes. Grupo VIP e Desenvolver Intuição usam arquivos com o mesmo ETag; preservada a associação da capa do produto Grupo VIP efetivamente configurada na Escola.

## Integridade e tamanho das cópias

- **foco-em-canto**: original 2,066,344 bytes, SHA-256 `6d87fd8156f6efc91859eea9294bc5de9d791bc250067b2e9a0202c70f0bc90f`; WebP principal 305,678 bytes, SHA-256 `1a268befa7c8cfe97e29346f105b6ca7eef0696cfe6bd1ffe6933164f2236f2c`.
- **foco-em-harmonia**: original 1,475,161 bytes, SHA-256 `ac005e487c473504bc0a9718d80d11c03be4d6751ab1277e729301234a81e7e3`; WebP principal 128,626 bytes, SHA-256 `65cda334d8f0f675fb8ba4630efddda6e9ffc995ffbba703b80d259b5268dc03`.
- **harmomus**: original 1,499,339 bytes, SHA-256 `ed2fe2f3120c41ebd851b1cfdd93c2e4b55bd09120b28d0840f631f3003c5a3f`; WebP principal 208,932 bytes, SHA-256 `9e6eacfb0a5e9cf5286f1b0b44c629afb3edeab466514b3433f9cb2df551d8e1`.
- **grupo-vip**: original 1,899,379 bytes, SHA-256 `940fa219acbbfa2ff6dda3e6684fd38410d7fe08508b5331c8e7b706ded7194e`; WebP principal 226,202 bytes, SHA-256 `51e771a4b63e15f2144e149b68377eda1c46d0cfdcc69da5c4a03bfc0683e861`.
- **ebooks-e-guias**: original 1,860,089 bytes, SHA-256 `bf3e89f33ce60b03dc2fa7d484cdd5289f929c84e4e1e17911eb05abab4b4a59`; WebP principal 213,006 bytes, SHA-256 `13cf05d97b64fef4e522ee899e424d79e262ce04189dd1a62a719bd78fd1b3c0`.
