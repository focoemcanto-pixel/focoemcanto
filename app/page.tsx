import VideoTestimonials from './components/VideoTestimonials'

const offerAnchor = '#oferta'
const essentialCheckoutUrl = 'https://pay.kiwify.com.br/v6K4oD5'
const premiumCheckoutUrl = 'https://pay.kiwify.com.br/VIGVnxC'
const whatsappUrl = 'https://wa.me/5571997178807'

const phases = [
  { img: '/images/metodo/fase-01.webp', tag: 'FASE 01', title: 'Boas-vindas e diagnóstico vocal', text: 'Comece entendendo sua voz, suas necessidades e o caminho certo para evoluir com segurança.' },
  { img: '/images/metodo/fase-02.webp', tag: 'FASE 02', title: 'Mentalidade e fisiologia da voz', text: 'Prepare sua mente e compreenda como sua voz funciona para cantar com mais controle.' },
  { img: '/images/metodo/fase-03.webp', tag: 'FASE 03', title: 'Respiração, controle e afinação', text: 'Desenvolva estabilidade, potência e emissão vocal sem forçar.' },
  { img: '/images/metodo/fase-04.webp', tag: 'FASE 04', title: 'Extensão, registros e prática aplicada', text: 'Expanda sua voz e aplique tudo em músicas, apresentações e rotina real.' }
]

const videoTestimonials = [
  { id: 'rDzhJn2SYbI', title: 'Depoimento 1' },
  { id: 'kenwsDb_0XM', title: 'Depoimento 2' },
  { id: '8LbwCcpvEdw', title: 'Depoimento 3' }
]

const testimonialImages = [
  '/images/depoimentos/depoimento-print-01.webp',
  '/images/depoimentos/depoimento-print-02.webp',
  '/images/depoimentos/depoimento-print-03.webp',
  '/images/depoimentos/depoimento-print-04.webp',
  '/images/depoimentos/depoimento-print-05.webp',
  '/images/depoimentos/depoimento-print-06.webp',
  '/images/depoimentos/depoimento-print-07.webp',
  '/images/depoimentos/depoimento-print-08.webp'
]

const benefits = [
  'Afinação precisa e controle sobre sua voz.',
  'Técnicas de respiração para emissão vocal estável e segura.',
  'Aumento da projeção e potência vocal sem forçar.',
  'Confiança para cantar em público e gravar com segurança.',
  'Saúde vocal, prevenindo lesões e fadiga.',
  'Interpretação emocional que conecta você ao público.'
]

const faqs = [
  ['Esse curso serve para quem está começando do zero?', 'Sim. A mentoria foi construída para quem quer desenvolver a voz com direção, mesmo sem experiência técnica.'],
  ['Quanto tempo tenho para completar o curso?', 'Você terá acesso à sala virtual e poderá rever os conteúdos no seu ritmo.'],
  ['Em quanto tempo verei resultados?', 'A evolução depende da prática, mas o método foi pensado para gerar progresso semana a semana.'],
  ['Preciso de algum equipamento específico?', 'Não. Você pode começar com celular, internet e disposição para praticar.'],
  ['Posso parcelar o valor do treinamento?', 'Sim. O checkout mostra todas as opções de parcelamento disponíveis.'],
  ['Como funciona a garantia?', 'Você tem 15 dias para experimentar. Se não fizer sentido para você, pode solicitar reembolso dentro do prazo.'],
  ['Como funciona o suporte durante o curso?', 'O plano Essential inclui aulas ao vivo e acesso ao método. O plano Premium inclui também grupo exclusivo, sala virtual e acompanhamento mais próximo.']
]

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16.04 3.2c-7.1 0-12.87 5.74-12.87 12.8 0 2.25.6 4.45 1.72 6.38L3.1 28.8l6.6-1.73a12.95 12.95 0 0 0 6.34 1.62c7.1 0 12.87-5.74 12.87-12.8S23.14 3.2 16.04 3.2Zm0 23.5c-2.08 0-4.1-.6-5.84-1.74l-.42-.27-3.92 1.03 1.05-3.8-.28-.43a10.53 10.53 0 0 1-1.62-5.6c0-5.96 4.88-10.8 10.88-10.8s10.88 4.84 10.88 10.8-4.88 10.8-10.88 10.8Zm5.96-8.06c-.33-.16-1.96-.96-2.26-1.07-.3-.11-.52-.16-.74.16-.22.33-.85 1.07-1.04 1.29-.19.22-.38.24-.7.08-.33-.16-1.38-.5-2.63-1.6-.97-.86-1.63-1.93-1.82-2.26-.19-.33-.02-.5.14-.66.15-.15.33-.38.49-.57.16-.19.22-.33.33-.55.11-.22.05-.41-.03-.57-.08-.16-.74-1.78-1.01-2.43-.27-.64-.54-.55-.74-.56h-.63c-.22 0-.57.08-.87.41-.3.33-1.14 1.11-1.14 2.7 0 1.6 1.17 3.14 1.33 3.36.16.22 2.3 3.5 5.57 4.9.78.33 1.38.53 1.86.68.78.25 1.49.21 2.05.13.63-.09 1.96-.8 2.24-1.56.27-.77.27-1.43.19-1.56-.08-.14-.3-.22-.63-.38Z" />
    </svg>
  )
}

export default function Home() {
  return (
    <main>
      <a className="whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="WhatsApp"><WhatsAppIcon /></a>

      <section className="hero-section">
        <div className="container hero-grid">
          <div className="hero-media"><img src="/images/hero/hero-foco-em-canto.webp" alt="Foco em Canto" width="900" height="700" fetchPriority="high" /></div>
          <div className="hero-copy">
            <div className="hero-copy-inner">
              <h1>Libere o verdadeiro potencial da sua voz e <span>aprenda a cantar com confiança e potência</span> mesmo do zero</h1>
              <p>Domine sua voz com o método Foco em Canto: você terá afinação precisa, controle vocal e confiança, mesmo começando do zero.</p>
              <a href={offerAnchor} className="btn">VER PLANOS DA MENTORIA</a>
            </div>
          </div>
        </div>
        <div className="container trust-box"><span><i>▣</i> Acesso Imediato</span><span><i>☆</i> 15 Dias de Garantia</span><span><i>▶</i> Aulas ao vivo</span><span><i>✓</i> Pagamento Seguro</span></div>
      </section>
    </main>
  )
}
