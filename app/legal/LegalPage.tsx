import Link from 'next/link'

export type LegalSection = {
  title: string
  paragraphs?: string[]
  items?: string[]
}

export default function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string
  title: string
  intro: string
  sections: LegalSection[]
}) {
  return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#09070f 0%,#11101a 100%)', color: '#f8f7fb', padding: '48px 20px 72px' }}>
      <div style={{ width: 'min(920px,100%)', margin: '0 auto' }}>
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 42 }}>
          <Link href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 800, letterSpacing: '-.02em' }}>Foco em Canto</Link>
          <Link href="/contact" style={{ color: '#c5a7ff', textDecoration: 'none', fontWeight: 700 }}>Contato</Link>
        </nav>

        <header style={{ marginBottom: 34 }}>
          <p style={{ margin: 0, color: '#a882ff', fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', fontSize: 12 }}>{eyebrow}</p>
          <h1 style={{ fontSize: 'clamp(2.25rem,6vw,4.5rem)', lineHeight: 1, letterSpacing: '-.055em', margin: '14px 0 18px' }}>{title}</h1>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.72)', fontSize: '1.08rem', lineHeight: 1.75, maxWidth: 760 }}>{intro}</p>
          <p style={{ marginTop: 18, color: 'rgba(255,255,255,.46)', fontSize: 14 }}>Última atualização: 5 de agosto de 2026</p>
        </header>

        <section style={{ display: 'grid', gap: 18 }}>
          {sections.map((section) => (
            <article key={section.title} style={{ background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 22, padding: 'clamp(22px,4vw,34px)' }}>
              <h2 style={{ margin: '0 0 14px', fontSize: '1.35rem', letterSpacing: '-.025em' }}>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph} style={{ color: 'rgba(255,255,255,.76)', lineHeight: 1.75, margin: '10px 0' }}>{paragraph}</p>)}
              {section.items && <ul style={{ color: 'rgba(255,255,255,.76)', lineHeight: 1.8, paddingLeft: 22, marginBottom: 0 }}>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
            </article>
          ))}
        </section>

        <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 34, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,.1)', fontSize: 14 }}>
          <Link href="/privacy" style={{ color: '#c5a7ff' }}>Privacidade</Link>
          <Link href="/terms" style={{ color: '#c5a7ff' }}>Termos</Link>
          <Link href="/data-deletion" style={{ color: '#c5a7ff' }}>Exclusão de dados</Link>
          <Link href="/contact" style={{ color: '#c5a7ff' }}>Contato</Link>
        </footer>
      </div>
    </main>
  )
}
