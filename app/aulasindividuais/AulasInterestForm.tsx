'use client'

import { FormEvent, useMemo, useState } from 'react'

const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const periods = ['Manhã', 'Tarde', 'Noite']
const goals = ['Afinação', 'Técnica vocal', 'Segurança para cantar', 'Extensão vocal', 'Respiração', 'Ministério de louvor', 'Performance', 'Outro']

export default function AulasInterestForm() {
  const [availability, setAvailability] = useState<string[]>([])
  const [modality, setModality] = useState('')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const availabilityOptions = useMemo(() => days.flatMap(day => periods.map(period => `${day} - ${period}`)), [])

  function toggleAvailability(value: string) {
    setAvailability(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!availability.length) {
      setError('Selecione pelo menos um dia e turno em que você conseguiria fazer aula.')
      return
    }
    const form = new FormData(event.currentTarget)
    const payload = Object.fromEntries(form.entries()) as Record<string, string>
    payload.availability = JSON.stringify(availability)
    setSending(true)
    try {
      const response = await fetch('/api/aulas-interesse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Não foi possível concluir seu cadastro agora.')
      setSuccess(true)
      window.scrollTo({ top: document.getElementById('solicitar-vaga')?.offsetTop || 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro. Tente novamente.')
    } finally {
      setSending(false)
    }
  }

  if (success) {
    return (
      <div className="ai-form-card ai-success-card">
        <div className="ai-success-icon">✓</div>
        <span className="ai-eyebrow">SOLICITAÇÃO RECEBIDA</span>
        <h3>Pronto! Sua disponibilidade já está na lista.</h3>
        <p>Quando surgir uma vaga compatível com o que você informou, entraremos em contato pelo WhatsApp. Você não precisa preencher novamente.</p>
        <div className="ai-success-detail">🎤 Até lá, continue cuidando e desenvolvendo sua voz.</div>
      </div>
    )
  }

  return (
    <form className="ai-form-card" onSubmit={submit}>
      <div className="ai-form-section-title"><span>01</span><div><strong>Sobre você</strong><small>Informações para contato</small></div></div>
      <div className="ai-fields two">
        <label><span>Seu nome *</span><input name="name" required placeholder="Como podemos te chamar?" /></label>
        <label><span>WhatsApp *</span><input name="whatsapp" required inputMode="tel" placeholder="DDD + número" /></label>
      </div>
      <div className="ai-fields two">
        <label><span>Instagram</span><input name="instagram" placeholder="@seuusuario" /></label>
        <label><span>Como me conheceu?</span><select name="source" defaultValue=""><option value="">Selecione</option><option>Instagram</option><option>YouTube</option><option>TikTok</option><option>Indicação</option><option>Já sou aluno</option><option>Outro</option></select></label>
      </div>

      <div className="ai-form-section-title"><span>02</span><div><strong>Modalidade</strong><small>Qual formato faz sentido para você?</small></div></div>
      <div className="ai-choice-grid three">
        {['Online', 'Presencial', 'Tenho interesse nas duas'].map(item => <label className={`ai-choice ${modality === item ? 'active' : ''}`} key={item}><input type="radio" name="modality" value={item} required onChange={() => setModality(item)} /><b>{item}</b><small>{item === 'Online' ? 'De qualquer lugar' : item === 'Presencial' ? 'Salvador' : 'Mais flexibilidade'}</small></label>)}
      </div>
      {(modality === 'Presencial' || modality === 'Tenho interesse nas duas') && <div className="ai-fields two"><label><span>Bairro / região</span><input name="neighborhood" placeholder="Ex.: Pituba, Imbuí, Lauro de Freitas..." /></label><label><span>Cidade</span><input name="city" defaultValue="Salvador" /></label></div>}

      <div className="ai-form-section-title"><span>03</span><div><strong>Sua disponibilidade</strong><small>Marque todos os períodos que realmente funcionariam</small></div></div>
      <div className="ai-availability-grid">
        {availabilityOptions.map(option => <button type="button" key={option} onClick={() => toggleAvailability(option)} className={availability.includes(option) ? 'selected' : ''}>{availability.includes(option) ? '✓ ' : ''}{option}</button>)}
      </div>
      <label className="ai-checkbox-line"><input type="checkbox" name="flexible" value="sim" /><span>Tenho alguma flexibilidade caso apareça uma vaga em outro horário próximo.</span></label>

      <div className="ai-form-section-title"><span>04</span><div><strong>Seu momento vocal</strong><small>Isso me ajuda a entender melhor seu perfil</small></div></div>
      <div className="ai-fields two">
        <label><span>Seu nível hoje</span><select name="level" defaultValue=""><option value="">Selecione</option><option>Iniciante</option><option>Intermediário</option><option>Avançado</option><option>Não sei avaliar</option></select></label>
        <label><span>Quando pretende começar?</span><select name="startIntent" defaultValue=""><option value="">Selecione</option><option>Imediatamente</option><option>Nos próximos 30 dias</option><option>Nos próximos 2 a 3 meses</option><option>Estou pesquisando por enquanto</option></select></label>
      </div>
      <label><span>Qual é seu principal objetivo?</span><select name="goal" defaultValue=""><option value="">Selecione</option>{goals.map(goal => <option key={goal}>{goal}</option>)}</select></label>
      <label><span>Você já fez aulas de canto?</span><textarea name="experience" rows={3} placeholder="Conte brevemente sua experiência, se houver." /></label>

      <label className="ai-checkbox-line terms"><input type="checkbox" required name="acceptedTerms" value="sim" /><span>Li os valores e as principais regras acima e quero entrar na lista de interesse para uma futura vaga.</span></label>
      {error && <div className="ai-form-error">{error}</div>}
      <button className="ai-submit" disabled={sending}>{sending ? 'Enviando sua solicitação...' : 'Entrar para a lista de interesse'}</button>
      <small className="ai-privacy">Seus dados serão usados apenas para contato relacionado às aulas individuais.</small>
    </form>
  )
}
