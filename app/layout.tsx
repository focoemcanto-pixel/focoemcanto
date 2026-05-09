import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'Foco em Canto | Mentoria Vocal',
  description: 'Libere o verdadeiro potencial da sua voz e aprenda a cantar com confiança e potência mesmo do zero.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}

        <Script id="meta-pixel" strategy="afterInteractive">
          {`fbq && fbq('track', 'PageView');`}
        </Script>

        <Script id="kiwify-utm" strategy="afterInteractive">
          {`
            (() => {
              const prefix = ['https://pay.kiwify.com.br']

              const getParams = () => {
                let t = ''
                const e = window.top.location.href
                const r = new URL(e)

                const a = r.searchParams.get('utm_source')
                const n = r.searchParams.get('utm_medium')
                const o = r.searchParams.get('utm_campaign')
                const m = r.searchParams.get('utm_term')
                const c = r.searchParams.get('utm_content')

                if (e.includes('?')) {
                  t = '&sck=' + [a, n, o, m, c].join('|')
                }

                return t
              }

              const params = new URLSearchParams(window.location.search)

              if (!params.toString()) return

              document.querySelectorAll('a').forEach((link) => {
                prefix.forEach((item) => {
                  if (link.href.includes(item)) {
                    if (!link.href.includes('?')) {
                      link.href += '?' + params.toString() + getParams()
                    } else {
                      link.href += '&' + params.toString() + getParams()
                    }
                  }
                })
              })
            })()
          `}
        </Script>
      </body>
    </html>
  )
}
