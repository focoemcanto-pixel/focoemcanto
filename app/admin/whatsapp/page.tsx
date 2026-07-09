'use client'

import { useMemo, useState } from 'react'
import styles from './AdminWhatsapp.module.css'

type MessageStatus = 'PENDENTE' | 'ENVIADO' | 'ERRO'

type ScheduledMessage = {
  id: string
  day: string
  date: string
  time: string
  type: 'LIVE' | 'GERAL' | 'AQUECIMENTO' | 'TESTE'
  title: string
  message: string
  status: MessageStatus
}

const liveGroups = [
  {
    id: '120363404674461725@g.us',
    name: 'LIVE - FOCO EM CANTO',
  },
  {
    id: '120363428159310476@g.us',
    name: '#2 LIVE - FOCO EM CANTO',
  },
]

const weekDays = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]

function toDateInputValue(date: Date) {
  const clone = new Date(date)
  clone.setMinutes(clone.getMinutes() - clone.getTimezoneOffset())
  return clone.toISOString().slice(0, 10)
}

function getNextWednesday() {
  const today = new Date()
  const target = new Date(today)
  const current = today.getDay()
  const wednesday = 3
  const diff = (wednesday - current + 7) % 7 || 7
  target.setDate(today.getDate() + diff)
  return toDateInputValue(target)
}

function addDays(dateInput: string, days: number) {
  const date = new Date(`${dateInput}T12:00:00`)
  date.setDate(date.getDate() + days)
  return toDateInputValue(date)
}

function getDayName(dateInput: string) {
  const date = new Date(`${dateInput}T12:00:00`)
  return weekDays[date.getDay()]
}

function createWeeklyMessages(theme: string, liveLink: string, replayLink: string, wednesday: string): ScheduledMessage[] {
  const normalizedTheme = theme.trim() || 'Afinação e segurança vocal'
  const normalizedLiveLink = liveLink.trim() || '[LINK DA LIVE]'
  const normalizedReplayLink = replayLink.trim() || '[LINK DO REPLAY]'

  const items = [
    {
      offset: -3,
      time: '19:00',
      title: 'Enquete da próxima aula',
      message: `🎤 Pessoal, passando para preparar nossa semana!\n\nQual desses temas você mais gostaria de ver na próxima Quarta Vocal?\n\n1️⃣ Afinação\n2️⃣ Extensão vocal\n3️⃣ Segunda voz\n4️⃣ Respiração\n5️⃣ Segurança para cantar\n\nResponde aqui com o número do tema que você mais precisa agora 👇`,
    },
    {
      offset: -2,
      time: '19:00',
      title: 'Plantão vocal — grupo aberto',
      message: `💬 Grupo aberto até 21h!\n\nHoje é nosso Plantão Vocal. Mande sua principal dúvida sobre canto, técnica vocal, afinação, extensão ou segunda voz.\n\nVou acompanhar as mensagens e separar algumas dúvidas para nossa aula de quarta. 🎤`,
    },
    {
      offset: -1,
      time: '20:00',
      title: 'Esquenta da aula',
      message: `🔥 Amanhã temos Quarta Vocal às 20h!\n\nO tema da aula será: ${normalizedTheme}\n\nSe você sente que precisa evoluir com mais direção, já separa esse horário.\n\nVai ser uma aula prática, direta e com aplicação para sua voz. 🎙️`,
    },
    {
      offset: 0,
      time: '10:00',
      title: 'Lembrete da aula',
      message: `🚨 É hoje!\n\nNossa Quarta Vocal acontece hoje às 20h.\n\nTema: ${normalizedTheme}\n\nJá coloca o alarme para não esquecer. Essa aula pode clarear muita coisa sobre sua evolução vocal. 🎤🔥`,
    },
    {
      offset: 0,
      time: '19:30',
      title: 'Pré-live — grupo aberto',
      message: `🎙️ Grupo aberto!\n\nDaqui a pouco começamos nossa Quarta Vocal, às 20h.\n\nEntra no clima, separa seu fone, água e já manda aqui:\nqual sua maior dificuldade com o tema de hoje?`,
    },
    {
      offset: 0,
      time: '20:00',
      title: 'Link da aula ao vivo',
      message: `🔴 COMEÇAMOS AGORA!\n\nA Quarta Vocal já está ao vivo.\n\n👉 Acesse aqui: ${normalizedLiveLink}\n\nEntra agora para acompanhar a aula desde o início. 🎤`,
    },
    {
      offset: 1,
      time: '10:00',
      title: 'Replay disponível',
      message: `📚 Replay disponível!\n\nQuem não conseguiu assistir ontem, ou quer rever com calma, pode acessar aqui:\n\n👉 ${normalizedReplayLink}\n\nMinha sugestão: assista anotando os pontos que você precisa aplicar ainda essa semana.`,
    },
    {
      offset: 2,
      time: '19:00',
      title: 'Desafio da semana',
      message: `🎯 Desafio da semana!\n\nCom base na aula de quarta, grave um áudio ou vídeo curto aplicando o que foi ensinado.\n\nNão precisa estar perfeito. O importante é praticar.\n\nQuem quiser, pode mandar aqui no grupo até 21h. 🎤`,
    },
  ]

  return items.map((item, index) => {
    const date = addDays(wednesday, item.offset)

    return {
      id: `${date}-${item.time}-${index}`,
      day: getDayName(date),
      date,
      time: item.time,
      type: 'LIVE',
      title: item.title,
      message: item.message,
      status: 'PENDENTE',
    }
  })
}

