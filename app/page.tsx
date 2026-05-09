const checkoutUrl = 'https://pay.kiwify.com.br/VIGVnxC'
const whatsappUrl = 'https://wa.me/5571997178807'

const phases = [
  {
    img: '/images/metodo/fase-01.webp',
    tag: 'FASE 01',
    title: 'Boas-vindas e diagnóstico vocal',
    text: 'Comece entendendo sua voz, suas necessidades e o caminho certo para evoluir com segurança.'
  },
  {
    img: '/images/metodo/fase-02.webp',
    tag: 'FASE 02',
    title: 'Mentalidade e fisiologia da voz',
    text: 'Prepare sua mente e compreenda como sua voz funciona para cantar com mais controle.'
  },
  {
    img: '/images/metodo/fase-03.webp',
    tag: 'FASE 03',
    title: 'Respiração, controle e afinação',
    text: 'Desenvolva estabilidade, potência e emissão vocal sem forçar.'
  },
  {
    img: '/images/metodo/fase-04.webp',
    tag: 'FASE 04',
    title: 'Extensão, registros e prática aplicada',
    text: 'Expanda sua voz e aplique tudo em músicas, apresentações e rotina real.'
  }
]

const benefits = [
  'Afinação precisa e controle sobre sua voz.',
  'Técnicas de respiração para emissão estável e segura.',
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
  ['Como funciona o suporte durante o curso?', 'Você conta com acompanhamento, comunidade e aulas ao vivo para tirar dúvidas e evoluir com mais segurança.']
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
          <div className="hero-media">
            <img src="/images/hero/hero-foco-em-canto.webp" alt="Foco em Canto" />
          </div>
          <div className="hero-copy">
            <h1>Libere o verdadeiro potencial da sua voz e <span>aprenda a cantar com confiança e potência</span> mesmo do zero</h1>
            <p>Domine sua voz com o método Foco em Canto: você terá afinação precisa, controle vocal e confiança, mesmo começando do zero.</p>
            <a href={checkoutUrl} className="btn">INSCRIÇÕES ABERTAS</a>
            <div className="price-pills">
              <span>De <s>R$2397,00</s></span>
              <strong>12x R$72,09</strong>
            </div>
          </div>
        </div>
        <div className="container trust-box">
          <span><i>▣</i> Acesso Imediato</span>
          <span><i>☆</i> 15 Dias de Garantia</span>
          <span><i>▶</i> Aulas ao vivo</span>
          <span><i>✓</i> Pagamento Seguro</span>
        </div>
      </section>

      <section className="dark-section ideal-section">
        <div className="container split">
          <div>
            <h2>O Foco em Canto é a <strong>mentoria ideal</strong> para:</h2>
            <ul className="check-list">
              <li><b>Aspirantes a cantores:</b> para quem sempre sonhou em cantar, mas não sabe por onde começar.</li>
              <li><b>Cantores iniciantes:</b> para quem já começou a explorar o canto, mas quer aperfeiçoar suas habilidades.</li>
              <li><b>Músicos de igreja:</b> para quem deseja aprimorar sua técnica vocal para louvores e apresentações.</li>
              <li><b>Profissionais da música:</b> para quem quer ampliar possibilidades e alcançar um novo nível de performance.</li>
            </ul>
          </div>
          <img className="section-img" src="/images/ideal-para/ideal-para.webp" alt="Mentoria ideal para" />
        </div>
      </section>

      <section className="dark-section transform-section">
        <div className="container split">
          <div className="transform-visual">
            <img className="section-img tall" src="/images/metodo/fase-03.webp" alt="Marcos cantando" />
          </div>
          <div>
            <h2>Sua voz pode ser a chave para <strong>transformar sua vida!</strong></h2>
            <p>Seja para cantar como hobby ou seguir uma carreira profissional, o método Foco em Canto pode fazer da sua voz a verdadeira ferramenta de transformação.</p>
            <p>Com quatro pilares essenciais e uma abordagem prática e personalizada, a mentoria começa com um diagnóstico vocal para mapear suas necessidades específicas.</p>
            <div className="outline-card">Você verá sua voz evoluir semana a semana, tornando-se mais preparada para abrir portas e te levar mais longe.</div>
            <a href={checkoutUrl} className="btn">GARANTIR MINHA VAGA</a>
          </div>
        </div>
      </section>

      <section className="light-section">
        <div className="container">
          <h2 className="center-title">Na Mentoria Foco em Canto, você vai dominar a técnica vocal em 4 passos simples</h2>
          <div className="phase-grid">
            {phases.map((phase) => (
              <article className="phase-card" key={phase.tag}>
                <img src={phase.img} alt={phase.title} />
                <div className="phase-body">
                  <span>{phase.tag}</span>
                  <h3>{phase.title}</h3>
                  <hr />
                  <p>{phase.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="light-section results-section">
        <div className="container">
          <h2>Veja os resultados que alguns dos nossos alunos já alcançaram, mudando sua forma de cantar definitivamente!</h2>
          <div className="video-grid">
            <iframe src="https://www.youtube.com/embed/rDzhJn2SYbI" title="Depoimento 1" allowFullScreen />
            <iframe src="https://www.youtube.com/embed/kenwsDb_0XM" title="Depoimento 2" allowFullScreen />
            <iframe src="https://www.youtube.com/embed/8LbwCcpvEdw" title="Depoimento 3" allowFullScreen />
          </div>
          <div className="print-grid">
            <img src="/images/depoimentos/depoimento-print-01.webp" alt="Depoimento" />
            <img src="/images/depoimentos/depoimento-print-02.webp" alt="Depoimento" />
            <img src="/images/depoimentos/depoimento-print-03.webp" alt="Depoimento" />
            <img src="/images/depoimentos/depoimento-print-04.webp" alt="Depoimento" />
          </div>
        </div>
      </section>

      <section className="light-section recap-section">
        <div className="container">
          <h2>Recapitulando... Você sairá desse treinamento, sabendo:</h2>
          <div className="benefit-grid">
            {benefits.map((benefit) => <div className="benefit" key={benefit}>✅ <span>{benefit}</span></div>)}
          </div>
          <a href={checkoutUrl} className="btn centered">INSCREVA-SE AGORA</a>
        </div>
      </section>

      <section className="dark-section bonus-section">
        <div className="container">
          <h2>E ainda não acabou...<br />Além de todo conteúdo, você vai ter acesso a bônus exclusivos:</h2>
          <div className="bonus-card">
            <img src="/images/bonus/bonus-apps.webp" alt="Bônus apps" />
            <div>
              <h3>Acesso a apps de treino vocal</h3>
              <p>Ferramentas digitais para praticar e evoluir com mais agilidade.</p>
              <div className="bonus-price"><s>De R$197,00</s><strong>Por: Bônus</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="dark-soft center-section">
        <div className="container narrow">
          <img className="notebook" src="/images/bonus/bonus-aulas-ao-vivo.webp" alt="Aulas ao vivo" />
          <h2><strong>Aulas ao vivo toda semana!</strong> Na Mentoria você tem um acompanhamento de perto, garantindo o seu desenvolvimento.</h2>
          <div className="trust-box compact">
            <span><i>✓</i> Grupo Exclusivo</span>
            <span><i>✓</i> Sala Virtual</span>
            <span><i>✓</i> Aulas ao vivo</span>
          </div>
        </div>
      </section>

      <section className="offer-section premium-offer-section">
        <div className="container offer-premium-grid">
          <div className="offer-price-block">
            <p className="old-price">De: <s>R$2397,00</s></p>
            <div className="price-drop-arrow">Por apenas:</div>
            <div className="price-installment">
              <span className="price-times">12x</span>
              <span className="price-value">R$&nbsp;72,09</span>
            </div>
            <p className="cash-price">ou <strong>R$ 697,00</strong> à vista</p>
            <a href={checkoutUrl} className="btn offer-btn">ENTRAR AGORA</a>
          </div>

          <div className="offer-content-card">
            <img className="offer-img" src="/images/oferta/oferta-foco-em-canto.webp" alt="Foco em Canto" />
            <h2>Entre para a Mentoria Foco em Canto hoje e desbloqueie o potencial da sua voz!</h2>
            <ul className="offer-list">
              <li>✓ Aulas Gravadas</li>
              <li>✓ Diagnóstico Vocal</li>
              <li>✓ Suporte Especial</li>
              <li>✓ Aulas ao Vivo</li>
              <li>✓ Sala Virtual</li>
              <li>✓ 15 dias de garantia</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="dark-soft guarantee-section">
        <div className="container split">
          <img className="guarantee-img" src="/images/garantia/garantia-15-dias.webp" alt="Garantia de 15 dias" />
          <div>
            <h2>15 dias de garantia incondicional — ou seu dinheiro de volta!</h2>
            <p>Você tem 15 dias para experimentar o treinamento. Se por qualquer motivo entender que não está evoluindo ou que o método não é para você, devolvemos 100% do seu dinheiro.</p>
          </div>
        </div>
      </section>

      <section className="mentor-section">
        <div className="container split mentor-grid">
          <div className="mentor-copy">
            <h2>Seu mentor vocal nessa jornada será Marcos Perrella Cruz</h2>
            <p>Marcos Cruz é músico profissional e professor de canto, técnica vocal e piano com mais de 15 anos de experiência. Já ajudou centenas de alunos a destravarem suas vozes e atua como instrutor de técnica vocal em grupos de louvor.</p>
            <p>Com os horários de aulas individuais lotados, desenvolveu a mentoria Foco em Canto para atender mais alunos com uma abordagem única.</p>
            <a href={checkoutUrl} className="btn">QUERO APRENDER A CANTAR</a>
          </div>
          <img className="mentor-img" src="/images/mentor/mentor-marcos.webp" alt="Marcos Perrella Cruz" />
        </div>
      </section>

      <section className="faq-section">
        <div className="container">
          <h2>Perguntas Frequentes</h2>
          <div className="faq-list">
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
