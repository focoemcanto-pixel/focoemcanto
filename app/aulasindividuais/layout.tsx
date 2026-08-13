import type { Metadata } from 'next'
import './aulas.css'

export const metadata: Metadata = {
  title: 'Aulas Individuais de Canto | Foco em Canto',
  description: 'Solicite uma vaga para aulas individuais de canto com Marcos Cruz, online ou presencial em Salvador.',
}

export default function AulasIndividuaisLayout({ children }: { children: React.ReactNode }) {
  return children
}
