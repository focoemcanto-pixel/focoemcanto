export type BlackCover = { src: string; width: number; height: number; alt: string; sourceUrl: string; srcSet: string };
export type BlackProduct = { id: string; name: string; theme: string; title: string; description: string; detail: string; regularPrice: number | null; image?: BlackCover | null };
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
    { id: 'canto', name: 'FOCO EM CANTO', theme: 'VOZ', title: 'Sua voz.\nSeu próximo nível.', description: 'Um novo olhar para o seu desenvolvimento vocal.', detail: 'Canto, técnica e expressão em um mesmo caminho de aprendizado.', regularPrice: null, image: {"src": "/images/black/cover-foco-em-canto.webp", "width": 1024, "height": 1536, "alt": "Capa oficial — Foco em Canto", "sourceUrl": "https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/cf8540ec-66f1-49b1-9847-62fa396a3795/cover-1782338859618.png", "srcSet": "/images/black/cover-foco-em-canto-320.webp 320w, /images/black/cover-foco-em-canto-640.webp 640w, /images/black/cover-foco-em-canto.webp 1024w"} },
    { id: 'harmonia', name: 'FOCO EM HARMONIA', theme: 'CONEXÃO', title: 'Ouça além.\nCante junto.', description: 'Descubra as possibilidades de cantar em harmonia.', detail: 'Um universo de vozes que se encontram e se complementam.', regularPrice: null, image: {"src": "/images/black/cover-foco-em-harmonia.webp", "width": 1092, "height": 1440, "alt": "Capa oficial — Foco em Harmonia", "sourceUrl": "https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/f385e033-316f-41f4-b168-a04782d3b412/cover-1782215350465.png", "srcSet": "/images/black/cover-foco-em-harmonia-320.webp 320w, /images/black/cover-foco-em-harmonia-640.webp 640w, /images/black/cover-foco-em-harmonia.webp 1092w"} },
    { id: 'harmomus', name: 'HARMOMUS', theme: 'PRÁTICA', title: 'Da descoberta\nà prática.', description: 'A música como parte da sua rotina.', detail: 'Uma das experiências previstas para integrar o Black Foco.', regularPrice: null, image: {"src": "/images/black/cover-harmomus.webp", "width": 1024, "height": 1536, "alt": "Capa oficial — Harmomus", "sourceUrl": "https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/c8914bdb-269a-492b-b41a-37cc511e9616/cover-1783014478103.png", "srcSet": "/images/black/cover-harmomus-320.webp 320w, /images/black/cover-harmomus-640.webp 640w, /images/black/cover-harmomus.webp 1024w"} },
    { id: 'gvip', name: 'GVIP / ESCOLA', theme: 'CONTINUIDADE', title: 'Continue\nem movimento.', description: 'Mais espaço para o seu aprendizado continuar.', detail: 'A escola Foco em Canto também faz parte deste encontro.', regularPrice: null, image: {"src": "/images/black/cover-grupo-vip.webp", "width": 1672, "height": 941, "alt": "Capa oficial — Grupo VIP", "sourceUrl": "https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/dfc8547c-f485-4c44-be9b-29ebc8ca32bc/cover-1782170465037.png", "srcSet": "/images/black/cover-grupo-vip-320.webp 320w, /images/black/cover-grupo-vip-640.webp 640w, /images/black/cover-grupo-vip.webp 1672w"} },
    { id: 'biblioteca', name: 'BIBLIOTECA DIGITAL', theme: 'REPERTÓRIO', title: 'Conhecimento\nsempre por perto.', description: 'PDFs e materiais para acompanhar sua jornada.', detail: 'A seleção definitiva de materiais será anunciada com a oferta.', regularPrice: null, image: {"src": "/images/black/cover-ebooks-e-guias.webp", "width": 1024, "height": 1536, "alt": "Capa oficial — Ebooks e Guias", "sourceUrl": "https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/e8ec11d9-8e62-4b00-a628-2523481d22de/cover-1782388708866.png", "srcSet": "/images/black/cover-ebooks-e-guias-320.webp 320w, /images/black/cover-ebooks-e-guias-640.webp 640w, /images/black/cover-ebooks-e-guias.webp 1024w"} },
    { id: 'bonus', name: 'BÔNUS', theme: 'POSSIBILIDADES', title: 'E ainda há\nmais por vir.', description: 'Novas possibilidades para ir além.', detail: 'Os bônus serão revelados na apresentação oficial da campanha.', regularPrice: null, image: null },
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
