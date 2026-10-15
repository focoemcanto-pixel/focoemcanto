'use client';
import { useEffect, useRef, useState } from 'react';
import { blackConfig, blackProofs } from './black-config';
import ProofStream from './ProofStream';
import v from './product-experience.module.css';

type Props = { productId: string; onClose: () => void };
export default function ProductExperience({ productId, onClose }: Props) {
  const product = blackConfig.products.find(p => p.id === productId)!;
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [closing, setClosing] = useState(false);
  const proofs = blackProofs.filter(proof => product.proofIds.includes(proof.id));
  function close() {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(onClose, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  }
  useEffect(() => {
    const node = dialog.current!;
    const y = window.scrollY, x = window.scrollX;
    const bodyOverflow = document.body.style.overflow;
    const page = document.querySelector<HTMLElement>('main[data-scroll]');
    if (page) page.dataset.overlayOpen = 'true';
    document.body.style.overflow = 'hidden';
    if (typeof node.showModal === 'function') node.showModal(); else node.setAttribute('open', '');
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      clearTimeout(timer.current);
      if (node.open && typeof node.close === 'function') node.close();
      document.body.style.overflow = bodyOverflow;
      window.scrollTo({ left: x, top: y, behavior: 'instant' as ScrollBehavior });
      if (page) delete page.dataset.overlayOpen;
      window.dispatchEvent(new Event('resize'));
    };
  }, []);
  return <dialog ref={dialog} className={v.experience} data-closing={closing} style={{ '--product-accent': product.accent } as React.CSSProperties} aria-modal="true" aria-labelledby="product-experience-title" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const items = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],iframe,[tabindex="0"]'));
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className={v.experienceBar}><span>BLACK FOCO 2026 / POR DENTRO</span><button ref={closeButton} type="button" onClick={close} aria-label="Fechar produto e voltar ao universo">VOLTAR AO UNIVERSO <span aria-hidden="true">×</span></button></header>
    <div className={v.experienceBody}>
      <div className={v.productOpening}><div className={v.productArt}>{product.image ? <img src={product.image.src} srcSet={product.image.srcSet} sizes="(max-width:760px) 55vw, 360px" width={product.image.width} height={product.image.height} alt={product.image.alt}/> : <span aria-hidden="true">+</span>}</div><div><p className={v.label}>{product.type}</p><h2 id="product-experience-title">{product.name}</h2><p className={v.access}>{product.accessLabel}</p><p className={v.overview}>{product.overview}</p>{product.audience && <div className={v.audience}><span>PARA QUEM É</span><p>{product.audience}</p></div>}</div></div>
      {product.deliverables.length > 0 && <section className={v.deliverables} aria-label="Principais entregáveis"><p className={v.label}>DENTRO DA EXPERIÊNCIA</p><div>{product.deliverables.map(([label, text],i) => <article key={label}><span className={v.moduleNumber}>0{i+1}</span><span>{label}</span><h3>{text}</h3></article>)}</div></section>}
      <div className={v.highlights}>{product.highlights.map(item => <span key={item}>{item}</span>)}</div>
      {proofs.length > 0 && <ProofStream proofs={proofs} title={product.id === 'harmonia' ? 'Vozes que encontraram seu lugar.' : 'Quem já viveu essa experiência.'}/>}
      <footer className={v.experienceEnd}><p>Uma parte do todo.<br/><strong>BLACK FOCO 2026</strong></p><button type="button" className={v.explore} onClick={close}>CONTINUAR EXPLORANDO <span aria-hidden="true">↗</span></button></footer>
    </div>
  </dialog>;
}
