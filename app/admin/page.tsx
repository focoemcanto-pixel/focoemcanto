import Link from 'next/link'
import styles from './AdminHome.module.css'

const metrics = [
  { label: 'Leads hoje', value: '—' },
  { label: 'Vendas hoje', value: '—' },
  { label: 'Conversão', value: '—' },
  { label: 'Receita', value: '—' },
]

const modules = [
  {
    icon: '🎙️',
    title: 'Lives & WhatsApp',
    text: 'Agenda da Quarta Vocal, disparos, grupos, templates e envio via Wasender.',
    href: '/admin/whatsapp',
    status: 'MVP ativo',
  },
  {
    icon: '🔗',
    title: 'Links Inteligentes',
    text: 'Gerador de links com UTMs e IDs internos para medir origem, campanha e criativo.',
    href: '/admin/links',
    status: 'Próximo',
  },
  {
    icon: '📊',
    title: 'Análise de Funis',
    text: 'Compare caminhos de conversão e descubra onde cada estratégia ganha ou perde força.',
    href: '/admin/funis',
    status: 'Planejado',
  },
  {
    icon: '👥',
    title: 'CRM de Leads',
    text: 'Histórico de origem, produtos comprados, tags e jornada de cada lead/aluno.',
    href: '/admin/crm',
    status: 'Planejado',
  },
  {
    icon: '📚',
    title: 'Produtos & Alunos',
    text: 'Mentoria, Harmonia, Melismas, Hub e próximos produtos organizados em um só lugar.',
    href: '/admin/produtos',
    status: 'Planejado',
  },
  {
    icon: '🤖',
    title: 'Assistente IA',
    text: 'Comandos em linguagem natural para criar campanhas, semanas de conteúdo e relatórios.',
    href: '/admin/ia',
    status: 'Visão',
  },
]

const funnelSteps = [
  { label: 'Alcance', value: '—' },
  { label: 'Cliques', value: '—' },
  { label: 'Leads', value: '—' },
  { label: 'Oferta', value: '—' },
  { label: 'Vendas', value: '—' },
]

export default function AdminPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroCard}>
            <div className={styles.eyebrow}>Foco OS · Centro de comando</div>
            <h1 className={styles.title}>
              O cérebro da operação <span>Foco em Canto</span>
            </h1>
            <p className={styles.subtitle}>
              Um painel para centralizar lives, WhatsApp, campanhas, links, funis, produtos, alunos e decisões de crescimento.
              Começamos pelo módulo de automação das lives e evoluímos para tracking e CRM.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primaryButton} href="/admin/whatsapp">
                Abrir agenda de lives
              </Link>
              <Link className={styles.secondaryButton} href="/admin/links">
                Planejar links inteligentes
              </Link>
            </div>
          </div>

          <aside className={styles.sideCard}>
            <div>
              <h2 className={styles.sideTitle}>Assistente operacional</h2>
              <p className={styles.sideText}>
                A visão é você conversar com o próprio sistema e transformar estratégia em tarefas prontas para aprovação.
              </p>
            </div>
            <div className={styles.commandBox}>
              <span className={styles.commandLabel}>Exemplo de comando</span>
              <div className={styles.commandText}>
                “Crie a semana da Quarta Vocal sobre afinação e prepare os disparos dos grupos.”
              </div>
            </div>
          </aside>
        </section>

        <section className={styles.metrics} aria-label="Indicadores principais">
          {metrics.map((metric) => (
            <div className={styles.metricCard} key={metric.label}>
              <span className={styles.metricLabel}>{metric.label}</span>
              <strong className={styles.metricValue}>{metric.value}</strong>
            </div>
          ))}
        </section>

        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Módulos do Foco OS</h2>
            <p className={styles.sectionText}>A base visual já está criada para ir ligando cada peça da operação.</p>
          </div>
        </div>

        <section className={styles.modules}>
          {modules.map((module) => (
            <Link className={styles.moduleCard} href={module.href} key={module.title}>
              <div>
                <div className={styles.moduleIcon}>{module.icon}</div>
                <h3 className={styles.moduleTitle}>{module.title}</h3>
                <p className={styles.moduleText}>{module.text}</p>
              </div>
              <div className={styles.moduleFooter}>
                <span>Acessar</span>
                <span className={styles.badge}>{module.status}</span>
              </div>
            </Link>
          ))}
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeader} style={{ marginTop: 0 }}>
            <div>
              <h2 className={styles.sectionTitle}>Visão de funil</h2>
              <p className={styles.sectionText}>
                Quando o tracking entrar, este bloco passa a mostrar a performance por origem, campanha, criativo e produto.
              </p>
            </div>
          </div>
          <div className={styles.funnelGrid}>
            {funnelSteps.map((step) => (
              <div className={styles.funnelStep} key={step.label}>
                <span>{step.label}</span>
                <strong>{step.value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
