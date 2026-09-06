# Closet — fluxo de entrada de peças

## Princípios

- Adicionar peças ao Closet continua gratuito.
- O scanner inteligente é opcional e custa 1 crédito por foto analisada.
- Uma única foto pode conter várias peças; todas podem ser detectadas no mesmo uso do scanner.
- Salvar os recortes identificados pelo scanner é gratuito.
- Melhorar/reconstruir a imagem de catálogo é opcional e custa +1 crédito por peça.
- Selecionar imagens na galeria nunca pode disparar IA automaticamente.
- A galeria deve aceitar múltiplas imagens para o fluxo gratuito.

## Fluxo esperado

1. Usuário toca em "Adicionar peça".
2. Vai para `/closet/add`.
3. Escolhe entre:
   - Cadastro gratuito por foto.
   - Scanner inteligente.
4. No cadastro gratuito:
   - Pode usar câmera ou galeria.
   - Galeria aceita múltiplas fotos.
   - Fotos entram em fila de cadastro manual.
   - Nenhum crédito é consumido.
5. No scanner inteligente:
   - Usuário escolhe uma foto.
   - O custo de 1 crédito é informado antes da análise.
   - Só após ação explícita do usuário a foto é enviada ao scanner.
   - O scanner pode retornar várias peças da mesma foto.
6. Nos resultados:
   - "Salvar todas com os recortes" é gratuito.
   - "Melhorar e salvar" custa +1 crédito por peça.

## Regra de UX

A decisão de gastar créditos deve acontecer sempre em uma ação explícita. Upload, seleção de foto, câmera ou abertura da galeria nunca consomem crédito por si só.
