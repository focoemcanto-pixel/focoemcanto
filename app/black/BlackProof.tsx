'use client';
import { useEffect, useState } from 'react';
import { blackConfig, type BlackProof as Proof } from './black-config';
import v from './product-experience.module.css';
import VideoStories from './VideoStories';

export function ProofSignal({ proof, enabled = true }: { proof: Proof; enabled?: boolean }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => { if (!enabled) setPlaying(false); }, [enabled]);
  return <figure className={v.signal}>
    <figcaption><span>{blackConfig.products.find(p => p.id === proof.product)?.name}</span><h4>{proof.label}</h4>{proof.person && <p>{proof.person}</p>}</figcaption>
    {proof.type === 'image' ? <a tabIndex={enabled ? 0 : -1} href={proof.media} target="_blank" rel="noopener noreferrer" aria-label={`Abrir depoimento original${proof.person ? ` de ${proof.person}` : ''} em nova aba`}><img src={proof.media} width={proof.width} height={proof.height} alt={`Depoimento original publicado — ${proof.person || proof.label}`} loading="lazy" decoding="async"/><span>VER RELATO ORIGINAL ↗</span></a> : <div className={v.video}>{playing && enabled ? <iframe src={`https://www.youtube-nocookie.com/embed/${proof.media}?playsinline=1&rel=0`} title={proof.videoTitle || proof.label} allow="fullscreen; picture-in-picture" allowFullScreen/> : <button disabled={!enabled} type="button" onClick={() => setPlaying(true)} aria-label={`Assistir: ${proof.videoTitle || proof.label}`}><img className={v.videoPoster} src={proof.poster || `https://i.ytimg.com/vi/${proof.media}/hqdefault.jpg`} width="480" height="360" alt="" loading="lazy" decoding="async"/><span aria-hidden="true">▷</span><strong>OUVIR ESSA HISTÓRIA</strong><small>DEPOIMENTO EM VÍDEO</small></button>}</div>}
  </figure>;
}
export default function BlackProof() {
  return <VideoStories/>;
}
