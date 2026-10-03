import type { Metadata } from 'next';
import TradeApp from './TradeApp';
export const metadata: Metadata = {
  title: 'Foco Trade | Entenda antes de operar',
  description:
    'Copiloto educacional: contexto, estrutura e hipóteses explicáveis.',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <TradeApp />;
}
