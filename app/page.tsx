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

export default function Home() {
  return (
    <main>
      <a className="whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="WhatsApp">☎</a>

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
          <span>▣ Acesso Imediato</span>
          <span>☆ 15 Dias de Garantia</span>
          <span>▶ Aulas ao vivo</span>
          <span>✓ Pagamento Seguro</span>
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
          <img className="section-img tall" src="/images/transformacao/transformacao-marcos.webp" alt="Marcos cantando" />
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
            <span>✅ Grupo Exclusivo</span>
            <span>✅ Sala Virtual</span>
            <span>✅ Aulas ao vivo</span>
          </div>
        </div>
      </section>

      <section className="offer-section">
        <div className="container split">
          <div className="offer-price">
            <p>De: <s>R$2397,00</s> Por:</p>
            <small>12x</small>
            <strong>72,09</strong>
            <span>ou R$ 697 à vista</span>
            <a href={checkoutUrl} className="btn">ENTRAR AGORA</a>
          </div>
          <div>
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
        <div className="container split">
          <div>
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
