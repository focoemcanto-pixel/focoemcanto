'use client';
import { useState } from 'react';
import { blackConfig, blackProofs, type BlackProof as Proof } from './black-config';
import v from './product-experience.module.css';

export function ProofSignal({ proof }: { proof: Proof }) {
  const [playing, setPlaying] = useState(false);
  return <figure className={v.signal}>
    <figcaption><span>{blackConfig.products.find(p => p.id === proof.product)?.name}</span><h4>{proof.label}</h4>{proof.person && <p>{proof.person}</p>}</figcaption>
    {proof.type === 'image' ? <a href={proof.media} target="_blank" rel="noopener noreferrer" aria-label={`Abrir depoimento original${proof.person ? ` de ${proof.person}` : ''} em nova aba`}><img src={proof.media} width={proof.width} height={proof.height} alt={`Depoimento original publicado — ${proof.person || proof.label}`} loading="lazy" decoding="async"/><span>VER RELATO ORIGINAL ↗</span></a> : <div className={v.video}>{playing ? <iframe src={`https://www.youtube-nocookie.com/embed/${proof.media}?playsinline=1&rel=0`} title={proof.label} allow="fullscreen; picture-in-picture" allowFullScreen/> : <button type="button" onClick={() => setPlaying(true)} aria-label={`Assistir: ${proof.label}`}><span aria-hidden="true">▷</span><strong>OUVIR ESSA HISTÓRIA</strong><small>DEPOIMENTO EM VÍDEO</small></button>}</div>}
  </figure>;
}
export default function BlackProof() {
  return <section className={v.proofSection} aria-labelledby="proof-heading"><div className={v.proofIntro}><p className={v.label}>04 / VOZES DO ECOSSISTEMA</p><h2 id="proof-heading">Do outro lado,<br/><em>pessoas reais.</em></h2><p>Antes de reunir produtos, reunimos experiências. Ouça quem já passou pela Mentoria e pelo Foco em Harmonia.</p><span>RELATOS PUBLICADOS / EXPERIÊNCIAS INDIVIDUAIS</span></div><div className={v.proofStream}>{blackProofs.map(proof => <ProofSignal key={proof.id} proof={proof}/>)}</div><p className={v.proofNote}>Cada relato pertence ao produto indicado e retrata uma experiência individual. Não representa garantia de resultado nem depoimento sobre a oferta Black.</p></section>;
}
