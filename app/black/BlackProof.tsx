'use client';
import { useEffect, useState } from 'react';
import { blackConfig, blackProofs, globalProofIds, type BlackProof as Proof } from './black-config';
import v from './product-experience.module.css';

export function ProofSignal({ proof, enabled = true }: { proof: Proof; enabled?: boolean }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => { if (!enabled) setPlaying(false); }, [enabled]);
  return <figure className={v.signal}>
    <figcaption><span>{blackConfig.products.find(p => p.id === proof.product)?.name}</span><h4>{proof.label}</h4>{proof.person && <p>{proof.person}</p>}</figcaption>
    {proof.type === 'image' ? <a tabIndex={enabled ? 0 : -1} href={proof.media} target="_blank" rel="noopener noreferrer" aria-label={`Abrir depoimento original${proof.person ? ` de ${proof.person}` : ''} em nova aba`}><img src={proof.media} width={proof.width} height={proof.height} alt={`Depoimento original publicado — ${proof.person || proof.label}`} loading="lazy" decoding="async"/><span>VER RELATO ORIGINAL ↗</span></a> : <div className={v.video}>{playing && enabled ? <iframe src={`https://www.youtube-nocookie.com/embed/${proof.media}?playsinline=1&rel=0`} title={proof.videoTitle || proof.label} allow="fullscreen; picture-in-picture" allowFullScreen/> : <button disabled={!enabled} type="button" onClick={() => setPlaying(true)} aria-label={`Assistir: ${proof.videoTitle || proof.label}`}><img className={v.videoPoster} src={`https://i.ytimg.com/vi/${proof.media}/hqdefault.jpg`} width="480" height="360" alt="" loading="lazy" decoding="async"/><span aria-hidden="true">▷</span><strong>OUVIR ESSA HISTÓRIA</strong><small>DEPOIMENTO EM VÍDEO</small></button>}</div>}
  </figure>;
}
export default function BlackProof() {
  return <section className={v.proofSection} aria-labelledby="proof-heading"><div className={v.proofIntro}><p className={v.label}>04 / VOZES DO ECOSSISTEMA</p><h2 id="proof-heading">Do outro lado,<br/><em>pessoas reais.</em></h2><p>Uma mentoria para desenvolver a voz. Um curso para construir outras vozes. Experiências diferentes, conectadas pela prática de pessoas reais.</p><span>RELATOS PUBLICADOS / EXPERIÊNCIAS INDIVIDUAIS</span></div><div className={v.proofStream}>{blackProofs.filter(proof => globalProofIds.includes(proof.id)).map(proof => <ProofSignal key={proof.id} proof={proof}/>)}</div><p className={v.proofNote}>Cada relato pertence ao produto indicado e retrata uma experiência individual. Não representa garantia de resultado nem depoimento sobre a oferta Black.</p></section>;
}
