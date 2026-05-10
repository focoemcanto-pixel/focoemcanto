const links = [
  {
    title: 'Curso de Divisão Vocal',
    subtitle: 'Aprenda a dividir vozes no ministério de louvor',
    href: 'https://focoemcanto.com/focoemharmonia/',
    icon: '♪',
    featured: true,
  },
  {
    title: 'Mentoria Foco em Canto',
    subtitle: 'Técnica vocal, confiança e potência mesmo do zero',
    href: 'https://focoemcanto.com',
    icon: '🎙️',
  },
  {
    title: 'Kits Vocais — Harmomus',
    subtitle: 'Guias de vozes para ensaio e estudo vocal',
    href: 'https://harmomus.com',
    icon: '🎧',
  },
  {
    title: 'Aulas Individuais',
    subtitle: 'Acompanhamento personalizado',
    href: 'https://forms.gle/aR3cRBCWWsFPPwdv5',
    icon: '👤',
  },
  {
    title: 'Workshop na sua igreja',
    subtitle: 'Treinamento para ministérios de louvor',
    href: 'https://wa.link/8delsj',
    icon: '⛪',
  },
  {
    title: 'Música para Casamentos/Eventos',
    subtitle: 'Cerimônias e eventos especiais',
    href: 'https://bandaharmonics.com',
    icon: '🎻',
  },
  {
    title: 'YouTube',
    subtitle: 'Vídeos e conteúdos gratuitos',
    href: 'https://www.youtube.com/@marcoscruzsan',
    icon: '▶',
  },
  {
    title: 'Spotify',
    subtitle: 'Músicas e projetos autorais',
    href: 'https://open.spotify.com/intl-pt/artist/4g2424f5ZilupXY9azFRl1',
    icon: '♫',
  },
  {
    title: 'TikTok',
    subtitle: 'Conteúdos rápidos sobre canto',
    href: 'https://www.tiktok.com/@marcos_cruzsan',
    icon: '♬',
  },
]

export default function LinksPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, #3b1d78 0%, #12091f 45%, #07040d 100%)',
        padding: '32px 16px',
        display: 'flex',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at top right, rgba(168,85,247,.25), transparent 35%), radial-gradient(circle at bottom left, rgba(34,211,238,.18), transparent 30%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img
            src="https://focoemcanto.com/wp-content/uploads/2025/03/bio.webp"
            alt="Marcos Cruz"
            style={{
              width: '132px',
              height: '132px',
              borderRadius: '999px',
              objectFit: 'cover',
              display: 'block',
              margin: '0 auto 20px',
              border: '4px solid rgba(255,255,255,.92)',
              boxShadow: '0 0 45px rgba(168,85,247,.45)',
            }}
          />

          <div
            style={{
              display: 'inline-flex',
              padding: '.55rem 1rem',
              borderRadius: '999px',
              background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.12)',
              color: '#d8b4fe',
              fontWeight: 700,
              fontSize: '.82rem',
              marginBottom: '1rem',
              backdropFilter: 'blur(12px)',
            }}
          >
            Marcos Cruz • Foco em Canto
          </div>

          <h1
            style={{
              color: '#fff',
              fontSize: 'clamp(2rem, 5vw, 2.8rem)',
              lineHeight: '1.05',
              fontWeight: 900,
              marginBottom: '1rem',
              letterSpacing: '-.04em',
            }}
          >
            Acesse meus cursos, aulas e projetos
          </h1>

          <p
            style={{
              color: '#ddd6fe',
              lineHeight: 1.7,
              fontSize: '1rem',
              maxWidth: '440px',
              margin: '0 auto',
            }}
          >
            Escolha abaixo o melhor caminho para desenvolver sua voz, estudar divisão vocal ou contratar música para seu evento.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {links.map((link) => (
            <a
              key={link.title}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '18px',
                borderRadius: '22px',
                textDecoration: 'none',
                color: '#fff',
                background: link.featured
                  ? 'linear-gradient(135deg, #8b5cf6, #ec4899)'
                  : 'rgba(255,255,255,.08)',
                border: link.featured
                  ? 'none'
                  : '1px solid rgba(255,255,255,.12)',
                backdropFilter: 'blur(14px)',
                boxShadow: link.featured
                  ? '0 18px 45px rgba(236,72,153,.28)'
                  : '0 10px 30px rgba(0,0,0,.22)',
                transition: 'all .25s ease',
              }}
            >
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '16px',
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(255,255,255,.14)',
                  fontSize: '1.4rem',
                  flexShrink: 0,
                }}
              >
                {link.icon}
              </div>

              <div style={{ flex: 1 }}>
                <strong
                  style={{
                    display: 'block',
                    fontSize: '1.05rem',
                    marginBottom: '.2rem',
                    fontWeight: 800,
                  }}
                >
                  {link.title}
                </strong>
                <small
                  style={{
                    color: 'rgba(255,255,255,.72)',
                    fontSize: '.84rem',
                    lineHeight: 1.4,
                  }}
                >
                  {link.subtitle}
                </small>
              </div>

              <div
                style={{
                  fontSize: '1.35rem',
                  opacity: 0.85,
                }}
              >
                →
              </div>
            </a>
          ))}
        </div>

        <footer
          style={{
            textAlign: 'center',
            marginTop: '32px',
            color: '#c4b5fd',
            fontSize: '.82rem',
            opacity: .9,
          }}
        >
          Marcos Cruz • Sua voz. Sua missão. Seu propósito.
        </footer>
      </div>
    </main>
  )
}
