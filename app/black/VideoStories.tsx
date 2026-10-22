'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { blackConfig, blackProofs, globalVideoProofIds } from './black-config';
import s from './video-stories.module.css';

const stories = globalVideoProofIds.flatMap(id => {
  const proof = blackProofs.find(item => item.id === id && item.type === 'video');
  return proof ? [proof] : [];
});
const number = (value: number) => String(value).padStart(2, '0');

export default function VideoStories() {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const targets = useRef<number[]>([]);
  const current = useRef(0);
  const player = useRef<HTMLIFrameElement>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const navigate = useCallback((index: number) => {
    const bounded = Math.max(0, Math.min(stories.length - 1, index));
    track.current?.scrollTo({ left: targets.current[bounded] || 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, []);

  useEffect(() => {
    if (playing) player.current?.focus({ preventScroll: true });
  }, [playing]);
  const stop = () => {
    setPlaying(null);
    requestAnimationFrame(() => track.current?.querySelector<HTMLButtonElement>('[data-active="true"] button')?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    const node = track.current;
    if (!node) return;
    let frame = 0;
    const measure = () => {
      targets.current = Array.from(node.children).map(child => {
        const item = child as HTMLElement;
        return item.offsetLeft - (node.clientWidth - item.offsetWidth) / 2;
      });
      node.scrollTo({ left: targets.current[current.current] || 0, behavior: 'instant' as ScrollBehavior });
    };
    const update = () => {
      frame = 0;
      const nearest = targets.current.reduce((best, target, index) => Math.abs(target - node.scrollLeft) < Math.abs(targets.current[best] - node.scrollLeft) ? index : best, 0);
      if (nearest !== current.current) {
        current.current = nearest;
        setActive(nearest);
        setPlaying(null);
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    node.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    // Leaving this scene releases the player, including its audio/network activity.
    const visibility = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) setPlaying(null);
    }) : null;
    if (section.current) visibility?.observe(section.current);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect(); visibility?.disconnect();
      node.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  }, []);

  return <section ref={section} className={s.stories} aria-labelledby="proof-heading">
    <header className={s.intro}>
      <p>04 / HISTÓRIAS REAIS</p>
      <h2 id="proof-heading">Algumas coisas<br/>precisam ser <em>ouvidas.</em></h2>
    </header>
    <div className={s.carousel} role="region" aria-roledescription="carrossel" aria-label="Relatos em vídeo dos produtos">
      <div className={s.track} ref={track} tabIndex={0} aria-label="Use as setas esquerda e direita para explorar os cinco relatos" onKeyDown={event => {
        if (event.target !== event.currentTarget || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        navigate(event.key === 'Home' ? 0 : event.key === 'End' ? stories.length - 1 : active + (event.key === 'ArrowRight' ? 1 : -1));
      }}>
        {stories.map((proof, index) => {
          const selected = index === active;
          const product = blackConfig.products.find(item => item.id === proof.product)!;
          return <article key={proof.id} className={s.story} data-active={selected} role="group" aria-roledescription="relato" aria-label={`${index + 1} de ${stories.length}: ${proof.videoTitle}`} aria-hidden={!selected} ref={node => { node?.toggleAttribute('inert', !selected); }} style={{ '--distance': Math.min(2, Math.abs(index - active)) } as React.CSSProperties}>
            <div className={s.frame}>
              {selected && playing === proof.id ? <iframe ref={player} src={`https://www.youtube-nocookie.com/embed/${proof.media}?playsinline=1&rel=0`} title={proof.videoTitle || proof.label} allow="fullscreen; picture-in-picture" allowFullScreen/> : <button type="button" className={s.play} disabled={!selected} onClick={() => setPlaying(proof.id)} aria-label={`Assistir relato: ${proof.videoTitle || proof.label}`}>
                <img src={proof.poster} width="480" height="360" alt="" loading="lazy" decoding="async"/>
                <span className={s.playIcon} aria-hidden="true">▷</span>
                <span className={s.watch}>ASSISTIR RELATO <span aria-hidden="true">↗</span></span>
              </button>}
            </div>
            <div className={s.caption}><span aria-hidden="true">{number(index+1)}</span><div><h3>{product.name}</h3><p>{product.type}</p></div>{selected && playing === proof.id ? <button className={s.stop} type="button" onClick={stop} aria-label="Fechar vídeo e voltar à capa">FECHAR VÍDEO ×</button> : <small>RELATO EM VÍDEO</small>}</div>
          </article>;
        })}
      </div>
      <div className={s.controls}>
        <span className={s.gesture}>DESLIZE PARA OUVIR OUTRAS VOZES</span>
        <div className={s.navigation}>
          <button type="button" onClick={() => navigate(active-1)} disabled={active === 0} aria-label="Relato anterior">←</button>
          <div className={s.counter}><span role="status" aria-live="polite" aria-atomic="true">{number(active+1)} / {number(stories.length)}</span><i aria-hidden="true"><b style={{transform:`scaleX(${(active+1)/stories.length})`}}/></i></div>
          <button type="button" onClick={() => navigate(active+1)} disabled={active === stories.length-1} aria-label="Próximo relato">→</button>
        </div>
      </div>
    </div>
    <noscript><div className={s.fallback}><p>Assista aos relatos nos vídeos originais:</p>{stories.map(proof => <a key={proof.id} href={`https://www.youtube.com/watch?v=${proof.media}`}>{proof.videoTitle}</a>)}</div></noscript>
    <p className={s.context}>Relatos individuais de alunos dos produtos indicados.</p>
    <div className={s.exit} aria-hidden="true"><span/><i>VOZES DIFERENTES. UM MESMO UNIVERSO.</i><span/></div>
  </section>;
}
