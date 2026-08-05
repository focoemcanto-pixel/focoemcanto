import type { Metadata } from 'next'
import LegalPage from '../legal/LegalPage'

export const metadata: Metadata = {
  title: 'Política de Privacidade | Foco em Canto',
  description: 'Política de Privacidade da Foco em Canto e de seus aplicativos e plataformas digitais.',
}

export default function PrivacyPage() {
  return <LegalPage eyebrow="Centro legal" title="Política de Privacidade" intro="Esta política explica como a Foco em Canto trata dados pessoais em seus sites, plataformas, cursos, aplicativos, páginas de vendas e integrações publicitárias." sections={[
    { title: '1. Quem somos', paragraphs: ['A Foco em Canto oferece educação musical, conteúdos digitais, mentorias, cursos e ferramentas tecnológicas. Para assuntos relacionados à privacidade, o contato é suporte@focoemcanto.com.'] },
    { title: '2. Dados que podemos tratar', items: ['Dados fornecidos pelo usuário, como nome, e-mail, telefone e mensagens de suporte.', 'Dados de conta, matrícula, compra, pagamento e acesso aos produtos.', 'Dados técnicos, como endereço IP, navegador, dispositivo, cookies, páginas visitadas e eventos de navegação.', 'Dados de campanhas e conversões recebidos de plataformas como Meta, Google e provedores de pagamento.', 'Informações autorizadas pelo usuário em integrações e logins de terceiros.'] },
    { title: '3. Como utilizamos os dados', items: ['Entregar cursos, mentorias, aplicativos e suporte.', 'Processar pagamentos, inscrições e solicitações.', 'Autenticar usuários e proteger contas e sistemas.', 'Medir desempenho, atribuição e conversões de campanhas.', 'Personalizar comunicações e ofertas quando permitido.', 'Cumprir obrigações legais, regulatórias e de segurança.'] },
    { title: '4. Cookies, pixels e publicidade', paragraphs: ['Podemos utilizar cookies, Meta Pixel, Conversions API, Google Analytics e tecnologias semelhantes para medir acesso, segurança, desempenho e resultados de campanhas. O usuário pode ajustar as permissões de cookies em seu navegador e, quando disponível, no aviso exibido em nossos sites.'] },
    { title: '5. Compartilhamento', paragraphs: ['Não vendemos dados pessoais. Podemos compartilhar informações apenas com fornecedores necessários à operação, como hospedagem, banco de dados, e-mail, atendimento, pagamento, analytics e publicidade, sempre de acordo com a finalidade do serviço e com medidas de proteção adequadas.'] },
    { title: '6. Base legal, retenção e segurança', paragraphs: ['Tratamos dados com fundamento em consentimento, execução de contrato, cumprimento de obrigação legal, exercício regular de direitos e legítimo interesse, conforme aplicável. Mantemos os dados somente pelo período necessário e adotamos controles técnicos e administrativos para reduzir riscos de acesso indevido, perda ou alteração.'] },
    { title: '7. Direitos do titular', items: ['Confirmação e acesso aos dados.', 'Correção de dados incompletos ou desatualizados.', 'Anonimização, bloqueio ou eliminação quando cabível.', 'Portabilidade, informação sobre compartilhamentos e revogação do consentimento.', 'Oposição ao tratamento e revisão de decisões automatizadas, quando aplicável.'] },
    { title: '8. Solicitações e contato', paragraphs: ['Solicitações relacionadas à LGPD, privacidade ou exclusão de dados podem ser enviadas para suporte@focoemcanto.com. Poderemos solicitar informações adicionais para confirmar a identidade do solicitante.'] },
    { title: '9. Atualizações', paragraphs: ['Esta política poderá ser atualizada para refletir mudanças legais, técnicas ou operacionais. A versão vigente será sempre publicada nesta página.'] },
  ]} />
}
