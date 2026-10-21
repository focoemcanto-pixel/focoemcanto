# BLACK FOCO 2026 — PRE-LAUNCH / OPEN

Uma única experiência em `/black/` com dois estados. O estado vigente é administrado no HUB em
`/comunicacao/black` e lido pela landing em tempo de execução
(`GET https://escola.focoemcanto.com/api/public/campanhas/black_foco_2026/estado`, cache 30 s).

- **PRE-LAUNCH** (padrão do build e fallback se o HUB não responder): sem preço, parcelamento ou checkout.
  Header “LISTA PRIORITÁRIA”, seção “06 / A ABERTURA” (08/11), passos da lista, FAQ sem pagamento,
  CTA contextual fixo (aparece após a abertura da página, sai quando um CTA inline ou o rodapé está visível,
  respeita safe-area) e a ficha.
- **OPEN**: a experiência comercial auditada em `checkout-release.md`, sem alteração (3 CTAs para o checkout
  oficial, revelação de valor, FAQ de pagamento).
- **Encerrada** (`ended` no HUB): layout PRE-LAUNCH com inscrições encerradas; nunca abre checkout.

Nada vira sozinho em 08/11: a troca é feita no HUB e exige confirmação explícita.

## Captação e ficha

`PriorityList.tsx`: nome, e-mail, WhatsApp e o consentimento restrito à campanha (texto e versão vêm do
HUB) → 5 perguntas, uma por tela, com progresso “N de 5”, voltar e persistência local
(`localStorage` `black26:lista`; rascunho dos dados em `sessionStorage` até concluir) → confirmação com o
botão do grupo oficial. O link do grupo é administrado no HUB e sempre passa pelo redirecionamento rastreado
`/api/public/campanhas/grupo/<entrada>`; não há URL de grupo no front.

Perguntas e opções vêm do HUB (fonte única, validadas no banco). UTMs de primeiro toque são enviadas na
inscrição. `#entrar` ou `#lista-prioritaria` abrem a ficha direto (links de Instagram/stories).

QA local: `NEXT_PUBLIC_BLACK_HUB_ORIGIN=http://localhost:3100 npx next dev`; em produção o build usa
`blackConfig.launch.hubOrigin`.
