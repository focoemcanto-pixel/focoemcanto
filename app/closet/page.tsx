'use client';

import { useMemo, useState } from 'react';
import styles from './closet.module.css';

type Category = 'Todos' | 'Blusas' | 'Calças' | 'Vestidos' | 'Calçados' | 'Bolsas' | 'Acessórios';

const categories: { label: Category; icon: string; count: number }[] = [
  { label: 'Todos', icon: '✦', count: 24 },
  { label: 'Blusas', icon: '◡', count: 7 },
  { label: 'Calças', icon: '⌇', count: 5 },
  { label: 'Vestidos', icon: '♢', count: 3 },
  { label: 'Calçados', icon: '⌁', count: 5 },
  { label: 'Bolsas', icon: '▱', count: 2 },
  { label: 'Acessórios', icon: '○', count: 2 },
];

const pieces = [
  { id: 1, category: 'Blusas', name: 'Camisa de linho', meta: 'Off-white · leve', tone: '#e8dfd2', emoji: '👚' },
  { id: 2, category: 'Calças', name: 'Pantalona areia', meta: 'Alfaiataria · ampla', tone: '#c8ad8d', emoji: '👖' },
  { id: 3, category: 'Calçados', name: 'Mule caramelo', meta: 'Couro · casual chic', tone: '#aa7652', emoji: '👡' },
  { id: 4, category: 'Bolsas', name: 'Bolsa estruturada', meta: 'Camel · média', tone: '#987052', emoji: '👜' },
  { id: 5, category: 'Blusas', name: 'Camiseta essencial', meta: 'Preta · algodão', tone: '#383735', emoji: '👕' },
  { id: 6, category: 'Acessórios', name: 'Argolas douradas', meta: 'Minimalista', tone: '#d8bf88', emoji: '◌' },
];

