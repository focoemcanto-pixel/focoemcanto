import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Foco em Canto | Mentoria Vocal',
  description: 'Libere o verdadeiro potencial da sua voz e aprenda a cantar com confiança e potência mesmo do zero.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
