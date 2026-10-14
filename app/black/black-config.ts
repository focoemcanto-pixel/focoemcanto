export type BlackProduct = { id: string; name: string; theme: string; title: string; description: string; detail: string; regularPrice: number | null; image?: string };
// Conteúdo editorial provisório. Confirmar inclusões, duração e condições antes da campanha.
export const blackConfig = {
  year: 2026,
  brand: 'Foco em Canto',
  campaignName: 'BLACK FOCO',
  slogan: ['Tudo o que construímos.', 'Em uma única oportunidade.'],
  checkoutUrl: null as string | null,
  blackPrice: null as number | null,
  deadline: null as string | null,
  cta: 'DESBLOQUEAR O BLACK FOCO',
  pendingCta: 'EXPLORAR O QUE VEM AÍ',
  pendingMessage: 'A experiência está chegando. A oferta, os valores e a abertura das inscrições serão anunciados aqui.',
  manifesto: ['Você não precisa de mais um curso.', 'Precisa de um ecossistema.'],
  products: [
    { id: 'canto', name: 'FOCO EM CANTO', theme: 'VOZ', title: 'Sua voz.\nSeu próximo nível.', description: 'Um novo olhar para o seu desenvolvimento vocal.', detail: 'Canto, técnica e expressão em um mesmo caminho de aprendizado.', regularPrice: null, image: '/images/black/marcos-stage.webp' },
    { id: 'harmonia', name: 'FOCO EM HARMONIA', theme: 'CONEXÃO', title: 'Ouça além.\nCante junto.', description: 'Descubra as possibilidades de cantar em harmonia.', detail: 'Um universo de vozes que se encontram e se complementam.', regularPrice: null },
    { id: 'harmomus', name: 'HARMOMUS', theme: 'PRÁTICA', title: 'Da descoberta\nà prática.', description: 'A música como parte da sua rotina.', detail: 'Uma das experiências previstas para integrar o Black Foco.', regularPrice: null },
    { id: 'gvip', name: 'GVIP / ESCOLA', theme: 'CONTINUIDADE', title: 'Continue\nem movimento.', description: 'Mais espaço para o seu aprendizado continuar.', detail: 'A escola Foco em Canto também faz parte deste encontro.', regularPrice: null },
    { id: 'biblioteca', name: 'BIBLIOTECA DIGITAL', theme: 'REPERTÓRIO', title: 'Conhecimento\nsempre por perto.', description: 'PDFs e materiais para acompanhar sua jornada.', detail: 'A seleção definitiva de materiais será anunciada com a oferta.', regularPrice: null },
    { id: 'bonus', name: 'BÔNUS', theme: 'POSSIBILIDADES', title: 'E ainda há\nmais por vir.', description: 'Novas possibilidades para ir além.', detail: 'Os bônus serão revelados na apresentação oficial da campanha.', regularPrice: null },
  ] satisfies BlackProduct[],
  faqs: [
    { question: 'O que é o Black Foco?', answer: 'É a campanha que está sendo preparada para reunir produtos do ecossistema Foco em Canto em uma única oferta. A composição final será divulgada antes da abertura das vendas.' },
    { question: 'Quando as inscrições serão abertas?', answer: 'A data de abertura e o período da campanha ainda serão anunciados. Esta página apresenta a experiência e os produtos previstos.' },
    { question: 'Como vou comprar e receber os acessos?', answer: 'Quando a oferta estiver disponível, o botão desta página levará ao checkout oficial da Kiwify. Os detalhes de liberação em cada plataforma serão informados antes da compra.' },
    { question: 'Todos os acessos serão vitalícios?', answer: 'Os prazos de acesso de cada produto ainda serão definidos. A oferta final apresentará a duração e as condições de cada item de forma clara.' },
    { question: 'Já tenho um dos produtos. Posso participar?', answer: 'As condições para alunos atuais serão divulgadas junto com a oferta definitiva.' },
  ],
};
export const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
export const checkoutHref = () => {
  try { const u = new URL(blackConfig.checkoutUrl || ''); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
};
