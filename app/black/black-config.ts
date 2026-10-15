const blackCashPrice = 997;
export type ProductDetails = { id: string; type: string; accessLabel: string; duration: string | null; accent: string; description: string; overview: string; audience: string; deliverables: string[][]; highlights: string[]; proofIds: string[]; source: string };
const productDetails: ProductDetails[] = [
  {
    "type": "MENTORIA PREMIUM",
    "accessLabel": "12 MESES PREMIUM",
    "duration": "12 meses",
    "accent": "#77d7e4",
    "description": "12 meses de Mentoria Premium: método, aulas ao vivo e acompanhamento para desenvolver sua voz.",
    "overview": "Um caminho de desenvolvimento vocal que começa com diagnóstico e conecta técnica, treino e acompanhamento.",
    "audience": "Para quem está começando, já canta ou quer aperfeiçoar a voz no palco e no louvor.",
    "deliverables": [
      [
        "DIAGNÓSTICO",
        "Entenda seu ponto de partida"
      ],
      [
        "MÉTODO",
        "Mentalidade e fisiologia da voz"
      ],
      [
        "TÉCNICA",
        "Respiração, controle e afinação"
      ],
      [
        "PRÁTICA",
        "Extensão e registros vocais"
      ],
      [
        "AO VIVO",
        "Aulas semanais e exercícios práticos"
      ],
      [
        "PREMIUM",
        "Grupo exclusivo, sala virtual e prioridade nas dúvidas"
      ]
    ],
    "highlights": [
      "Curso completo na plataforma",
      "Acompanhamento Premium"
    ],
    "proofIds": ["canto-leia", "canto-print-02", "canto-print-03", "canto-print-04", "canto-print-05", "canto-print-06", "canto-print-07", "canto-print-08", "canto-video", "canto-video-2", "canto-video-3", "canto-video-4"],
    "source": "https://focoemcanto.com/",
    "id": "canto"
  },
  {
    "type": "CURSO DE DIVISÃO VOCAL",
    "accessLabel": "ACESSO VITALÍCIO",
    "duration": "Vitalício",
    "accent": "#e57874",
    "description": "Afinação, segunda voz e independência vocal em um treinamento prático com acesso vitalício.",
    "overview": "Um treinamento para ouvir, entender e aplicar a divisão vocal sem depender de teoria musical pesada.",
    "audience": "Para ministros de louvor, backings e coralistas que querem sustentar sua linha vocal ao ouvir outras vozes.",
    "deliverables": [
      [
        "01 / BASE",
        "Firmar a afinação"
      ],
      [
        "02 / CONSTRUÇÃO",
        "Aprender a segunda voz"
      ],
      [
        "03 / PERCEPÇÃO",
        "Desenvolver a intuição vocal"
      ],
      [
        "APLICAÇÃO",
        "Exercícios para situações reais de canto"
      ]
    ],
    "highlights": [
      "Treinamento progressivo",
      "Prática de independência vocal"
    ],
    "proofIds": ["harmonia-print", "harmonia-print-02", "harmonia-print-03", "harmonia-print-04", "harmonia-print-05", "harmonia-print-06", "harmonia-print-07", "harmonia-video"],
    "source": "https://promo.focoemcanto.com/",
    "id": "harmonia"
  },
  {
    "type": "PLATAFORMA DE KITS VOCAIS",
    "accessLabel": "12 MESES PREMIUM",
    "duration": "12 meses",
    "accent": "#b7a2ed",
    "description": "Kits vocais, tons disponíveis e playlists para estudar sua voz. 12 meses de Harmomus Premium.",
    "overview": "Uma plataforma para preparar repertório e estudar as vozes dos kits vocais, com recursos Premium para organizar sua prática.",
    "audience": "Para cantores, backings e integrantes de ministérios que estudam repertório e divisão vocal.",
    "deliverables": [
      [
        "CATÁLOGO",
        "Acesso ilimitado aos kits"
      ],
      [
        "VOZES",
        "Estudo das partes vocais disponíveis"
      ],
      [
        "TONS",
        "Troca entre tonalidades disponíveis"
      ],
      [
        "ROTINA",
        "Criação de playlists"
      ],
      [
        "PEDIDOS",
        "Solicitações de kits e novos tons"
      ],
      [
        "PARTICIPAÇÃO",
        "Comunidade e votações internas"
      ]
    ],
    "highlights": [
      "Catálogo completo no Premium",
      "Pedidos sujeitos às regras da plataforma"
    ],
    "proofIds": [],
    "source": "https://harmomus.com/",
    "id": "harmomus"
  },
  {
    "type": "ESCOLA / ACESSO PREMIUM",
    "accessLabel": "12 MESES PREMIUM",
    "duration": "12 meses",
    "accent": "#81c9ac",
    "description": "12 meses de Escola Premium: aulas, duetos, comunidade e atividades com avaliação do professor.",
    "overview": "O ambiente de estudo e prática do Foco em Canto reúne biblioteca, atividades e comunidade vocal.",
    "audience": "Para quem quer transformar o conteúdo em prática e compartilhar sua evolução com orientação.",
    "deliverables": [
      [
        "AULAS",
        "Sala de atividades VIP"
      ],
      [
        "PRÁTICA",
        "Aulas e duetos com vídeos reais"
      ],
      [
        "ENVIO",
        "Atividades para correção individual"
      ],
      [
        "DIREÇÃO",
        "Avaliação do professor"
      ],
      [
        "COMUNIDADE",
        "Publicação de vídeos e interação entre alunos"
      ]
    ],
    "highlights": [
      "Firmar Afinação",
      "Aprendendo a Segunda Voz",
      "Duetos para Treino",
      "Desenvolver Intuição"
    ],
    "proofIds": [],
    "source": "https://escola.focoemcanto.com/",
    "id": "gvip"
  },
  {
    "type": "MATERIAIS DIGITAIS",
    "accessLabel": "EBOOKS + MATERIAIS INCLUÍDOS",
    "duration": null,
    "accent": "#d4bb82",
    "description": "Ebooks e guias do ecossistema. A seleção incluída e o prazo de acesso serão anunciados.",
    "overview": "A biblioteca reúne materiais digitais para complementar o estudo. A composição específica da Black ainda está em definição.",
    "audience": "Para quem gosta de consultar materiais de apoio ao longo do aprendizado.",
    "deliverables": [],
    "highlights": [
      "Seleção final em definição",
      "Prazo de acesso a confirmar"
    ],
    "proofIds": [],
    "source": "https://escola.focoemcanto.com/",
    "id": "biblioteca"
  },
  {
    "type": "REVELAÇÃO FUTURA",
    "accessLabel": "EM DEFINIÇÃO",
    "duration": null,
    "accent": "#ddad67",
    "description": "A seleção de bônus ainda será definida e anunciada com as condições da campanha.",
    "overview": "Este espaço está reservado para os bônus que forem confirmados para a BLACK FOCO 2026.",
    "audience": "",
    "deliverables": [],
    "highlights": [
      "Nenhum bônus anunciado neste momento"
    ],
    "proofIds": [],
    "source": "Definição comercial pendente",
    "id": "bonus"
  }
];
export type BlackCover = { src: string; width: number; height: number; alt: string; sourceUrl: string; srcSet: string };
export type BlackProductBase = { id: string; name: string; theme: string; title: string; description: string; detail: string; regularPrice: number | null; image?: BlackCover | null };
// Conteúdo editorial provisório. Confirmar inclusões, duração e condições antes da campanha.
export const blackConfig = {
  year: 2026,
  brand: 'Foco em Canto',
  campaignName: 'BLACK FOCO',
  slogan: ['Tudo o que construímos.', 'Em uma única oportunidade.'],
  checkoutUrl: null as string | null,
  blackPrice: blackCashPrice as number | null,
  payment: { cashPrice: blackCashPrice, installments: null as number | null, installmentValue: null as number | null, paymentLabel: null as string | null },
  deadline: null as string | null,
  cta: 'QUERO ENTRAR NA BLACK FOCO',
  pendingCta: 'EXPLORAR A BLACK FOCO',
  pendingMessage: 'A BLACK FOCO custa R$ 997. O checkout ainda não está disponível; a abertura das inscrições será anunciada aqui.',
  manifesto: ['Você não precisa de mais um curso.', 'Precisa de um ecossistema.'],
  products: ([
    { id: 'canto', name: 'FOCO EM CANTO', theme: 'VOZ', title: 'Sua voz.\nSeu próximo nível.', description: 'Um novo olhar para o seu desenvolvimento vocal.', detail: 'Canto, técnica e expressão em um mesmo caminho de aprendizado.', regularPrice: 697, image: {"src": "/images/black/cover-foco-em-canto.webp", "width": 1024, "height": 1536, "alt": "Capa oficial — Foco em Canto", "sourceUrl": "https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/cf8540ec-66f1-49b1-9847-62fa396a3795/cover-1782338859618.png", "srcSet": "/images/black/cover-foco-em-canto-320.webp 320w, /images/black/cover-foco-em-canto-640.webp 640w, /images/black/cover-foco-em-canto.webp 1024w"} },
    { id: 'harmonia', name: 'FOCO EM HARMONIA', theme: 'CONEXÃO', title: 'Ouça além.\nCante junto.', description: 'Descubra as possibilidades de cantar em harmonia.', detail: 'Um universo de vozes que se encontram e se complementam.', regularPrice: 89.9, image: {"src": "/images/black/cover-foco-em-harmonia.webp", "width": 1092, "height": 1440, "alt": "Capa oficial — Foco em Harmonia", "sourceUrl": "https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/f385e033-316f-41f4-b168-a04782d3b412/cover-1782215350465.png", "srcSet": "/images/black/cover-foco-em-harmonia-320.webp 320w, /images/black/cover-foco-em-harmonia-640.webp 640w, /images/black/cover-foco-em-harmonia.webp 1092w"} },
    { id: 'harmomus', name: 'HARMOMUS', theme: 'PRÁTICA', title: 'Da descoberta\nà prática.', description: 'A música como parte da sua rotina.', detail: 'Uma das experiências previstas para integrar o Black Foco.', regularPrice: 478.8, image: {"src": "/images/black/cover-harmomus.webp", "width": 1024, "height": 1536, "alt": "Capa oficial — Harmomus", "sourceUrl": "https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/c8914bdb-269a-492b-b41a-37cc511e9616/cover-1783014478103.png", "srcSet": "/images/black/cover-harmomus-320.webp 320w, /images/black/cover-harmomus-640.webp 640w, /images/black/cover-harmomus.webp 1024w"} },
    { id: 'gvip', name: 'GVIP / ESCOLA', theme: 'CONTINUIDADE', title: 'Continue\nem movimento.', description: 'Mais espaço para o seu aprendizado continuar.', detail: 'A escola Foco em Canto também faz parte deste encontro.', regularPrice: 238.8, image: {"src": "/images/black/cover-grupo-vip.webp", "width": 1672, "height": 941, "alt": "Capa oficial — Grupo VIP", "sourceUrl": "https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/dfc8547c-f485-4c44-be9b-29ebc8ca32bc/cover-1782170465037.png", "srcSet": "/images/black/cover-grupo-vip-320.webp 320w, /images/black/cover-grupo-vip-640.webp 640w, /images/black/cover-grupo-vip.webp 1672w"} },
    { id: 'biblioteca', name: 'BIBLIOTECA DIGITAL', theme: 'REPERTÓRIO', title: 'Conhecimento\nsempre por perto.', description: 'PDFs e materiais para acompanhar sua jornada.', detail: 'A seleção definitiva de materiais será anunciada com a oferta.', regularPrice: 200, image: {"src": "/images/black/cover-ebooks-e-guias.webp", "width": 1024, "height": 1536, "alt": "Capa oficial — Ebooks e Guias", "sourceUrl": "https://jmhqdvracyjxqubqfgiz.supabase.co/storage/v1/object/public/hub-assets/products/e8ec11d9-8e62-4b00-a628-2523481d22de/cover-1782388708866.png", "srcSet": "/images/black/cover-ebooks-e-guias-320.webp 320w, /images/black/cover-ebooks-e-guias-640.webp 640w, /images/black/cover-ebooks-e-guias.webp 1024w"} },
    { id: 'bonus', name: 'BÔNUS', theme: 'POSSIBILIDADES', title: 'E ainda há\nmais por vir.', description: 'Novas possibilidades para ir além.', detail: 'Os bônus serão revelados na apresentação oficial da campanha.', regularPrice: null, image: null },
  ] satisfies BlackProductBase[]).map(p => ({ ...p, ...productDetails.find(d => d.id === p.id)! })),
  faqs: [
  { question: 'O que exatamente está incluído?', answer: 'A oferta de R$ 997 reúne 12 meses de Mentoria Foco em Canto Premium, Foco em Harmonia vitalício, 12 meses de Harmomus Premium, 12 meses de Escola Premium e ebooks e materiais. A seleção dos materiais e seu prazo de acesso serão detalhados antes da abertura; os bônus seguem em definição.' },
  { question: 'Harmomus e Escola ficam disponíveis por 12 meses?', answer: 'Sim. Os dois acessos Premium incluídos na Black têm duração de 12 meses. Regras de continuidade e renovação serão informadas antes da compra.' },
  {
    "question": "O que é a BLACK FOCO 2026?",
    "answer": "Uma única oportunidade para reunir formação vocal, divisão de vozes, ferramentas e materiais do ecossistema Foco em Canto. O valor da Black é R$ 997. A abertura e as demais condições finais ainda serão anunciadas."
  },
  {
    "question": "Quanto tempo dura cada acesso?",
    "answer": "A Black prevê 12 meses de Mentoria Foco em Canto Premium, 12 meses de Harmomus Premium e 12 meses de Escola Premium. Foco em Harmonia terá acesso vitalício. Biblioteca e bônus ainda terão suas condições anunciadas."
  },
  {
    "question": "O Foco em Harmonia é vitalício?",
    "answer": "Sim. O acesso ao Foco em Harmonia nesta campanha será vitalício."
  },
  {
    "question": "O que acontece depois dos 12 meses?",
    "answer": "Os acessos com prazo têm duração de 12 meses. Regras de renovação, continuidade e condições para alunos atuais serão informadas antes da abertura das vendas."
  },
  {
    "question": "Já tenho um produto. Vale a pena para mim?",
    "answer": "Compare os produtos que você já possui com os acessos reunidos nesta edição. Condições específicas para alunos atuais ainda serão divulgadas."
  },
  {
    "question": "Como recebo os acessos? Os produtos ficam no mesmo lugar?",
    "answer": "O ecossistema possui plataformas próprias, como a Escola e o Harmomus. As instruções de liberação e os ambientes de cada acesso serão detalhados antes da compra. O checkout da campanha ainda não está disponível."
  },
  {
    "question": "Preciso usar tudo ao mesmo tempo?",
    "answer": "Você poderá organizar seu estudo dentro do prazo de cada acesso. A mentoria trabalha desenvolvimento vocal; o curso de harmonia, divisão de vozes; a Escola, prática; e o Harmomus, repertório."
  },
  {
    "question": "Existe suporte e acompanhamento?",
    "answer": "A Mentoria Premium inclui grupo exclusivo, sala virtual e prioridade nas dúvidas. Na Escola, assinantes VIP enviam atividades para avaliação do professor. As condições operacionais da campanha serão apresentadas com a oferta."
  },
  {
    "question": "Posso acessar pelo celular?",
    "answer": "Os ambientes possuem acesso pelo navegador. Para aulas e atividades que utilizam gravação, o dispositivo precisa permitir câmera e microfone."
  },
  {
    "question": "Qual é a garantia da Black?",
    "answer": "A garantia e as demais condições comerciais da BLACK FOCO 2026 ainda serão definidas. Elas serão apresentadas antes da compra."
  }
],
};
export const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
export const checkoutHref = () => {
  try { const u = new URL(blackConfig.checkoutUrl || ''); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
};

export type BlackProduct = (typeof blackConfig.products)[number];
export type BlackProof = { id: string; product: string; type: "image" | "video"; priority: number; context: string; label: string; person?: string; videoTitle?: string; poster?: string; media: string; width?: number; height?: number; source: string; strength: "A" | "B" | "C" };
export const blackProofs: BlackProof[] = ([
  {
    "id": "canto-leia",
    "product": "canto",
    "type": "image",
    "label": "Material, didática e proximidade",
    "person": "Léia Rosali",
    "media": "/images/depoimentos/depoimento-print-01.webp",
    "width": 1080,
    "height": 1350,
    "source": "https://focoemcanto.com/images/depoimentos/depoimento-print-01.webp",
    "strength": "B",
    "priority": 3,
    "context": "Relato publicado da Mentoria Foco em Canto"
  },
  {
    "id": "canto-print-02",
    "product": "canto",
    "type": "image",
    "label": "Acompanhamento e orientações na mentoria",
    "person": "Isabela Rayssa",
    "media": "/images/depoimentos/depoimento-print-02.webp",
    "width": 1080,
    "height": 1350,
    "source": "https://focoemcanto.com/images/depoimentos/depoimento-print-02.webp",
    "strength": "B",
    "priority": 2,
    "context": "Relato publicado da Mentoria Foco em Canto"
  },
  {
    "id": "canto-print-03",
    "product": "canto",
    "type": "image",
    "label": "Aprendizado para cantar na igreja",
    "person": "Bárbara Mira",
    "media": "/images/depoimentos/depoimento-print-03.webp",
    "width": 1080,
    "height": 1350,
    "source": "https://focoemcanto.com/images/depoimentos/depoimento-print-03.webp",
    "strength": "B",
    "priority": 2,
    "context": "Relato publicado da Mentoria Foco em Canto"
  },
  {
    "id": "canto-print-04",
    "product": "canto",
    "type": "image",
    "label": "Conhecimento e clareza ao ensinar",
    "person": "Josy Pinheiro",
    "media": "/images/depoimentos/depoimento-print-04.webp",
    "width": 1080,
    "height": 1350,
    "source": "https://focoemcanto.com/images/depoimentos/depoimento-print-04.webp",
    "strength": "B",
    "priority": 3,
    "context": "Relato publicado da Mentoria Foco em Canto"
  },
  {
    "id": "canto-print-05",
    "product": "canto",
    "type": "image",
    "label": "Conteúdo e apoio nas dúvidas",
    "person": "Zana",
    "media": "/images/depoimentos/depoimento-print-05.webp",
    "width": 1080,
    "height": 1350,
    "source": "https://focoemcanto.com/images/depoimentos/depoimento-print-05.webp",
    "strength": "B",
    "priority": 3,
    "context": "Relato publicado da Mentoria Foco em Canto"
  },
  {
    "id": "canto-print-06",
    "product": "canto",
    "type": "image",
    "label": "Uma experiência de desenvolvimento vocal",
    "person": "Rose Mary",
    "media": "/images/depoimentos/depoimento-print-06.webp",
    "width": 1080,
    "height": 1350,
    "source": "https://focoemcanto.com/images/depoimentos/depoimento-print-06.webp",
    "strength": "B",
    "priority": 3,
    "context": "Relato publicado da Mentoria Foco em Canto"
  },
  {
    "id": "canto-print-07",
    "product": "canto",
    "type": "image",
    "label": "Aprendizado levado para a rotina",
    "person": "Ana Cláudia",
    "media": "/images/depoimentos/depoimento-print-07.webp",
    "width": 1080,
    "height": 1350,
    "source": "https://focoemcanto.com/images/depoimentos/depoimento-print-07.webp",
    "strength": "B",
    "priority": 2,
    "context": "Relato publicado da Mentoria Foco em Canto"
  },
  {
    "id": "canto-print-08",
    "product": "canto",
    "type": "image",
    "label": "Um novo caminho de aprendizado",
    "person": "Léia Rosali",
    "media": "/images/depoimentos/depoimento-print-08.webp",
    "width": 1080,
    "height": 1350,
    "source": "https://focoemcanto.com/images/depoimentos/depoimento-print-08.webp",
    "strength": "B",
    "priority": 4,
    "context": "Relato publicado da Mentoria Foco em Canto"
  },
  {
    "id": "canto-video",
    "product": "canto",
    "type": "video",
    "label": "Depoimento em vídeo da Mentoria",
    "media": "rDzhJn2SYbI",
    "poster": "https://i.ytimg.com/vi/rDzhJn2SYbI/hqdefault.jpg",
    "videoTitle": "DEPOIMENTO FOCO EM CANTO - JOILMA",
    "source": "https://focoemcanto.com/",
    "strength": "A",
    "priority": 2,
    "context": "Vídeo publicado na página da Mentoria; resultado não transcrito"
  },
  {
    "id": "canto-video-2",
    "product": "canto",
    "type": "video",
    "label": "Depoimento em vídeo da Mentoria",
    "media": "kenwsDb_0XM",
    "poster": "https://i.ytimg.com/vi/kenwsDb_0XM/hqdefault.jpg",
    "videoTitle": "Depoimento | Juliana Torquato (Foco em Canto)",
    "source": "https://focoemcanto.com/",
    "strength": "A",
    "priority": 2,
    "context": "Vídeo publicado na página da Mentoria; resultado não transcrito"
  },
  {
    "id": "canto-video-3",
    "product": "canto",
    "type": "video",
    "label": "Depoimento em vídeo da Mentoria",
    "media": "8LbwCcpvEdw",
    "poster": "https://i.ytimg.com/vi/8LbwCcpvEdw/hqdefault.jpg",
    "videoTitle": "Evolução Talita | Foco em Canto",
    "source": "https://focoemcanto.com/",
    "strength": "A",
    "priority": 2,
    "context": "Vídeo publicado na página da Mentoria; resultado não transcrito"
  },
  {
    "id": "canto-video-4",
    "product": "canto",
    "type": "video",
    "label": "Depoimento em vídeo da Mentoria",
    "media": "vbLXwcRl4NQ",
    "poster": "https://i.ytimg.com/vi/vbLXwcRl4NQ/hqdefault.jpg",
    "videoTitle": "DEPOIMENTOS  FOCO EM CANTO",
    "source": "https://focoemcanto.com/",
    "strength": "A",
    "priority": 2,
    "context": "Vídeo publicado na página da Mentoria; resultado não transcrito"
  },
  {
    "id": "harmonia-print",
    "product": "harmonia",
    "type": "image",
    "label": "Cantar ouvindo outra voz",
    "person": "just_thalii",
    "media": "/images/black/proof-harmonia-01.webp",
    "width": 1080,
    "height": 1920,
    "source": "https://promo.focoemcanto.com/images/depoimentos/%20depoimento-1.webp",
    "strength": "B",
    "priority": 1,
    "context": "Comentário publicado na página do Foco em Harmonia"
  },
  {
    "id": "harmonia-print-02",
    "product": "harmonia",
    "type": "image",
    "label": "Uma opinião sobre o curso",
    "media": "/images/black/proof-harmonia-02.webp",
    "width": 1080,
    "height": 1920,
    "source": "https://promo.focoemcanto.com/images/depoimentos/%20depoimento-2.webp",
    "strength": "C",
    "priority": 4,
    "context": "Comentário publicado na página do Foco em Harmonia"
  },
  {
    "id": "harmonia-print-03",
    "product": "harmonia",
    "type": "image",
    "label": "Clareza na explicação",
    "media": "/images/black/proof-harmonia-03.webp",
    "width": 1080,
    "height": 1920,
    "source": "https://promo.focoemcanto.com/images/depoimentos/%20depoimento-3.webp",
    "strength": "C",
    "priority": 4,
    "context": "Comentário publicado na página do Foco em Harmonia"
  },
  {
    "id": "harmonia-print-04",
    "product": "harmonia",
    "type": "image",
    "label": "Percepção de onde estava errando",
    "media": "/images/black/proof-harmonia-04.webp",
    "width": 1080,
    "height": 1920,
    "source": "https://promo.focoemcanto.com/images/depoimentos/%20depoimento-4.webp",
    "strength": "B",
    "priority": 3,
    "context": "Comentário publicado na página do Foco em Harmonia"
  },
  {
    "id": "harmonia-print-05",
    "product": "harmonia",
    "type": "image",
    "label": "Facilidade ao aprender",
    "media": "/images/black/proof-harmonia-05.webp",
    "width": 1080,
    "height": 1920,
    "source": "https://promo.focoemcanto.com/images/depoimentos/%20depoimento-5.webp",
    "strength": "C",
    "priority": 4,
    "context": "Comentário publicado na página do Foco em Harmonia"
  },
  {
    "id": "harmonia-print-06",
    "product": "harmonia",
    "type": "image",
    "label": "Aplicação do método",
    "media": "/images/black/proof-harmonia-06.webp",
    "width": 1080,
    "height": 1920,
    "source": "https://promo.focoemcanto.com/images/depoimentos/%20depoimento-6.webp",
    "strength": "B",
    "priority": 1,
    "context": "Comentário publicado na página do Foco em Harmonia"
  },
  {
    "id": "harmonia-print-07",
    "product": "harmonia",
    "type": "image",
    "label": "Cantar como antes não conseguia",
    "media": "/images/black/proof-harmonia-07.webp",
    "width": 1080,
    "height": 1920,
    "source": "https://promo.focoemcanto.com/images/depoimentos/%20depoimento-7.webp",
    "strength": "B",
    "priority": 1,
    "context": "Comentário publicado na página do Foco em Harmonia"
  },
  {
    "id": "harmonia-video",
    "product": "harmonia",
    "type": "video",
    "label": "Depoimento em vídeo do Foco em Harmonia",
    "media": "T0rDCxXoCR0",
    "poster": "https://i.ytimg.com/vi/T0rDCxXoCR0/hqdefault.jpg",
    "videoTitle": "Depoimento Juliana - Foco em Harmonia",
    "source": "https://promo.focoemcanto.com/",
    "strength": "A",
    "priority": 2,
    "context": "Vídeo publicado na página do Foco em Harmonia; resultado não transcrito"
  }
] satisfies BlackProof[]).sort((a,b) => a.priority - b.priority);

// Inteiros em centavos evitam deriva binária na soma e na economia.
export const valueItems = [
  { product: 'canto', label: 'MENTORIA PREMIUM', access: '12 meses Premium', calculation: null },
  { product: 'harmonia', label: 'FOCO EM HARMONIA', access: 'Acesso vitalício', calculation: null },
  { product: 'harmomus', label: 'HARMOMUS PREMIUM', access: '12 meses Premium', calculation: { monthlyCents: 3990, months: 12 } },
  { product: 'gvip', label: 'ESCOLA / GVIP PREMIUM', access: '12 meses Premium', calculation: { monthlyCents: 1990, months: 12 } },
  { product: 'biblioteca', label: 'EBOOKS + MATERIAIS', access: 'Incluídos · prazo a confirmar', calculation: null },
].map(item => ({ ...item, cents: Math.round((blackConfig.products.find(p => p.id === item.product)?.regularPrice || 0) * 100) }));
export const offerTotals = {
  regularCents: valueItems.reduce((sum,item) => sum + item.cents, 0),
  blackCents: Math.round(blackConfig.payment.cashPrice * 100),
  get savingsCents() { return this.regularCents - this.blackCents; },
  get discountPercentage() { return this.savingsCents / this.regularCents * 100; },
};
// Main-stage impact; complete screenshot/video inventories remain in each product.
export const globalVideoProofIds = ['canto-video','canto-video-2','canto-video-3','canto-video-4','harmonia-video'];
