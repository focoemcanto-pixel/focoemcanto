import type { Metadata } from 'next'
import Formulario from './Formulario'
import './style.css'

export const metadata: Metadata = {
  title: 'Mande Sua Divisão | Foco em Canto',
  description: 'Envie uma divisão vocal real para ser analisada por Marcos Cruz.',
}

export default function Page(){return <main className="msd-page">
  <header className="msd-header"><a href="/"><b>FOCO</b> EM CANTO</a><span>SELEÇÃO PILOTO</span></header>
  <section className="msd-hero">
    <div><i>NOVO QUADRO COM MARCOS CRUZ</i><h1>Sua divisão vocal pode virar uma <strong>análise completa.</strong></h1><p>Envie um trecho real do seu ministério, dupla ou tentativa de segunda voz. Vou selecionar casos para mostrar o que está funcionando, onde as vozes se perdem e como melhorar.</p><nav><span><b>01</b> Você envia</span><span><b>02</b> Eu analiso</span><span><b>03</b> Todos aprendem</span></nav></div>
    <aside><em>♫</em><h2>O material ideal</h2><ul><li>Trecho de 30 segundos a 2 minutos</li><li>Duas ou mais vozes audíveis</li><li>Ensaio, culto, dupla ou gravação caseira</li><li>Uma dúvida clara sobre a divisão</li></ul><small>Evite playback oficial. Prefira voz a cappella ou instrumento gravado por vocês.</small></aside>
  </section>
  <section className="msd-form-area"><div className="msd-title"><i>ENVIE SEU CASO</i><h2>Conte o que aconteceu com essas vozes.</h2><p>O envio é uma candidatura. A seleção e a publicação não são garantidas.</p></div><Formulario/></section>
  <section className="msd-trust"><article><b>01</b><h3>Você escolhe como aparecer</h3><p>Rosto visível, imagem desfocada ou somente áudio.</p></article><article><b>02</b><h3>Seu arquivo fica privado</h3><p>Ele só poderá aparecer se for selecionado, dentro dos limites autorizados.</p></article><article><b>03</b><h3>A análise é educativa</h3><p>O objetivo é desenvolver as vozes no louvor, nunca constranger.</p></article></section>
  <footer className="msd-footer"><b>Foco em Canto</b><span>Divisões vocais reais, analisadas com respeito.</span></footer>
</main>}
