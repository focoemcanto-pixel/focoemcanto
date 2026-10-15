'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type BlackProof } from './black-config';
import { ProofSignal } from './BlackProof';
import c from './proof-stream.module.css';

export default function ProofStream({ proofs, title }: { proofs: BlackProof[]; title: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const targets = useRef<number[]>([]);
  const activeRef = useRef(0);
  const navigate = useCallback((index: number) => {
    const bounded = Math.max(0, Math.min(proofs.length - 1, index));
    track.current?.scrollTo({ left: targets.current[bounded] || 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [proofs.length]);
  useEffect(() => {
    const node = track.current!;
    let frame = 0;
    const measure = () => {
      targets.current = Array.from(node.children).map(child => (child as HTMLElement).offsetLeft - (node.clientWidth - (child as HTMLElement).offsetWidth) / 2);
      node.scrollTo({ left: targets.current[activeRef.current] || 0, behavior: 'instant' as ScrollBehavior });
    };
    const update = () => {
      frame = 0;
      const current = targets.current.reduce((best,target,index) => Math.abs(target-node.scrollLeft) < Math.abs(targets.current[best]-node.scrollLeft) ? index : best, 0);
      if (current !== activeRef.current) { activeRef.current = current; setActive(current); }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    window.addEventListener('resize', measure);
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', measure); node.removeEventListener('scroll', onScroll); };
  }, [proofs.length]);
  if (!proofs.length) return null;
  return <section className={c.voices} aria-label={title} aria-roledescription="carrossel">
    <div className={c.intro}><p>VOZES / EXPERIÊNCIAS PUBLICADAS</p><h3>{title}</h3><span>Uma história em primeiro plano.<br/>Outras vozes para você explorar.</span></div>
    <div className={c.track} ref={track} tabIndex={0} aria-label="Depoimentos: use as setas esquerda e direita para navegar" onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();
        navigate(event.key === 'Home' ? 0 : event.key === 'End' ? proofs.length - 1 : active + (event.key === 'ArrowRight' ? 1 : -1));
      }
    }}>
      {proofs.map((proof,index) => <div key={proof.id} className={c.voice} data-active={index === active} role="group" aria-roledescription="depoimento" aria-label={`${index+1} de ${proofs.length}`} aria-hidden={index !== active} ref={node => { node?.toggleAttribute('inert', index !== active); }} style={{ '--voice-distance': Math.min(2,Math.abs(index-active)) } as React.CSSProperties}>
        {Math.abs(index-active) <= 1 ? <ProofSignal proof={proof} enabled={index === active}/> : <div className={c.dormant}><span>{proof.type === 'video' ? 'VÍDEO' : 'RELATO ORIGINAL'}</span><p>{proof.label}</p></div>}
      </div>)}
    </div>
    <div className={c.controls}><button type="button" onClick={() => navigate(active-1)} disabled={active===0} aria-label="Depoimento anterior">←</button><div className={c.counter}><span role="status" aria-live="polite" aria-atomic="true">{String(active+1).padStart(2,'0')} / {String(proofs.length).padStart(2,'0')}</span><div aria-hidden="true"><i style={{transform:`scaleX(${(active+1)/proofs.length})`}}/></div></div><button type="button" onClick={() => navigate(active+1)} disabled={active===proofs.length-1} aria-label="Próximo depoimento">→</button></div>
    <p className={c.hint}>DESLIZE PARA EXPLORAR / SEM TROCA AUTOMÁTICA</p>
    <details className={c.inventory}><summary>EXPLORAR TODAS AS {proofs.length} PROVAS</summary><div>{proofs.map((proof,index) => <button key={proof.id} type="button" aria-current={index===active?'true':undefined} onClick={() => navigate(index)}><span>{String(index+1).padStart(2,'0')}</span><span>{proof.person || proof.label}<small>{proof.type==='video'?'VÍDEO':'SCREENSHOT ORIGINAL'}</small></span></button>)}</div></details>
  </section>;
}
