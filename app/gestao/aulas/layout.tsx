import type { Metadata } from 'next'
import './gestao-aulas.css'
import UnifiedAulasManagerV3 from './UnifiedAulasManagerV3'

export const metadata: Metadata = {
  title: 'Gestão de Aulas | Foco em Canto',
  robots: { index: false, follow: false },
}

export default function GestaoAulasLayout() {
  return <UnifiedAulasManagerV3 />
}
