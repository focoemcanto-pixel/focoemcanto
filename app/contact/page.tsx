import type { Metadata } from 'next'
import LegalPage from '../legal/LegalPage'

export const metadata: Metadata = {
  title: 'Contato | Foco em Canto',
  description: 'Canais oficiais de contato da Foco em Canto.',
}

export default function ContactPage() {
  return <LegalPage eyebrow="Atendimento" title="Fale com a Foco em Canto" intro="Utilize nossos canais oficiais para suporte, privacidade, dados pessoais, produtos e serviços digitais." sections={[
    { title: 'Suporte geral', paragraphs: ['E-mail: suporte@focoemcanto.com', 'Atendimento em dias úteis. O prazo de resposta pode variar conforme a demanda e a natureza da solicitação.'] },
    { title: 'Privacidade e proteção de dados', paragraphs: ['Solicitações relacionadas à LGPD, acesso, correção, oposição ou exclusão de dados também devem ser enviadas para suporte@focoemcanto.com.'] },
    { title: 'Identificação', paragraphs: ['Foco em Canto', 'Site oficial: https://focoemcanto.com', 'Brasil'] },
    { title: 'Segurança', paragraphs: ['Não envie senhas, códigos de autenticação ou dados completos de cartão por e-mail. Para confirmar a identidade, poderemos solicitar apenas informações compatíveis com a solicitação realizada.'] },
  ]} />
}
