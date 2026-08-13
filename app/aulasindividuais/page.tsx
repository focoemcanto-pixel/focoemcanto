import AulasInterestForm from './AulasInterestForm'

const rules = [
  'Uma aula individual por semana, em dia e horário fixos.',
  'Pagamento mensal em data combinada no início do acompanhamento.',
  'Faltas devem ser avisadas com pelo menos 24 horas de antecedência.',
  'Reposições são combinadas conforme disponibilidade na mesma semana ou em uma 5ª semana do mês.',
  'Em feriados não há aula regular.',
]

export default function AulasIndividuaisPage() {
  return (
    <main className="ai-page">
      <section className="ai-hero">
        <div className="ai-shell ai-hero-grid">
          <div className="ai-hero-copy">
            <div className="ai-kicker">AULAS INDIVIDUAIS • MARCOS CRUZ</div>
            <h1>Uma aula feita para <span>a sua voz</span>, no seu ritmo e nas suas necessidades.</h1>
            <p className="ai-lead">Acompanhamento vocal individual para quem quer desenvolver técnica, afinação, segurança e controle com uma orientação realmente personalizada.</p>
            <div className="ai-hero-actions">
              <a href="#solicitar-vaga" className="ai-primary">Solicitar uma vaga</a>
              <a href="#como-funciona" className="ai-secondary">Entender como funciona</a>
            </div>
            <div className="ai-proof-row">
              <div><strong>1:1</strong><span>Acompanhamento individual</span></div>
              <div><strong>Semanal</strong><span>Dia e horário fixos</span></div>
              <div><strong>Online + Presencial</strong><span>Escolha sua modalidade</span></div>
            </div>
          </div>
          <div className="ai-hero-visual">
            <div className="ai-glow" />
            <div className="ai-photo-card">
              <img src="/images/mentor/mentor-marcos.webp" alt="Marcos Cruz, professor de canto" />
              <div className="ai-photo-caption"><span>Professor de canto</span><strong>Marcos Cruz</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="ai-section ai-dark-soft">
        <div className="ai-shell">
          <div className="ai-section-head">
            <span>COMO FUNCIONA</span>
            <h2>Você não entra em uma aula genérica. O trabalho parte do que sua voz precisa.</h2>
          </div>
          <div className="ai-feature-grid">
            <article><b>01</b><h3>Diagnóstico e direção</h3><p>Identificamos seus principais pontos de atenção e definimos prioridades para o seu desenvolvimento.</p></article>
            <article><b>02</b><h3>Treino durante a semana</h3><p>Você recebe exercícios direcionados para praticar entre uma aula e outra.</p></article>
            <article><b>03</b><h3>Ajuste contínuo</h3><p>Na aula seguinte, revisamos o que evoluiu, corrigimos o necessário e avançamos para o próximo passo.</p></article>
          </div>
        </div>
      </section>

      <section className="ai-section ai-plans-section">
        <div className="ai-shell">
          <div className="ai-section-head light">
            <span>MODALIDADES</span>
            <h2>Escolha a experiência que melhor encaixa na sua rotina.</h2>
          </div>
          <div className="ai-plan-grid">
            <article className="ai-plan-card">
              <div className="ai-plan-icon">◌</div>
              <span className="ai-plan-label">ONLINE</span>
              <h3>Aula individual por videochamada</h3>
              <p>Ideal para quem mora fora de Salvador ou prefere a praticidade de estudar de casa.</p>
              <div className="ai-price"><small>mensalidade</small><strong>R$ 500</strong><span>/mês</span></div>
              <ul><li>1 aula por semana</li><li>Horário fixo</li><li>Acompanhamento personalizado</li><li>Exercícios para prática semanal</li></ul>
            </article>
            <article className="ai-plan-card featured">
              <div className="ai-plan-badge">PRESENCIAL • SALVADOR</div>
              <div className="ai-plan-icon">⌂</div>
              <span className="ai-plan-label">PRESENCIAL</span>
              <h3>Acompanhamento presencial individual</h3>
              <p>Para quem prefere o contato presencial e está em Salvador ou região próxima.</p>
              <div className="ai-price"><small>mensalidade</small><strong>R$ 600</strong><span>/mês</span></div>
              <ul><li>1 aula por semana</li><li>Horário fixo</li><li>Acompanhamento personalizado</li><li>Exercícios para prática semanal</li></ul>
            </article>
          </div>
          <p className="ai-note">As vagas são limitadas porque cada aluno ocupa um horário fixo na agenda. Caso não exista uma vaga compatível agora, sua solicitação fica registrada para contato assim que um horário adequado surgir.</p>
        </div>
      </section>

      <section className="ai-section ai-rules-section">
        <div className="ai-shell ai-rules-grid">
          <div>
            <span className="ai-eyebrow">ANTES DE SOLICITAR</span>
            <h2>Transparência desde o primeiro contato.</h2>
            <p>Quero que você entre na lista já sabendo exatamente como funciona o acompanhamento. Assim, quando uma vaga surgir, podemos ir direto ao que importa.</p>
          </div>
          <div className="ai-rules-card">
            {rules.map((rule, index) => <div className="ai-rule" key={rule}><span>{String(index + 1).padStart(2, '0')}</span><p>{rule}</p></div>)}
          </div>
        </div>
      </section>

      <section id="solicitar-vaga" className="ai-section ai-form-section">
        <div className="ai-shell ai-form-grid">
          <div className="ai-form-intro">
            <span className="ai-eyebrow">SOLICITE UMA VAGA</span>
            <h2>Me conte quando você pode estudar.</h2>
            <p>Seu cadastro entra na minha lista de interesse. Quando surgir uma vaga compatível com sua modalidade e disponibilidade, eu consigo localizar você rapidamente e entrar em contato pelo WhatsApp.</p>
            <div className="ai-safe-box"><strong>Seu cadastro não gera cobrança.</strong><span>Ele apenas registra seu interesse e disponibilidade para futuras vagas.</span></div>
          </div>
          <AulasInterestForm />
        </div>
      </section>

      <footer className="ai-footer"><div className="ai-shell"><strong>Foco em Canto</strong><span>Aulas Individuais • Marcos Cruz</span></div></footer>
    </main>
  )
}
