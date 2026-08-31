'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadClosetItems, restoreClosetSession, type ClosetSession } from '../supabase';
import { deleteWardrobeItem, setWardrobeStatus, type WardrobeStatus } from '../wardrobeActions';
import ClosetImage from '../ClosetImage';
import styles from './wardrobe.module.css';

type Piece = {
  id: string;
  name: string;
  category: string;
  meta: string;
  image: string;
  metadata: Record<string, any>;
  status: WardrobeStatus;
};
type ViewFilter = 'all' | 'available' | 'unavailable' | 'archived';

const statusLabel: Record<WardrobeStatus, string> = {
  available: 'Disponível',
  laundry: 'Na lavanderia',
  repair: 'Para conserto',
  loaned: 'Emprestada',
  archived: 'Arquivada',
};
const statusOptions: [WardrobeStatus, string, string][] = [
  ['available', '✓', 'Disponível'],
  ['laundry', '◒', 'Lavanderia'],
  ['repair', '⌁', 'Conserto'],
  ['loaned', '↗', 'Emprestada'],
  ['archived', '□', 'Arquivar'],
];

function mapRows(rows: any[]): Piece[] {
  return rows.map(r => ({
    id: String(r.id),
    name: r.name,
    category: r.category,
    meta: [r.color, r.subcategory, r.pattern, r.style].filter(Boolean).join(' · '),
    image: r.image || '',
    metadata: r.metadata || {},
    status: (r.metadata?.wardrobe_status || 'available') as WardrobeStatus,
  }));
}

