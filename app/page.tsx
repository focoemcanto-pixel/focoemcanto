import VideoTestimonials from './components/VideoTestimonials'
import VslPlayer from './components/VslPlayer'

const offerAnchor = '#oferta'
const essentialCheckoutUrl = 'https://pay.kiwify.com.br/v6K4oD5'
const premiumCheckoutUrl = 'https://pay.kiwify.com.br/VIGVnxC'
const whatsappUrl = 'https://wa.me/5571997178807'
const vslVideoUrl = 'https://pub-fc66e9e933424d3492375431357d3967.r2.dev/lagepage%20-%20FC.mp4'

const phases = [
  { img: '/images/metodo/fase-01.webp', tag: 'FASE 01', title: 'Boas-vindas e diagnóstico vocal', text: 'Comece entendendo sua voz, suas necessidades e o caminho certo para evoluir com segurança.' },
  { img: '/images/metodo/fase-02.webp', tag: 'FASE 02', title: 'Mentalidade e fisiologia da voz', text: 'Prepare sua mente e compreenda como sua voz funciona para cantar com mais controle.' },
  { img: '/images/metodo/fase-03.webp', tag: 'FASE 03', title: 'Respiração, controle e afinação', text: 'Desenvolva estabilidade, potência e emissão vocal sem forçar.' },
  { img: '/images/metodo/fase-04.webp', tag: 'FASE 04', title: 'Extensão, registros e prática aplicada', text: 'Expanda sua voz e aplique tudo em músicas, apresentações e rotina real.' }
]

