'use client';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { valueFrame } from './value-model';
import { currency, valueItems } from './black-config';
import { clamp, coverFrame, introFrame, productScrollTarget, sceneFrame, sceneTravel, universeFrame, type SceneKind } from './scroll-model';

type Geometry = { scene: HTMLElement; stage: HTMLElement; kind: SceneKind; start: number; travel: number; pin: string; verify: boolean; progress: number };
type Options = { productCount: number; regularTotal: number; onActive: (index: number) => void; onTotal: (value: number) => void };

export function useBlackScroll(root: RefObject<HTMLElement>, options: Options) {
  const geometry = useRef<Geometry[]>([]);
  const { productCount, regularTotal, onActive, onTotal } = options;
  const navigate = useCallback((index: number) => {
    const scene = geometry.current.find(g => g.kind === 'universe');
    if (!scene || root.current?.dataset.scroll !== 'enhanced') return;
    window.scrollTo({ top: productScrollTarget(scene.start, scene.travel, index, productCount), behavior: 'smooth' });
  }, [productCount, root]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const probe = el.querySelector<HTMLElement>('[data-viewport-probe]');
    const scenes = Array.from(el.querySelectorAll<HTMLElement>('[data-pin-scene]'));
    const covers = Array.from(el.querySelectorAll<HTMLElement>('[data-universe-cover]'));
    const valueRows = Array.from(el.querySelectorAll<HTMLElement>('[data-value-item]'));
    const subtotal = el.querySelector<HTMLElement>('[data-value-subtotal]');
    const construction = el.querySelector<HTMLElement>('[data-value-construction]');
    const revelation = el.querySelector<HTMLElement>('[data-value-revelation]');
    const value = el.querySelector<HTMLElement>('[data-scene="value"]');
    let frame = 0, layoutFrame = 0, destroyed = false;
    let pageHeight = 1, stageHeight = 0, stageWidth = 0, valueStart = 0;
    let active = -1, total = -1, configuring = false, pinFailed = false;

    function staticMode(failed = false) {
      if (failed) pinFailed = true;
      configuring = false;
      el!.dataset.scroll = 'static';
      geometry.current = [];
      if (subtotal) subtotal.textContent = currency(valueItems.reduce((sum,item) => sum + item.cents,0) / 100);
      [construction, revelation].forEach(node => { node?.removeAttribute('inert'); node?.removeAttribute('aria-hidden'); });
      for (const scene of scenes) { delete scene.dataset.pin; scene.style.removeProperty('--travel'); scene.style.removeProperty('--stage-height'); }
      if (total !== regularTotal) { total = regularTotal; onTotal(regularTotal); }
    }

    function frameUpdate() {
      frame = 0;
      if (destroyed || configuring || el!.dataset.overlayOpen || el!.dataset.scroll !== 'enhanced') return;
      // Leituras somente antes das escritas. Verificação de pin apenas ao entrar
      // na cena, não getBoundingClientRect/layout em todo frame de scroll.
      for (const g of geometry.current) {
        if (g.verify) {
          g.verify = false;
          if (g.pin === 'active' && Math.abs(g.stage.getBoundingClientRect().top) > 2) { staticMode(true); return; }
        }
      }
      const y = window.scrollY;
      el!.style.setProperty('--page-progress', String(clamp(y / pageHeight)));
      for (const g of geometry.current) {
        const next = sceneFrame(y, g.start, g.travel);
        if (g.pin !== next.pin) {
          g.pin = next.pin; g.scene.dataset.pin = next.pin;
          if (next.pin === 'active') g.verify = true;
        }
        if (g.progress === next.progress) continue;
        g.progress = next.progress;
        g.scene.style.setProperty('--p', String(next.progress));
        if (g.kind === 'value') {
          const state = valueFrame(next.progress, valueItems.map(item => item.cents));
          g.scene.style.setProperty('--value-reveal', String(state.reveal));
          if (subtotal) subtotal.textContent = currency(state.subtotalCents / 100);
          valueRows.forEach((row,index) => row.style.setProperty('--item-opacity', String(index <= state.active ? 1 : .32)));
          const ready = state.reveal >= .9;
          if (revelation) { revelation.dataset.ready = String(ready); revelation.toggleAttribute('inert', !ready); revelation.setAttribute('aria-hidden', String(!ready)); }
          if (construction) { construction.toggleAttribute('inert', ready); construction.setAttribute('aria-hidden', String(ready)); }
        }
        if (g.kind === 'intro') {
          const { weights } = introFrame(next.progress);
          ['--identity-opacity', '--built-opacity', '--opportunity-opacity'].forEach((key, i) => g.scene.style.setProperty(key, String(weights[i])));
        }
        if (g.kind === 'universe') {
          const state = universeFrame(next.progress, productCount);
          if (active !== state.active) { active = state.active; onActive(active); }
          g.scene.style.setProperty('--info-opacity', String(state.textOpacity));
          covers.forEach((cover, i) => {
            const coverState = coverFrame(i, state.cursor);
            cover.style.setProperty('--distance', String(coverState.distance));
            cover.style.setProperty('--card-scale', String(coverState.scale));
            cover.style.setProperty('--card-opacity', String(coverState.opacity));
            cover.style.setProperty('--card-tilt', `${coverState.tilt}deg`);
          });
        }
      }
      const nextTotal = Math.round(regularTotal * clamp((y - valueStart + stageHeight * 0.7) / Math.max(1, stageHeight * 0.5)));
      if (total !== nextTotal) { total = nextTotal; onTotal(total); }
      if (geometry.current.some(g => g.verify)) schedule();
    }
    function schedule() { if (!frame && !destroyed) frame = requestAnimationFrame(() => { try { frameUpdate(); } catch { staticMode(true); } }); }

    function cacheGeometry() {
      layoutFrame = 0;
      if (destroyed || el!.dataset.scroll !== 'enhanced') return;
      const y = window.scrollY;
      // Uma medição por reconstrução de layout, fora do hot path de scroll.
      geometry.current = scenes.map(scene => {
        const rect = scene.getBoundingClientRect();
        const kind = scene.dataset.pinScene as SceneKind;
        return { scene, stage: scene.querySelector<HTMLElement>('[data-pin-stage]')!, kind, start: rect.top + y, travel: sceneTravel(kind, stageHeight, productCount), pin: '', verify: false, progress: -1 };
      });
      valueStart = (value?.getBoundingClientRect().top || 0) + y;
      pageHeight = Math.max(1, document.documentElement.scrollHeight - stageHeight);
      configuring = false;
      schedule();
    }

    function rebuild() {
      if (destroyed || el!.dataset.overlayOpen) return;
      if (pinFailed || !motion || motion.matches || !probe || typeof CSS === 'undefined' || typeof requestAnimationFrame !== 'function' || !CSS.supports('height', '100svh') || !CSS.supports('position', 'fixed') || (window.visualViewport?.scale || 1) > 1.01) { staticMode(); return; }
      const height = probe.getBoundingClientRect().height;
      const rect = el!.getBoundingClientRect();
      // Viewports muito baixas (paisagem/zoom) recebem a sequência legível.
      if (height < 620 || rect.width < 320) { staticMode(); return; }
      if (el!.dataset.scroll === 'enhanced' && height === stageHeight && rect.width === stageWidth) { if (!layoutFrame) layoutFrame = requestAnimationFrame(cacheGeometry); return; }
      configuring = true;
      stageHeight = height; stageWidth = rect.width;
      el!.dataset.scroll = 'enhanced';
      for (const scene of scenes) {
        scene.dataset.pin = 'before';
        scene.style.setProperty('--stage-height', `${height}px`);
        scene.style.setProperty('--stage-left', `${rect.left}px`);
        scene.style.setProperty('--stage-width', `${rect.width}px`);
        scene.style.setProperty('--travel', `${sceneTravel(scene.dataset.pinScene as SceneKind, height, productCount)}px`);
      }
      if (layoutFrame) cancelAnimationFrame(layoutFrame);
      layoutFrame = requestAnimationFrame(cacheGeometry);
    }

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { if (!configuring) rebuild(); });
    observer?.observe(el);
    rebuild();
    const pointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || motion?.matches) return;
      el.style.setProperty('--mx', `${event.clientX}px`); el.style.setProperty('--my', `${event.clientY}px`);
    };
    el.addEventListener('pointermove', pointer, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', rebuild);
    window.visualViewport?.addEventListener('resize', rebuild);
    motion?.addEventListener('change', rebuild);
    document.fonts?.ready.then(() => { if (!destroyed) rebuild(); });
    return () => {
      destroyed = true; cancelAnimationFrame(frame); cancelAnimationFrame(layoutFrame); observer?.disconnect();
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', rebuild);
      window.visualViewport?.removeEventListener('resize', rebuild); motion?.removeEventListener('change', rebuild);
      el.removeEventListener('pointermove', pointer);
      delete el.dataset.scroll;
    };
  }, [root, productCount, regularTotal, onActive, onTotal]);

  return navigate;
}