export default function ClosetPage() {
  const [category, setCategory] = useState<Category>('Todos');
  const [liked, setLiked] = useState(false);
  const [toast, setToast] = useState('');

  const filteredPieces = useMemo(
    () => pieces.filter((piece) => category === 'Todos' || piece.category === category),
    [category]
  );

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  }

  return (
    <main className={styles.page}>
      <section className={styles.appShell}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.eyebrow}>SEU ESTILO, TODOS OS DIAS</span>
            <h1>closet<span>.</span></h1>
          </div>
          <button className={styles.profileButton} type="button" aria-label="Abrir perfil" onClick={() => notify('Perfil em breve')}>MC</button>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>Stylist pessoal</span>
            <h2>Bom dia.<br />O que vamos vestir?</h2>
            <p>Seu guarda-roupa, seu gosto e a ocasião — combinados de um jeito que fica cada vez mais você.</p>
            <div className={styles.heroActions}>
              <button className={styles.primaryButton} type="button" onClick={() => notify('Gerando uma nova inspiração…')}>
                <span>✦</span> Montar meu look
              </button>
              <button className={styles.iconButton} type="button" aria-label="Abrir preferências" onClick={() => notify('Preferências de estilo em breve')}>⌁</button>
            </div>
          </div>

          <div className={styles.wardrobeArt} aria-hidden="true">
            <div className={styles.wardrobeGlow} />
            <div className={styles.wardrobe}>
              <div className={styles.wardrobeTop}>CLOSET</div>
              <div className={styles.wardrobeDoors}>
                <div className={styles.door}><span /></div>
                <div className={styles.door}><span /></div>
              </div>
              <div className={styles.wardrobeBase} />
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.kicker}>Meu guarda-roupa</span>
              <h3>24 peças organizadas</h3>
            </div>
            <button className={styles.textButton} type="button" onClick={() => notify('Abrindo cadastro de peça…')}>+ Adicionar</button>
          </div>

          <div className={styles.categories} role="tablist" aria-label="Categorias do guarda-roupa">
            {categories.map((item) => (
              <button
                key={item.label}
                className={`${styles.categoryChip} ${category === item.label ? styles.categoryActive : ''}`}
                type="button"
                role="tab"
                aria-selected={category === item.label}
                onClick={() => setCategory(item.label)}
              >
                <span className={styles.categoryIcon}>{item.icon}</span>
                <span>{item.label}</span>
                <small>{item.count}</small>
              </button>
            ))}
          </div>

          <div className={styles.pieceGrid}>
            {filteredPieces.map((piece) => (
              <button className={styles.pieceCard} type="button" key={piece.id} onClick={() => notify(`${piece.name} selecionada`)}>
                <div className={styles.pieceVisual} style={{ background: `linear-gradient(145deg, ${piece.tone}, #f7f2ea)` }}>
                  <span>{piece.emoji}</span>
                </div>
                <div className={styles.pieceInfo}>
                  <strong>{piece.name}</strong>
                  <span>{piece.meta}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.lookSection}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.kicker}>Escolhido para você</span>
              <h3>Casual sofisticado</h3>
            </div>
            <span className={styles.match}>96% match</span>
          </div>

          <div className={styles.lookCard}>
            <div className={styles.lookCanvas}>
              <button className={`${styles.lookPiece} ${styles.lookTop}`} type="button" onClick={() => notify('Camisa selecionada · trocar ou fixar')}>👚</button>
              <button className={`${styles.lookPiece} ${styles.lookBottom}`} type="button" onClick={() => notify('Calça selecionada · trocar ou fixar')}>👖</button>
              <button className={`${styles.lookPiece} ${styles.lookShoe}`} type="button" onClick={() => notify('Calçado selecionado · trocar ou fixar')}>👡</button>
              <button className={`${styles.lookPiece} ${styles.lookBag}`} type="button" onClick={() => notify('Bolsa selecionada · trocar ou fixar')}>👜</button>
              <div className={styles.lookNote}>Toque em uma peça para trocar</div>
            </div>

            <div className={styles.lookDetails}>
              <p>Leve, elegante e sem esforço. A alfaiataria clara equilibra a camisa fluida, enquanto o caramelo aquece a composição.</p>
              <div className={styles.lookActions}>
                <button type="button" onClick={() => notify('Vamos trocar só uma peça')}>↻ <span>Trocar peça</span></button>
                <button type="button" onClick={() => notify('Abrindo seu guarda-roupa')}>▤ <span>Guarda-roupa</span></button>
                <button
                  type="button"
                  className={liked ? styles.liked : ''}
                  aria-pressed={liked}
                  onClick={() => {
                    setLiked((value) => !value);
                    notify(!liked ? 'Look salvo — já estou aprendendo seu gosto' : 'Look removido dos favoritos');
                  }}
                >
                  {liked ? '♥' : '♡'} <span>{liked ? 'Amei' : 'Gostei'}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.discoverCard}>
          <div>
            <span className={styles.kicker}>Em breve</span>
            <h3>Descubra peças que fazem sentido no seu armário.</h3>
            <p>A loja vai aprender seu estilo e mostrar o que realmente aumenta suas possibilidades de looks.</p>
          </div>
          <button type="button" onClick={() => notify('Marketplace entra numa próxima etapa')}>Explorar ideia →</button>
        </section>

        <nav className={styles.bottomNav} aria-label="Navegação principal">
          <button className={styles.navActive} type="button"><span>⌂</span>Início</button>
          <button type="button" onClick={() => notify('Você já está no guarda-roupa')}><span>♢</span>Closet</button>
          <button className={styles.fab} type="button" aria-label="Montar look" onClick={() => notify('Vamos montar seu look ✦')}>✦</button>
          <button type="button" onClick={() => notify('Seus looks salvos em breve')}><span>▦</span>Looks</button>
          <button type="button" onClick={() => notify('Loja inteligente em breve')}><span>◌</span>Loja</button>
        </nav>
      </section>

      <div className={`${styles.toast} ${toast ? styles.toastVisible : ''}`} role="status" aria-live="polite">{toast}</div>
    </main>
  );
}