export default function WardrobePage() {
  const [session, setSession] = useState<ClosetSession | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [filter, setFilter] = useState('Todos');
  const [view, setView] = useState<ViewFilter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Piece | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const timer = useRef<any>(null);
  const dragStart = useRef(0);
  const sheetRef = useRef<HTMLElement | null>(null);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await restoreClosetSession();
      if (!alive) return;
      if (!s) {
        setLoading(false);
        return;
      }
      setSession(s);
      const rows = await loadClosetItems(s);
      if (!alive) return;
      setPieces(mapRows(rows));
      setLoadError('');
      setLoading(false);
    })().catch((e:any) => {
      if(!alive)return;
      setLoadError(e?.message || 'Não consegui carregar suas peças agora.');
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setDragY(0);
      setDragging(false);
    }
  }, [selected]);

  useEffect(() => {
    setFilter('Todos');
  }, [view]);

  const counts = useMemo(
    () => ({
      all: pieces.filter(p => p.status !== 'archived').length,
      available: pieces.filter(p => p.status === 'available').length,
      unavailable: pieces.filter(p => !['available', 'archived'].includes(p.status)).length,
      archived: pieces.filter(p => p.status === 'archived').length,
    }),
    [pieces],
  );

  const viewPieces = useMemo(() => {
    if (view === 'archived') return pieces.filter(p => p.status === 'archived');
    const active = pieces.filter(p => p.status !== 'archived');
    if (view === 'available') return active.filter(p => p.status === 'available');
    if (view === 'unavailable') return active.filter(p => p.status !== 'available');
    return active;
  }, [pieces, view]);

  const categories = useMemo(
    () => ['Todos', ...Array.from(new Set(viewPieces.map(p => p.category)))],
    [viewPieces],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return viewPieces
      .filter(p => filter === 'Todos' || p.category === filter)
      .filter(p => !q || `${p.name} ${p.category} ${p.meta}`.toLowerCase().includes(q));
  }, [viewPieces, filter, query]);

  function holdStart(piece: Piece) {
    timer.current = setTimeout(() => setSelected(piece), 330);
  }
  function holdEnd() {
    if (timer.current) clearTimeout(timer.current);
  }
  function dragBegin(e: React.TouchEvent) {
    dragStart.current = e.touches[0].clientY;
    setDragging(true);
  }
  function dragMove(e: React.TouchEvent) {
    if (!dragging) return;
    const dy = Math.max(0, e.touches[0].clientY - dragStart.current);
    setDragY(dy);
    if (dy > 4) e.preventDefault();
  }
  function dragEnd() {
    if (!dragging) return;
    setDragging(false);
    if (dragY > 95) {
      setSelected(null);
      setDragY(0);
      return;
    }
    setDragY(0);
  }
  function sheetTouchStart(e: React.TouchEvent) {
    if ((sheetRef.current?.scrollTop || 0) > 0) return;
    dragBegin(e);
  }
  function sheetTouchMove(e: React.TouchEvent) {
    if ((sheetRef.current?.scrollTop || 0) > 0 && !dragging) return;
    dragMove(e);
  }

  async function setStatus(status: WardrobeStatus) {
    if (!session || !selected) return;
    setBusy(true);
    try {
      await setWardrobeStatus(session, selected.id, selected.metadata, status);
      setPieces(current =>
        current.map(piece =>
          piece.id === selected.id
            ? { ...piece, status, metadata: { ...piece.metadata, wardrobe_status: status } }
            : piece,
        ),
      );
      setSelected(null);
      notify(
        status === 'available'
          ? 'Peça disponível para o stylist ✦'
          : status === 'archived'
            ? 'Peça arquivada. Ela continua guardada no seu closet.'
            : `${statusLabel[status]} · o stylist vai respeitar isso`,
      );
    } catch (e: any) {
      notify(e?.message || 'Não consegui atualizar a peça.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!session || !selected || busy) return;
    if (!window.confirm(`Excluir ${selected.name} do seu closet?`)) return;
    setBusy(true);
    try {
      await deleteWardrobeItem(session, selected.id);
      setPieces(current => current.filter(piece => piece.id !== selected.id));
      setSelected(null);
      notify('Peça excluída do closet');
    } catch (e: any) {
      notify(e?.message || 'Não consegui excluir a peça.');
    } finally {
      setBusy(false);
    }
  }

  if (!session && !loading) {
    return (
      <main className={styles.page}>
        <div className={styles.empty}>
          <h1>Entre no closet primeiro.</h1>
          <button onClick={() => (location.href = '/closet')}>Voltar</button>
        </div>
      </main>
    );
  }

  if(loadError && !loading){
    return <main className={styles.page}><header className={styles.header}><button onClick={()=>history.back()}>‹</button><div><span>MEU CLOSET</span><strong>Guarda-roupa</strong></div><button onClick={()=>location.href='/closet'}>⌂</button></header><div className={styles.empty}><h1>Não consegui abrir seu guarda-roupa.</h1><p>{loadError}</p><button onClick={()=>location.reload()}>Tentar novamente</button></div></main>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button onClick={() => history.back()}>‹</button>
        <div><span>MEU CLOSET</span><strong>Guarda-roupa</strong></div>
        <button onClick={() => (location.href = '/closet')}>⌂</button>
      </header>

      <section className={styles.hero}>
        <span>TUDO NO LUGAR</span>
        <h1>Seu guarda-roupa, aberto de verdade.</h1>
        <p>Encontre, visualize e gerencie suas peças. O Stylist usa apenas o que estiver realmente disponível.</p>
      </section>

      <section className={styles.tools}>
        <div className={styles.search}>
          <span>⌕</span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar camisa, tênis, preto…" />
          {query && <button onClick={() => setQuery('')}>×</button>}
        </div>
        <div className={styles.availability}>
          <button className={view === 'all' ? styles.viewActive : ''} onClick={() => setView('all')}><strong>{counts.all}</strong><span>Todas</span></button>
          <button className={view === 'available' ? styles.viewActive : ''} onClick={() => setView('available')}><strong>{counts.available}</strong><span>Disponíveis</span></button>
          <button className={view === 'unavailable' ? styles.viewActive : ''} onClick={() => setView('unavailable')}><strong>{counts.unavailable}</strong><span>Fora de uso</span></button>
          <button className={view === 'archived' ? styles.viewActive : ''} onClick={() => setView('archived')}><strong>{counts.archived}</strong><span>Arquivadas</span></button>
        </div>
      </section>

      <nav className={styles.filters}>
        {categories.map(category => <button key={category} className={filter === category ? styles.active : ''} onClick={() => setFilter(category)}>{category}</button>)}
      </nav>

      {loading ? (
        <div className={styles.loading}>Abrindo seu closet…</div>
      ) : (
        <section className={styles.wardrobe}>
          <div className={styles.rail} />
          <div className={styles.grid}>
            {shown.map(piece => (
              <button
                key={piece.id}
                className={styles.card}
                onMouseDown={() => holdStart(piece)}
                onMouseUp={holdEnd}
                onMouseLeave={holdEnd}
                onTouchStart={() => holdStart(piece)}
                onTouchEnd={holdEnd}
                onClick={() => setSelected(piece)}
              >
                <div className={styles.visual}>
                  <ClosetImage src={piece.image} alt={piece.name} style={{width:'100%',height:'100%',objectFit:'contain'}} />
                  {piece.status !== 'available' && <span className={`${styles.status} ${styles[piece.status]}`}>{statusLabel[piece.status]}</span>}
                </div>
                <strong>{piece.name}</strong>
                <small>{piece.meta || piece.category}</small>
              </button>
            ))}
          </div>
          {!shown.length && (
            <div className={styles.emptyShelf}>
              <strong>{query ? 'Nenhuma peça combina com essa busca.' : view === 'archived' ? 'Nenhuma peça arquivada.' : 'Nenhuma peça aqui.'}</strong>
              <p>{view === 'archived' ? 'Peças arquivadas ficam guardadas aqui e podem voltar ao closet quando você quiser.' : view === 'unavailable' ? 'Lavanderia, conserto e peças emprestadas aparecem aqui.' : 'Tente outro filtro ou adicione uma nova peça.'}</p>
              {view !== 'archived' && <button onClick={() => (location.href = '/closet/add')}>Adicionar peça</button>}
            </div>
          )}
        </section>
      )}

      {selected && (
        <div className={styles.scrim} onClick={() => setSelected(null)}>
          <section
            ref={sheetRef as any}
            className={`${styles.sheet} ${dragging ? styles.dragging : ''}`}
            style={{ transform: `translateY(${dragY}px)` }}
            onClick={e => e.stopPropagation()}
            onTouchStart={sheetTouchStart}
            onTouchMove={sheetTouchMove}
            onTouchEnd={dragEnd}
          >
            <div className={styles.handle} onTouchStart={dragBegin} onTouchMove={dragMove} onTouchEnd={dragEnd} />
            <div className={styles.preview}><ClosetImage src={selected.image} alt={selected.name} style={{width:'100%',height:'100%',objectFit:'contain'}} /></div>
            <div className={styles.copy}>
              <span>{selected.category} · {statusLabel[selected.status]}</span>
              <h2>{selected.name}</h2>
              <p>{selected.meta}</p>
            </div>
            <div className={styles.primaryActions}>
              {selected.status === 'available' ? (
                <button onClick={() => (location.href = `/closet/look?anchor=${encodeURIComponent(selected.id)}`)}>✦ Montar look com esta peça</button>
              ) : (
                <button disabled={busy} onClick={() => setStatus('available')}>{selected.status === 'archived' ? '↩ Restaurar para o closet' : '✓ Tornar disponível'}</button>
              )}
            </div>
            {selected.status !== 'available' && <p className={styles.availabilityHint}>O Stylist não usa esta peça enquanto ela estiver {statusLabel[selected.status].toLowerCase()}.</p>}
            <div className={styles.statusGrid}>
              {statusOptions.map(([value, icon, label]) => (
                <button disabled={busy} key={value} className={selected.status === value ? styles.selectedStatus : ''} onClick={() => setStatus(value)}>
                  <span>{icon}</span><strong>{label}</strong>
                </button>
              ))}
            </div>
            <button className={styles.delete} disabled={busy} onClick={remove}>Excluir peça definitivamente</button>
          </section>
        </div>
      )}

      <div className={`${styles.toast} ${toast ? styles.toastShow : ''}`}>{toast}</div>
    </main>
  );
}
