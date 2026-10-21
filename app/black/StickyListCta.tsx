'use client';
import { useEffect, useState } from 'react';
import p from './prelaunch.module.css';

// Contextual CTA: appears only after the opening scene, steps aside whenever an inline list CTA
// (or the footer) is on screen, and never shows over the open form.
export default function StickyListCta({ label, onOpen, hidden }: { label: string; onOpen: () => void; hidden: boolean }) {
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
    document.querySelectorAll('[data-list-inline], footer').forEach(el => io.observe(el));
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame); io.disconnect(); };
  }, []);
  const show = past && !inlineVisible && !hidden;
  return <div className={`${p.sticky} ${show ? p.stickyOn : ''}`} aria-hidden={!show}>
    <button type="button" className={p.stickyButton} onClick={onOpen} tabIndex={show ? 0 : -1}><span className={p.stickyDot} aria-hidden="true" />{label}<span aria-hidden="true">→</span></button>
  </div>;
}
