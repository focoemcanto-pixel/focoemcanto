'use client'

import { FormEvent, useMemo, useState } from 'react'

const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const periods = ['Manhã', 'Tarde', 'Noite']
const periodTimes: Record<string, string[]> = {
  'Manhã': ['08:00', '09:00', '10:00', '11:00'],
  'Tarde': ['13:00', '14:00', '15:00', '16:00', '17:00'],
  'Noite': ['18:00', '19:00', '20:00', '21:00'],
}
const goals = ['Afinação', 'Técnica vocal', 'Segurança para cantar', 'Extensão vocal', 'Respiração', 'Ministério de louvor', 'Performance', 'Outro']

type WindowSelection = {
  any: boolean
  times: string[]
}

export default function AulasInterestForm() {
  const [selectedWindows, setSelectedWindows] = useState<string[]>([])
  const [windowDetails, setWindowDetails] = useState<Record<string, WindowSelection>>({})
  const [modality, setModality] = useState('')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const availabilityOptions = useMemo(() => days.flatMap(day => periods.map(period => `${day} - ${period}`)), [])

  function toggleWindow(value: string) {
    setSelectedWindows(current => {
      if (current.includes(value)) {
        setWindowDetails(details => {
          const next = { ...details }
          delete next[value]
          return next
        })
        return current.filter(item => item !== value)
      }
      setWindowDetails(details => ({ ...details, [value]: { any: true, times: [] } }))
      return [...current, value]
    })
  }

  function toggleAny(window: string) {
    setWindowDetails(current => {
      const item = current[window] || { any: false, times: [] }
      return { ...current, [window]: { any: !item.any, times: [] } }
    })
  }

  function toggleTime(window: string, time: string) {
    setWindowDetails(current => {
      const item = current[window] || { any: false, times: [] }
      const times = item.times.includes(time) ? item.times.filter(t => t !== time) : [...item.times, time]
      return { ...current, [window]: { any: false, times } }
    })
  }

  function availabilityPayload() {
    return selectedWindows.flatMap(window => {
      const detail = windowDetails[window]
      if (!detail || detail.any) return [`${window} | Qualquer horário`]
      return detail.times.map(time => `${window} | ${time}`)
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!selectedWindows.length) {
      setError('Selecione pelo menos um dia e turno em que você conseguiria fazer aula.')
      return
    }
    const incomplete = selectedWindows.find(window => {
      const detail = windowDetails[window]
      return detail && !detail.any && !detail.times.length
    })
    if (incomplete) {
      setError(`Escolha “Qualquer horário” ou pelo menos um horário específico em ${incomplete}.`)
      return
    }
    const availability = availabilityPayload()
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

      <div className="ai-form-section-title"><span>03</span><div><strong>Sua disponibilidade</strong><small>Primeiro escolha os turnos. Depois diga se pode em qualquer horário ou selecione horários específicos.</small></div></div>
      <div className="ai-availability-grid">
        {availabilityOptions.map(option => <button type="button" key={option} onClick={() => toggleWindow(option)} className={selectedWindows.includes(option) ? 'selected' : ''}>{selectedWindows.includes(option) ? '✓ ' : ''}{option}</button>)}
      </div>

      {selectedWindows.length > 0 && <div className="ai-time-window-list">
        {selectedWindows.map(window => {
          const period = window.split(' - ')[1]
          const detail = windowDetails[window] || { any: true, times: [] }
          return <section className="ai-time-window" key={window}>
            <div className="ai-time-window-head">
              <div><strong>{window}</strong><small>Quais horários funcionam nesse turno?</small></div>
              <button type="button" className="ai-remove-window" onClick={() => toggleWindow(window)}>Remover</button>
            </div>
            <div className="ai-time-options">
              <button type="button" className={`ai-any-time ${detail.any ? 'selected' : ''}`} onClick={() => toggleAny(window)}>
                <span>{detail.any ? '✓' : '○'}</span><div><b>Qualquer horário</b><small>Tenho disponibilidade em todo esse turno</small></div>
              </button>
              <div className={`ai-specific-times ${detail.any ? 'muted' : ''}`}>
                {periodTimes[period]?.map(time => <button type="button" key={time} onClick={() => toggleTime(window, time)} className={detail.times.includes(time) ? 'selected' : ''}>{detail.times.includes(time) ? '✓ ' : ''}{time}</button>)}
              </div>
              <small className="ai-time-hint">{detail.any ? 'Você será considerado para qualquer vaga nesse turno.' : 'Você pode marcar mais de um horário.'}</small>
            </div>
          </section>
        })}
      </div>}

      <label className="ai-checkbox-line"><input type="checkbox" name="flexible" value="sim" /><span>Tenho alguma flexibilidade caso apareça uma vaga em um horário próximo dos que marquei.</span></label>

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