export default function AdminWhatsappPage() {
  const [theme, setTheme] = useState('Afinação e segurança vocal')
  const [liveLink, setLiveLink] = useState('')
  const [replayLink, setReplayLink] = useState('')
  const [wednesday, setWednesday] = useState(getNextWednesday)
  const [messages, setMessages] = useState<ScheduledMessage[]>(() =>
    createWeeklyMessages('Afinação e segurança vocal', '', '', getNextWednesday()),
  )
  const [selectedFilter, setSelectedFilter] = useState<'TODAS' | MessageStatus>('TODAS')

  const stats = useMemo(() => {
    const pending = messages.filter((message) => message.status === 'PENDENTE').length
    const sent = messages.filter((message) => message.status === 'ENVIADO').length
    const error = messages.filter((message) => message.status === 'ERRO').length

    return {
      total: messages.length,
      pending,
      sent,
      error,
    }
  }, [messages])

  const filteredMessages = useMemo(() => {
    if (selectedFilter === 'TODAS') return messages
    return messages.filter((message) => message.status === selectedFilter)
  }, [messages, selectedFilter])

  function generateWeek() {
    setMessages(createWeeklyMessages(theme, liveLink, replayLink, wednesday))
  }

  function updateStatus(id: string, status: MessageStatus) {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, status } : message)),
    )
  }

  function duplicateMessage(id: string) {
    const message = messages.find((item) => item.id === id)
    if (!message) return

    setMessages((current) => [
      ...current,
      {
        ...message,
        id: `${message.id}-copy-${Date.now()}`,
        title: `${message.title} — cópia`,
        status: 'PENDENTE',
      },
    ])
  }

  function removeMessage(id: string) {
    setMessages((current) => current.filter((message) => message.id !== id))
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>🎙️ Admin Foco em Canto</div>
            <h1 className={styles.title}>
              Agenda de <span>Lives</span> WhatsApp
            </h1>
            <p className={styles.subtitle}>
              Gere, revise e organize os disparos da Quarta Vocal em poucos cliques. Este MVP já traz os grupos oficiais,
              mensagens-base e uma esteira semanal pronta para virar automação real com Wasender.
            </p>
          </div>

          <div className={styles.headerActions}>
            <button className={styles.secondaryButton} onClick={() => setMessages([])}>
              Limpar agenda
            </button>
            <button className={styles.primaryButton} onClick={generateWeek}>
              Gerar semana
            </button>
          </div>
        </header>

        <section className={styles.statsGrid} aria-label="Resumo dos disparos">
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Mensagens</span>
            <strong className={styles.statValue}>{stats.total}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Pendentes</span>
            <strong className={styles.statValue}>{stats.pending}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Enviadas</span>
            <strong className={styles.statValue}>{stats.sent}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Erros</span>
            <strong className={styles.statValue}>{stats.error}</strong>
          </div>
        </section>

        <div className={styles.layout}>
          <aside className={`${styles.panel} ${styles.panelSticky}`}>
            <h2 className={styles.panelTitle}>Gerar agenda da semana</h2>
            <p className={styles.panelDescription}>
              Informe o tema central da próxima Quarta Vocal. Os textos são montados automaticamente com a programação
              que você já definiu para a comunidade.
            </p>

            <label className={styles.fieldGroup}>
              <span className={styles.label}>Tema da semana</span>
              <input className={styles.input} value={theme} onChange={(event) => setTheme(event.target.value)} />
            </label>

            <label className={styles.fieldGroup}>
              <span className={styles.label}>Data da quarta-feira</span>
              <input className={styles.input} type="date" value={wednesday} onChange={(event) => setWednesday(event.target.value)} />
            </label>

            <label className={styles.fieldGroup}>
              <span className={styles.label}>Link da live</span>
              <input
                className={styles.input}
                placeholder="https://..."
                value={liveLink}
                onChange={(event) => setLiveLink(event.target.value)}
              />
            </label>

            <label className={styles.fieldGroup}>
              <span className={styles.label}>Link do replay</span>
              <input
                className={styles.input}
                placeholder="https://..."
                value={replayLink}
                onChange={(event) => setReplayLink(event.target.value)}
              />
            </label>

            <button className={styles.primaryButton} onClick={generateWeek} style={{ width: '100%' }}>
              Gerar disparos
            </button>

            <div className={styles.quickGrid}>
              {(['TODAS', 'PENDENTE', 'ENVIADO', 'ERRO'] as const).map((filter) => (
                <button
                  key={filter}
                  className={`${styles.quickButton} ${selectedFilter === filter ? styles.quickButtonActive : ''}`}
                  onClick={() => setSelectedFilter(filter)}
                >
                  {filter === 'TODAS' ? 'Todos' : filter.toLowerCase()}
                </button>
              ))}
            </div>

            <h3 className={styles.panelTitle}>Grupos conectados</h3>
            <div className={styles.groupList}>
              {liveGroups.map((group) => (
                <div className={styles.groupItem} key={group.id}>
                  <div>
                    <div className={styles.groupName}>{group.name}</div>
                    <div className={styles.groupId}>{group.id}</div>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeLive}`}>LIVE</span>
                </div>
              ))}
            </div>
          </aside>

          <section className={styles.panel}>
            <div className={styles.toolbar}>
              <div>
                <h2 className={styles.panelTitle}>Disparos programados</h2>
                <p className={styles.panelDescription}>
                  Revise os textos antes de integrar o envio real. A próxima etapa é persistir esta agenda no banco e
                  conectar o cron.
                </p>
              </div>
              <button className={styles.secondaryButton} onClick={generateWeek}>
                Recriar agenda
              </button>
            </div>

            <div className={styles.messageList}>
              {filteredMessages.length === 0 ? (
                <div className={styles.emptyState}>Nenhuma mensagem nesta visualização.</div>
              ) : (
                filteredMessages.map((message) => {
                  const badgeClass =
                    message.status === 'ENVIADO'
                      ? styles.badgeSent
                      : message.status === 'ERRO'
                        ? styles.badgeError
                        : styles.badgePending

                  return (
                    <article className={styles.messageCard} key={message.id}>
                      <div className={styles.messageTop}>
                        <div>
                          <div className={styles.messageDay}>
                            {message.day} — {message.title}
                          </div>
                          <div className={styles.messageTime}>
                            {message.date} às {message.time} · {liveGroups.length} grupos
                          </div>
                        </div>
                        <span className={`${styles.badge} ${badgeClass}`}>{message.status}</span>
                      </div>

                      <p className={styles.messageText}>{message.message}</p>

                      <div className={styles.cardActions}>
                        <button className={styles.ghostButton} onClick={() => navigator.clipboard?.writeText(message.message)}>
                          Copiar texto
                        </button>
                        <button className={styles.ghostButton} onClick={() => duplicateMessage(message.id)}>
                          Duplicar
                        </button>
                        <button className={styles.ghostButton} onClick={() => updateStatus(message.id, 'ENVIADO')}>
                          Marcar enviado
                        </button>
                        <button className={styles.ghostButton} onClick={() => updateStatus(message.id, 'ERRO')}>
                          Marcar erro
                        </button>
                        <button className={styles.dangerButton} onClick={() => removeMessage(message.id)}>
                          Excluir
                        </button>
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