const videoTestimonials = [
  { id: 'rDzhJn2SYbI', title: 'Depoimento 1' },
  { id: 'kenwsDb_0XM', title: 'Depoimento 2' },
  { id: '8LbwCcpvEdw', title: 'Depoimento 3' },
  { id: 'vbLXwcRl4NQ', title: 'Depoimento 4' }
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

function ValueComparisonCard() {
  return (
    <div className="value-card">
      <h2>Olha o valor disso na prática</h2>
      <div className="value-card-grid">
        <div className="value-left">
          <span className="value-note">Aula individual: R$600/mês</span>
          <strong className="value-old">Mais de<br />R$7.000<br />ao ano<span /></strong>
        </div>
        <span className="value-arrow">→</span>
        <div className="value-result"><strong>Isso facilmente passaria de R$2.000</strong></div>
      </div>
    </div>
  )
}

function PlanCheck({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start', color: 'rgba(255,255,255,.86)', fontWeight: 700, lineHeight: 1.45 }}>
      <span style={{ color: 'var(--accent)', fontWeight: 900, flex: '0 0 auto' }}>✓</span>
      <span>{children}</span>
    </li>
  )
}

export default function Home() {
  return (
    <main>
      <a className="whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="WhatsApp"><WhatsAppIcon /></a>

      <section className="hero-section">
        <div className="container hero-grid">
          <div className="hero-media vsl-hero-media">
            <VslPlayer src={vslVideoUrl} />
          </div>
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

      <section className="dark-section ideal-section">
        <div className="container split">
          <div><h2>O Foco em Canto é a <strong>mentoria ideal</strong> para:</h2><ul className="check-list"><li><b>Aspirantes a cantores:</b> para quem sempre sonhou em cantar, mas não sabe por onde começar.</li><li><b>Cantores iniciantes:</b> para quem já começou a explorar o canto, mas quer aperfeiçoar suas habilidades.</li><li><b>Músicos de igreja:</b> para quem deseja aprimorar sua técnica vocal para louvores e apresentações.</li><li><b>Profissionais da música:</b> para quem quer ampliar possibilidades e alcançar um novo nível de performance.</li></ul></div>
          <img className="section-img ideal-img" src="/images/ideal-para/ideal-para.webp" alt="Mentoria ideal para" width="900" height="700" loading="lazy" decoding="async" />
        </div>
      </section>

      <section className="dark-section transform-section">
        <div className="container split">
          <div className="transform-visual"><img className="section-img tall" src="/images/metodo/fase-03.webp" alt="Marcos cantando" width="600" height="800" loading="lazy" decoding="async" /></div>
          <div><h2>Sua voz pode ser a chave para <strong>transformar sua vida!</strong></h2><p>Seja para cantar como hobby ou seguir uma carreira profissional, o método Foco em Canto pode fazer da sua voz a verdadeira ferramenta de transformação.</p><p>Com quatro pilares essenciais e uma abordagem prática e personalizada, a mentoria começa com um diagnóstico vocal para mapear suas necessidades específicas.</p><div className="outline-card">Você verá sua voz evoluir semana a semana, tornando-se mais preparada para abrir portas e te levar mais longe.</div><a href={offerAnchor} className="btn">VER PLANOS DA MENTORIA</a></div>
        </div>
      </section>

      <section className="light-section">
        <div className="container">
          <h2 className="center-title">Na Mentoria Foco em Canto, você vai dominar a técnica vocal em 4 passos simples</h2>
          <div className="phase-grid">{phases.map((phase) => <article className="phase-card" key={phase.tag}><img src={phase.img} alt={phase.title} width="420" height="260" loading="lazy" decoding="async" /><div className="phase-body"><span>{phase.tag}</span><h3>{phase.title}</h3><hr /><p>{phase.text}</p></div></article>)}</div>
        </div>
      </section>

      <section className="light-section results-section">
        <div className="container">
          <h2>Veja os resultados que alguns dos nossos alunos já alcançaram, mudando sua forma de cantar definitivamente!</h2>
          <VideoTestimonials videos={videoTestimonials} />
          <div className="testimonials-carousel"><div className="carousel-head"><h3>Mais depoimentos dos alunos</h3><span>Arraste para ver todos →</span></div><div className="carousel-track">{testimonialImages.map((src, index) => <figure key={src}><img src={src} alt={`Depoimento de aluno ${index + 1}`} width="720" height="900" loading="lazy" decoding="async" /></figure>)}</div></div>
        </div>
      </section>

      <section className="light-section recap-section"><div className="container"><h2>Recapitulando... Você sairá desse treinamento, sabendo:</h2><div className="benefit-grid">{benefits.map((benefit) => <div className="benefit" key={benefit}>✅ <span>{benefit}</span></div>)}</div><a href={offerAnchor} className="btn centered">VER PLANOS DA MENTORIA</a></div></section>

      <section className="dark-section bonus-section"><div className="container"><h2>E ainda não acabou...<br />Além de todo conteúdo, você vai ter acesso a bônus exclusivos:</h2><div className="bonus-card"><img src="/images/bonus/bonus-apps.webp" alt="Bônus apps" width="800" height="560" loading="lazy" decoding="async" /><div><h3>Acesso a apps de treino vocal</h3><p>Ferramentas digitais para praticar e evoluir com mais agilidade.</p><div className="bonus-price"><s>De R$197,00</s><strong>Por: Bônus</strong></div></div></div></div></section>

      <section className="dark-soft center-section"><div className="container narrow"><img className="notebook" src="/images/bonus/bonus-aulas-ao-vivo.webp" alt="Aulas ao vivo" width="900" height="600" loading="lazy" decoding="async" /><h2><strong>Aulas ao vivo toda semana!</strong> Na Mentoria você tem um acompanhamento de perto, garantindo o seu desenvolvimento.</h2><div className="trust-box compact"><span><i>✓</i> Grupo Exclusivo</span><span><i>✓</i> Sala Virtual</span><span><i>✓</i> Aulas ao vivo</span></div></div></section>

      <section id="oferta" className="offer-section premium-offer-section">
        <div className="container">
          <ValueComparisonCard />

          <div className="price-offer" style={{ maxWidth: '840px', marginBottom: '3rem' }}>
            <div className="offer-badge">🔥 INSCRIÇÕES ABERTAS</div>
            <h2>Escolha sua experiência no Foco em Canto</h2>
            <p style={{ maxWidth: '720px', margin: '0 auto', color: 'rgba(255,255,255,.72)', fontSize: '1.08rem' }}>
              Entre para o método que vai te ajudar a desenvolver sua voz com técnica, segurança e confiança — escolhendo o plano que mais combina com o seu momento.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', alignItems: 'stretch' }}>
            <article style={{ background: 'linear-gradient(145deg,#18181b,#0b0b0c)', border: '1px solid rgba(255,255,255,.14)', borderRadius: '28px', padding: 'clamp(1.6rem,4vw,2.2rem)', boxShadow: '0 18px 60px rgba(0,0,0,.32)', display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 900, fontSize: '.78rem', letterSpacing: '.12em', marginBottom: '.8rem' }}>ESSENTIAL</span>
              <h3 style={{ fontSize: 'clamp(1.55rem,2.4vw,2rem)' }}>Foco em Canto Essential</h3>
              <p style={{ color: 'rgba(255,255,255,.68)' }}>Ideal para quem quer começar sua evolução vocal com acesso ao método completo e aulas ao vivo.</p>

              <ul style={{ listStyle: 'none', display: 'grid', gap: '.9rem', margin: '1rem 0 2rem' }}>
                <PlanCheck>Curso completo na plataforma</PlanCheck>
                <PlanCheck>Aulas ao vivo semanais</PlanCheck>
                <PlanCheck>Exercícios práticos</PlanCheck>
                <PlanCheck>Acesso imediato</PlanCheck>
                <PlanCheck>15 dias de garantia</PlanCheck>
              </ul>

              <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,.12)' }}>
                <span style={{ display: 'block', color: 'rgba(255,255,255,.55)', fontWeight: 700 }}>comece por</span>
                <strong style={{ display: 'block', fontSize: 'clamp(2.2rem,4vw,3.2rem)', lineHeight: 1, margin: '.5rem 0', letterSpacing: '-.05em' }}>12x R$30,72</strong>
                <small style={{ display: 'block', color: 'rgba(255,255,255,.55)', fontWeight: 700 }}>ou <b style={{ color: '#fff' }}>R$297 à vista</b></small>
                <span style={{ display: 'inline-flex', width: 'fit-content', marginTop: '.75rem', padding: '.45rem .75rem', borderRadius: '999px', background: 'rgba(244,200,75,.14)', color: 'var(--gold)', fontWeight: 900, fontSize: '.78rem' }}>à vista com desconto no Pix ou crédito</span>
              </div>

              <a href={essentialCheckoutUrl} className="btn" style={{ width: '100%', marginTop: '1.6rem', padding: '1.25rem 1rem', borderRadius: '14px' }}>
                COMEÇAR PELO ESSENTIAL
              </a>
            </article>

            <article style={{ position: 'relative', background: 'radial-gradient(circle at top right,rgba(40,215,191,.22),transparent 34%),linear-gradient(145deg,#1d1d20,#090909)', border: '1.5px solid var(--accent)', borderRadius: '28px', padding: 'clamp(1.6rem,4vw,2.2rem)', boxShadow: '0 18px 70px rgba(40,215,191,.14)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'inline-flex', width: 'fit-content', marginBottom: '1.4rem', background: 'linear-gradient(135deg,var(--accent),#2c8e5a)', color: '#fff', padding: '.7rem 1.2rem', borderRadius: '999px', fontWeight: 900, fontSize: '.82rem', boxShadow: '0 14px 34px rgba(40,215,191,.22)' }}>⭐ EXPERIÊNCIA COMPLETA</div>

              <span style={{ color: 'var(--accent)', fontWeight: 900, fontSize: '.78rem', letterSpacing: '.12em', marginBottom: '.8rem' }}>PREMIUM</span>
              <h3 style={{ fontSize: 'clamp(1.55rem,2.4vw,2rem)' }}>Foco em Canto Premium</h3>
              <p style={{ color: 'rgba(255,255,255,.68)' }}>Ideal para quem deseja acompanhamento mais próximo, ambiente exclusivo e uma jornada mais direcionada.</p>

              <ul style={{ listStyle: 'none', display: 'grid', gap: '.9rem', margin: '1rem 0 2rem' }}>
                <PlanCheck>Tudo do Essential</PlanCheck>
                <PlanCheck>Grupo exclusivo de alunos</PlanCheck>
                <PlanCheck>Sala virtual da mentoria</PlanCheck>
                <PlanCheck>Prioridade nas dúvidas</PlanCheck>
                <PlanCheck>Acompanhamento premium</PlanCheck>
                <PlanCheck>15 dias de garantia</PlanCheck>
              </ul>

              <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,.12)' }}>
                <span style={{ display: 'block', color: 'rgba(255,255,255,.55)', fontWeight: 700 }}>experiência completa por</span>
                <strong style={{ display: 'block', color: 'var(--accent)', fontSize: 'clamp(2.2rem,4vw,3.2rem)', lineHeight: 1, margin: '.5rem 0', letterSpacing: '-.05em' }}>12x R$72,09</strong>
                <small style={{ display: 'block', color: 'rgba(255,255,255,.55)', fontWeight: 700 }}>ou <b style={{ color: '#fff' }}>R$697 à vista</b></small>
                <span style={{ display: 'inline-flex', width: 'fit-content', marginTop: '.75rem', padding: '.45rem .75rem', borderRadius: '999px', background: 'rgba(244,200,75,.14)', color: 'var(--gold)', fontWeight: 900, fontSize: '.78rem' }}>à vista com desconto no Pix ou crédito</span>
              </div>

              <a href={premiumCheckoutUrl} className="btn" style={{ width: '100%', marginTop: '1.6rem', padding: '1.25rem 1rem', borderRadius: '14px' }}>
                QUERO A EXPERIÊNCIA COMPLETA
              </a>
            </article>
          </div>

          <p className="renew-note" style={{ textAlign: 'center' }}>
            A assinatura é anual, com renovação automática no mesmo valor contratado.
          </p>
        </div>
      </section>

      <section className="dark-soft guarantee-section"><div className="container"><div className="guarantee-card"><img className="guarantee-img" src="/images/garantia/garantia-15-dias.webp" alt="Garantia de 15 dias" width="420" height="420" loading="lazy" decoding="async" /><div><h2>Você entra sem medo</h2><p>15 dias de garantia incondicional.<br />Se não fizer sentido, reembolso total e sem burocracia.</p><div className="risk-zero"><span>✓</span>RISCO ZERO</div></div></div></div></section>

      <section className="mentor-section"><div className="container split mentor-grid"><div className="mentor-copy"><h2>Seu mentor vocal nessa jornada será Marcos Perrella Cruz</h2><p>Marcos Cruz é músico profissional e professor de canto, técnica vocal e piano com mais de 15 anos de experiência. Já ajudou centenas de alunos a destravarem suas vozes e atua como instrutor de técnica vocal em grupos de louvor.</p><p>Com os horários de aulas individuais lotados, desenvolveu a mentoria Foco em Canto para atender mais alunos com uma abordagem única.</p><a href={offerAnchor} className="btn">VER PLANOS DA MENTORIA</a></div><img className="mentor-img" src="/images/mentor/mentor-marcos.webp" alt="Marcos Perrella Cruz" width="640" height="760" loading="lazy" decoding="async" /></div></section>

      <section className="faq-section"><div className="container"><h2>Perguntas Frequentes</h2><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div></section>
    </main>
  )
}
