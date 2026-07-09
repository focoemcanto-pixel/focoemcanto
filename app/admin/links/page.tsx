import Link from 'next/link'
import styles from '../AdminHome.module.css'

const examples = [
  {
    name: 'Reel Afinação — Quarta Vocal',
    source: 'instagram',
    medium: 'reel',
    campaign: 'quarta_vocal',
    content: 'reel_afinacao_01',
    short: 'go.focoemcanto.com/qv-af01',
  },
  {
    name: 'Story Convite — Grupo da Live',
    source: 'instagram',
    medium: 'story',
    campaign: 'quarta_vocal',
    content: 'story_convite_01',
    short: 'go.focoemcanto.com/qv-st01',
  },
  {
    name: 'YouTube — Aula gratuita',
    source: 'youtube',
    medium: 'video',
    campaign: 'aula_gratuita',
    content: 'descricao_video',
    short: 'go.focoemcanto.com/yt-aula01',
  },
]

export default function SmartLinksPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.heroCard}>
          <div className={styles.eyebrow}>🔗 Links Inteligentes</div>
          <h1 className={styles.title}>
            Origem, campanha e criativo <span>sem planilha bagunçada</span>
          </h1>
          <p className={styles.subtitle}>
            Esta será a área para gerar links curtos com UTMs, ID interno da campanha e registro de clique. Por enquanto,
            deixei a estrutura visual e os exemplos prontos para a próxima etapa de tracking.
          </p>
          <div className={styles.actions}>
            <Link className={styles.secondaryButton} href="/admin">
              Voltar ao Foco OS
            </Link>
            <Link className={styles.primaryButton} href="/admin/whatsapp">
              Ir para WhatsApp
            </Link>
          </div>
        </section>

        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Exemplos de links</h2>
            <p className={styles.sectionText}>Depois vamos transformar isso em formulário, banco e redirecionador real.</p>
          </div>
        </div>

        <section className={styles.modules}>
          {examples.map((item) => (
            <article className={styles.moduleCard} key={item.short}>
              <div>
                <div className={styles.moduleIcon}>🔗</div>
                <h3 className={styles.moduleTitle}>{item.name}</h3>
                <p className={styles.moduleText}>
                  source={item.source} · medium={item.medium} · campaign={item.campaign} · content={item.content}
                </p>
              </div>
              <div className={styles.moduleFooter}>
                <span>{item.short}</span>
                <span className={styles.badge}>Modelo</span>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}
