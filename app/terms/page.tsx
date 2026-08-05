import type { Metadata } from 'next'
import LegalPage from '../legal/LegalPage'

export const metadata: Metadata = {
  title: 'Termos de Uso | Foco em Canto',
  description: 'Termos de Uso dos sites, cursos, aplicativos e serviços digitais da Foco em Canto.',
}

export default function TermsPage() {
  return <LegalPage eyebrow="Centro legal" title="Termos de Uso" intro="Estes termos regulam o acesso e o uso dos sites, plataformas, cursos, mentorias, aplicativos e demais serviços digitais oferecidos pela Foco em Canto." sections={[
    { title: '1. Aceitação', paragraphs: ['Ao acessar ou utilizar nossos serviços, o usuário declara ter lido e concordado com estes Termos e com a Política de Privacidade. Caso não concorde, não deverá utilizar os serviços.'] },
    { title: '2. Cadastro e segurança', items: ['O usuário deve fornecer informações verdadeiras e atualizadas.', 'Credenciais de acesso são pessoais e não podem ser compartilhadas sem autorização.', 'O usuário é responsável por atividades realizadas em sua conta e deve comunicar qualquer uso não autorizado.'] },
    { title: '3. Produtos, pagamentos e acesso', paragraphs: ['Condições comerciais, prazos de acesso, parcelas, garantias, cancelamentos e reembolsos são informados na página de oferta e no checkout de cada produto. O acesso pode ser suspenso em caso de fraude, chargeback indevido, violação destes Termos ou falta de pagamento.'] },
    { title: '4. Uso permitido', items: ['Utilizar o conteúdo para aprendizado e finalidade pessoal ou profissional legítima.', 'Respeitar direitos autorais, marcas, imagem e demais direitos da Foco em Canto e de terceiros.', 'Não copiar, redistribuir, revender, publicar, transmitir ou compartilhar materiais sem autorização.', 'Não tentar contornar controles de acesso, explorar falhas, interferir nos sistemas ou utilizar automações abusivas.'] },
    { title: '5. Propriedade intelectual', paragraphs: ['Aulas, vídeos, áudios, textos, métodos, marcas, softwares, layouts, materiais e demais conteúdos são protegidos pela legislação aplicável. A compra ou o cadastro concede apenas uma licença limitada, pessoal, não exclusiva e intransferível de uso.'] },
    { title: '6. Serviços de terceiros', paragraphs: ['Algumas funções dependem de plataformas externas, como Meta, Google, meios de pagamento, hospedagem e comunicação. Cada fornecedor possui seus próprios termos e políticas, e indisponibilidades externas podem afetar temporariamente o serviço.'] },
    { title: '7. Resultados e responsabilidade', paragraphs: ['Resultados educacionais, vocais, profissionais e comerciais variam conforme dedicação, contexto e execução do usuário. Não prometemos resultado individual específico. Buscamos manter os serviços disponíveis e seguros, mas não garantimos operação ininterrupta ou livre de falhas.'] },
    { title: '8. Suspensão e encerramento', paragraphs: ['Podemos suspender ou encerrar acessos que violem estes Termos, prejudiquem outros usuários ou coloquem os sistemas em risco, preservados os direitos previstos em lei e nas condições da oferta.'] },
    { title: '9. Alterações', paragraphs: ['Estes Termos poderão ser atualizados para refletir mudanças legais, comerciais ou técnicas. A versão vigente será publicada nesta página.'] },
    { title: '10. Contato e legislação', paragraphs: ['Dúvidas podem ser enviadas para suporte@focoemcanto.com. Estes Termos são regidos pelas leis da República Federativa do Brasil.'] },
  ]} />
}
