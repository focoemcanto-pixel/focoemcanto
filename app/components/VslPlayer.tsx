'use client'

import { useEffect, useRef, useState } from 'react'

type VslPlayerProps = {
  src: string
  poster?: string
  title?: string
}

type IOSVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void
  webkitEnterFullScreen?: () => void
}

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default function VslPlayer({ src, poster, title = 'Vídeo de apresentação da Mentoria Foco em Canto' }: VslPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const preloadStartedRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  function warmVideoBuffer() {
    const video = videoRef.current
    if (!video || preloadStartedRef.current) return

    preloadStartedRef.current = true
    video.preload = 'auto'
    video.load()
  }

  useEffect(() => {
    const browserWindow = window as WindowWithIdleCallback
    let timeoutId: number | undefined
    let idleId: number | undefined

    if (browserWindow.requestIdleCallback) {
      idleId = browserWindow.requestIdleCallback(warmVideoBuffer, { timeout: 1200 })
    } else {
      timeoutId = window.setTimeout(warmVideoBuffer, 900)
    }

    return () => {
      if (typeof idleId === 'number' && browserWindow.cancelIdleCallback) browserWindow.cancelIdleCallback(idleId)
      if (typeof timeoutId === 'number') window.clearTimeout(timeoutId)
    }
  }, [])

  async function playVideo() {
    const video = videoRef.current
    if (!video) return
    try {
      setHasStarted(true)
      warmVideoBuffer()
      await video.play()
    } catch {
      video.controls = true
    }
  }

  async function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      await playVideo()
      return
    }
    video.pause()
  }

  async function handleFullscreen() {
    const video = videoRef.current as IOSVideoElement | null
    const frame = frameRef.current
    if (!video) return

    video.controls = true
    setHasStarted(true)
    warmVideoBuffer()

    try {
      if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen()
        return
      }

      if (video.webkitEnterFullScreen) {
        video.webkitEnterFullScreen()
        return
      }

      if (frame?.requestFullscreen) {
        await frame.requestFullscreen()
        return
      }

      await video.play()
    } catch {
      await video.play().catch(() => undefined)
    }
  }

  function handleProgressChange(value: string) {
    const video = videoRef.current
    if (!video || duration <= 0) return
    const nextTime = (Number(value) / 100) * duration
    video.currentTime = nextTime
    setCurrentTime(nextTime)
  }

  return (
    <div className="vsl-player-shell">
      <div
        className="vsl-player-topline"
        style={{
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          fontWeight: 900,
          textAlign: 'center',
          gap: '.55rem'
        }}
      >
        <span style={{ color: '#fff' }}>▶ Esse vídeo vai guiar</span>
        <strong style={{ color: 'var(--gold)', textShadow: '0 0 18px rgba(244,200,75,.35)' }}>
          sua decisão a partir de agora.
        </strong>
      </div>

      <div className="vsl-video-frame" ref={frameRef}>
        <video
          ref={videoRef}
          className="vsl-video"
          poster={poster}
          playsInline
          preload="auto"
          controls={hasStarted}
          controlsList="nodownload noplaybackrate"
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onCanPlay={warmVideoBuffer}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => { setHasStarted(true); setIsPlaying(true) }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          aria-label={title}
        >
          <source src={src} type="video/mp4" />
        </video>

        {!hasStarted && (
          <button className="vsl-thumb-layer" type="button" onClick={playVideo} aria-label="Reproduzir vídeo">
            <span className="vsl-thumb-kicker">MENTORIA FOCO EM CANTO</span>
            <strong>Conheça a mentoria por dentro</strong>
            <small>Assista antes de escolher seu plano</small>
            <span className="vsl-thumb-play">▶</span>
          </button>
        )}

        {hasStarted && !isPlaying && (
          <button className="vsl-play-overlay" type="button" onClick={togglePlay} aria-label="Reproduzir vídeo">
            <span>▶</span>
          </button>
        )}
      </div>

      <div className="vsl-controls">
        <button className="vsl-mini-play" type="button" onClick={togglePlay} aria-label={isPlaying ? 'Pausar vídeo' : 'Reproduzir vídeo'}>
          {isPlaying ? '❚❚' : '▶'}
        </button>

        <div className="vsl-progress-wrap">
          <input className="vsl-progress" type="range" min="0" max="100" step="0.1" value={progress} onChange={(event) => handleProgressChange(event.target.value)} style={{ '--vsl-progress': `${progress}%` } as React.CSSProperties} aria-label="Progresso do vídeo" />
          <div className="vsl-time"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
        </div>

        <button className="vsl-fullscreen" type="button" onClick={handleFullscreen} aria-label="Abrir vídeo em tela cheia">Tela cheia</button>
      </div>
    </div>
  )
}
