'use client';
import { useEffect, useState } from 'react';
import p from './prelaunch.module.css';

// Contextual CTA for both pre-launch signup and the open checkout.
// Retains the original scroll and visibility behavior on mobile and desktop.
type Props = { label: string; hidden: boolean } & ({ onOpen: () => void; href?: never } | { href: string; onOpen?: never });
export default function StickyListCta({ label, onOpen, href, hidden }: Props) {
  const [past, setPast] = useState(false);
  const [inlineVisible, setInlineVisible] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => { frame = 0; setPast(window.scrollY > window.innerHeight * 1.15); };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    const visible = new Set<Element>();
    const io = new IntersectionObserver(entries => { for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target); setInlineVisible(visible.size > 0); }, { threshold: 0.01 });
    document.querySelectorAll('[data-list-inline], [data-purchase-inline], footer').forEach(el => io.observe(el));
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame); io.disconnect(); };
  }, []);
  const show = past && !inlineVisible && !hidden;
  return <div className={`${p.sticky} ${show ? p.stickyOn : ''}`} aria-hidden={!show}>
    {href
      ? <a data-purchase-cta href={href} className={p.stickyButton} tabIndex={show ? 0 : -1}><span className={p.stickyDot} aria-hidden="true" />{label}<span aria-hidden="true">→</span></a>
      : <button type="button" className={p.stickyButton} onClick={onOpen} tabIndex={show ? 0 : -1}><span className={p.stickyDot} aria-hidden="true" />{label}<span aria-hidden="true">→</span></button>}
  </div>;
}
