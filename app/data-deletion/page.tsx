import type { Metadata } from 'next'
import LegalPage from '../legal/LegalPage'

export const metadata: Metadata = {
  title: 'Exclusão de Dados | Foco em Canto',
  description: 'Instruções para solicitar a exclusão de dados pessoais tratados pela Foco em Canto.',
}

export default function DataDeletionPage() {
  return <LegalPage eyebrow="Privacidade" title="Exclusão de Dados" intro="Você pode solicitar a exclusão de dados pessoais vinculados aos sites, aplicativos, logins e serviços digitais da Foco em Canto." sections={[
    { title: 'Como solicitar', paragraphs: ['Envie um e-mail para suporte@focoemcanto.com com o assunto “Solicitação de exclusão de dados”. Utilize, sempre que possível, o mesmo endereço de e-mail associado à sua conta.'] },
    { title: 'Inclua na solicitação', items: ['Nome completo.', 'E-mail e, quando aplicável, telefone vinculados à conta.', 'Nome do aplicativo, curso ou serviço utilizado.', 'Descrição clara dos dados ou da conta que deseja excluir.'] },
    { title: 'Confirmação de identidade', paragraphs: ['Para proteger o titular, poderemos solicitar informações adicionais estritamente necessárias para confirmar a identidade e evitar exclusões indevidas. Nunca solicitaremos sua senha.'] },
    { title: 'Prazo e conclusão', paragraphs: ['Após a validação, processaremos a solicitação dentro do prazo legal aplicável e enviaremos uma confirmação pelo canal informado. Dados armazenados em cópias de segurança poderão permanecer temporariamente até o ciclo seguro de eliminação.'] },
    { title: 'Dados que podem ser preservados', paragraphs: ['Algumas informações podem ser mantidas quando necessárias para cumprir obrigações legais ou fiscais, prevenir fraudes, exercer direitos em processos ou comprovar transações. Nesses casos, o uso ficará limitado à finalidade que justificou a retenção.'] },
    { title: 'Facebook e Meta', paragraphs: ['Se você utilizou um recurso da Meta relacionado aos nossos aplicativos, esta página constitui o canal oficial de instruções para exclusão. Você também pode remover permissões diretamente nas configurações da sua conta Facebook ou Instagram.'] },
    { title: 'Contato', paragraphs: ['E-mail: suporte@focoemcanto.com'] },
  ]} />
}
