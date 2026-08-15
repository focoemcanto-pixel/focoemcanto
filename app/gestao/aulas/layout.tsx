import type { Metadata } from 'next'
import './gestao-aulas.css'

export const metadata: Metadata = {
  title: 'Gestão de Aulas | Foco em Canto',
  robots: { index: false, follow: false },
}

export default function GestaoAulasLayout({ children }: { children: React.ReactNode }) {
  return children
}
