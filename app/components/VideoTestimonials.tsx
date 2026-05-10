'use client'

import { useState } from 'react'

type Video = {
  id: string
  title: string
}

export default function VideoTestimonials({ videos }: { videos: Video[] }) {
  const [activeVideo, setActiveVideo] = useState<Video | null>(null)

  return (
    <>
      <div className="video-grid">
        {videos.map((video) => (
          <button
            key={video.id}
            type="button"
            className="video-thumb"
            onClick={() => setActiveVideo(video)}
            aria-label={`Assistir ${video.title}`}
          >
            <img
              src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
              alt={video.title}
              width="480"
              height="360"
              loading="lazy"
              decoding="async"
            />
            <span className="video-play" aria-hidden="true">▶</span>
          </button>
        ))}
      </div>

      {activeVideo && (
        <div className="video-modal" role="dialog" aria-modal="true" aria-label={activeVideo.title} onClick={() => setActiveVideo(null)}>
          <div className="video-modal-card" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="video-close" onClick={() => setActiveVideo(null)} aria-label="Fechar vídeo">×</button>
            <iframe
              src={`https://www.youtube.com/embed/${activeVideo.id}?autoplay=1&rel=0`}
              title={activeVideo.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </>
  )
}
