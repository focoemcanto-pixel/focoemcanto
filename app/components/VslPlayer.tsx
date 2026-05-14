'use client'

import { useRef, useState } from 'react'

type VslPlayerProps = {
  src: string
  poster?: string
  title?: string
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0:00'

  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default function VslPlayer({ src, poster, title = 'Vídeo de apresentação da Mentoria Foco em Canto' }: VslPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  function togglePlay() {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      video.play()
      return
    }

    video.pause()
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
      <div className="vsl-player-topline">
        <span>▶ Assista antes de escolher seu plano</span>
        <strong>Mentoria por dentro</strong>
      </div>

      <div className="vsl-video-frame">
        <video
          ref={videoRef}
          className="vsl-video"
          src={src}
          poster={poster}
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          aria-label={title}
        />

        <button className={`vsl-play-overlay ${isPlaying ? 'is-playing' : ''}`} type="button" onClick={togglePlay} aria-label={isPlaying ? 'Pausar vídeo' : 'Reproduzir vídeo'}>
          <span>{isPlaying ? '❚❚' : '▶'}</span>
        </button>
      </div>

      <div className="vsl-controls">
        <button className="vsl-mini-play" type="button" onClick={togglePlay} aria-label={isPlaying ? 'Pausar vídeo' : 'Reproduzir vídeo'}>
          {isPlaying ? '❚❚' : '▶'}
        </button>

        <div className="vsl-progress-wrap">
          <input
            className="vsl-progress"
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={progress}
            onChange={(event) => handleProgressChange(event.target.value)}
            style={{ '--vsl-progress': `${progress}%` } as React.CSSProperties}
            aria-label="Progresso do vídeo"
          />
          <div className="vsl-time">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
