'use client';

import { ChangeEvent, useMemo, useRef, useState } from 'react';
import styles from './closet.module.css';

type Category = 'Todos' | 'Blusas' | 'Calças' | 'Vestidos' | 'Calçados' | 'Bolsas' | 'Acessórios';
type Sheet = 'add' | 'edit' | 'occasion' | 'wardrobe' | null;

type Piece = { id:number; category:Category; name:string; meta:string; tone:string; image?:string };

const categories: { label: Category; icon: string; count: number }[] = [
  { label: 'Todos', icon: '✦', count: 24 }, { label: 'Blusas', icon: '◡', count: 7 },
  { label: 'Calças', icon: '⌇', count: 5 }, { label: 'Vestidos', icon: '♢', count: 3 },
  { label: 'Calçados', icon: '⌁', count: 5 }, { label: 'Bolsas', icon: '▱', count: 2 },
  { label: 'Acessórios', icon: '○', count: 2 },
];

const seedPieces: Piece[] = [];
const occasions = [
  ['Igreja','Culto, ensaio ou evento'], ['Trabalho','Escritório ou reunião'], ['Faculdade','Confortável e estiloso'],
  ['Escola','Prático para o dia'], ['Sair','Almoço, shopping ou passeio'], ['Encontro','Um pouco mais especial'],
  ['Festa','Aniversário ou comemoração'], ['Evento','Ocasião mais arrumada'], ['Viagem','Conforto e versatilidade'], ['Outro','Conte onde você vai']
];

export default function ClosetPage(){
 const [category,setCategory]=useState<Category>('Todos'); const [pieces,setPieces]=useState<Piece[]>(seedPieces);
 const [sheet,setSheet]=useState<Sheet>(null); const [toast,setToast]=useState(''); const [draftImage,setDraftImage]=useState('');
 const [draftName,setDraftName]=useState(''); const [draftCategory,setDraftCategory]=useState<Category>('Blusas'); const [draftColor,setDraftColor]=useState('');
 const [selectedOccasion,setSelectedOccasion]=useState(''); const cameraRef=useRef<HTMLInputElement>(null); const galleryRef=useRef<HTMLInputElement>(null);
 const filtered=useMemo(()=>pieces.filter(p=>category==='Todos'||p.category===category),[category,pieces]);
 function notify(m:string){setToast(m);window.setTimeout(()=>setToast(''),2200)}
 function receivePhoto(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;const url=URL.createObjectURL(file);setDraftImage(url);setDraftName('Nova peça');setDraftCategory('Blusas');setDraftColor('');setSheet('edit');}
 function savePiece(){const item:Piece={id:Date.now(),category:draftCategory,name:draftName||'Minha peça',meta:[draftColor,'Adicionada agora'].filter(Boolean).join(' · '),tone:'#eee7dc',image:draftImage};setPieces(v=>[item,...v]);setSheet(null);notify('Peça guardada no seu closet ✦');}
 function startLook(){if(!pieces.length){notify('Adicione algumas peças primeiro');setSheet('add');return;}setSheet('occasion');}
 return <main className={styles.page}><section className={styles.appShell}>
  <header className={styles.topbar}><div><span className={styles.eyebrow}>SEU ESTILO, TODOS OS DIAS</span><h1>closet<span>.</span></h1></div><button className={styles.profileButton}>MC</button></header>
  <section className={styles.hero}><div className={styles.heroCopy}><span className={styles.kicker}>Stylist pessoal</span><h2>Bom dia.<br/>O que vamos vestir?</h2><p>Seu guarda-roupa, seu gosto e a ocasião — combinados de um jeito que fica cada vez mais você.</p><div className={styles.heroActions}><button className={styles.primaryButton} onClick={startLook}><span>✦</span> Montar meu look</button></div></div><div className={styles.wardrobeArt} aria-hidden="true"><div className={styles.wardrobe}><div className={styles.wardrobeTop}>CLOSET</div><div className={styles.wardrobeDoors}><div className={styles.door}><span/></div><div className={styles.door}><span/></div></div><div className={styles.wardrobeBase}/></div></div></section>
  <section className={styles.quickRow}><button onClick={()=>setSheet('add')}><span>＋</span><strong>Adicionar peça</strong><small>foto ou galeria</small></button><button onClick={()=>pieces.length?notify('Toque numa peça do closet para começar por ela'):setSheet('add')}><span>⌁</span><strong>Começar por uma peça</strong><small>fixe e complete</small></button></section>
  <section className={styles.section}><div className={styles.sectionHeader}><div><span className={styles.kicker}>Meu guarda-roupa</span><h3>{pieces.length?`${pieces.length} ${pieces.length===1?'peça organizada':'peças organizadas'}`:'Seu closet começa aqui'}</h3></div><button className={styles.textButton} onClick={()=>setSheet('add')}>+ Adicionar</button></div>
  <div className={styles.categories}>{categories.map(i=><button key={i.label} className={`${styles.categoryChip} ${category===i.label?styles.categoryActive:''}`} onClick={()=>setCategory(i.label)}><span>{i.icon}</span><span>{i.label}</span>{pieces.length>0&&<small>{pieces.filter(p=>i.label==='Todos'||p.category===i.label).length}</small>}</button>)}</div>
  {!filtered.length?<div className={styles.emptyCloset}><div className={styles.emptyHanger}>⌁</div><strong>{category==='Todos'?'Adicione sua primeira peça':'Nenhuma peça aqui ainda'}</strong><p>Fotografe ou escolha uma foto. Vamos preparar a roupa para ela aparecer limpa e bonita nos seus looks.</p><button onClick={()=>setSheet('add')}>＋ Adicionar peça</button></div>:<div className={styles.pieceGrid}>{filtered.map(p=><button className={styles.pieceCard} key={p.id} onClick={()=>{setDraftImage(p.image||'');setDraftName(p.name);setDraftCategory(p.category);setSheet('edit')}}><div className={styles.pieceVisual}>{p.image?<img src={p.image} alt={p.name}/>:null}</div><div className={styles.pieceInfo}><strong>{p.name}</strong><span>{p.meta}</span></div></button>)}</div>}
  </section>
  <section className={styles.lookSection}><div className={styles.sectionHeader}><div><span className={styles.kicker}>Seus looks</span><h3>Inspirações com suas roupas</h3></div></div><div className={styles.lookPreviewEmpty}><span>✦</span><h4>Seu próximo look nasce aqui.</h4><p>Depois de cadastrar suas peças, escolha onde você vai. O stylist monta combinações usando roupas reais do seu closet.</p><button onClick={startLook}>Montar um look</button></div></section>
  <nav className={styles.bottomNav}><button className={styles.navActive}><span>⌂</span>Início</button><button><span>♢</span>Closet</button><button className={styles.fab} onClick={startLook}>✦</button><button><span>▦</span>Looks</button><button><span>◌</span>Loja</button></nav>
 </section>
 <input ref={cameraRef} className={styles.hiddenInput} type="file" accept="image/*" capture="environment" onChange={receivePhoto}/><input ref={galleryRef} className={styles.hiddenInput} type="file" accept="image/*" onChange={receivePhoto}/>
 {sheet&&<button className={styles.scrim} aria-label="Fechar" onClick={()=>setSheet(null)}/>}<aside className={`${styles.sheet} ${sheet?styles.sheetOpen:''}`}><div className={styles.sheetHandle}/>
 {sheet==='add'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Nova peça</span><h3>Coloque no seu closet</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>Use uma foto da própria roupa. Depois vamos deixar a peça limpa, sem distrações no fundo, pronta para compor os looks.</p><div className={styles.captureGrid}><button onClick={()=>cameraRef.current?.click()}><span>◎</span><strong>Tirar foto</strong><small>usar a câmera</small></button><button onClick={()=>galleryRef.current?.click()}><span>▧</span><strong>Escolher foto</strong><small>abrir galeria</small></button></div><div className={styles.photoTip}><span>✦</span><p><strong>Para ficar bonito no look</strong>Uma peça por foto, inteira, com boa luz. Pode ser no cabide, cama ou chão — o processamento cuidará da apresentação.</p></div></>}
 {sheet==='edit'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Preparar peça</span><h3>Confira antes de guardar</h3></div><button onClick={()=>setSheet(null)}>×</button></div><div className={styles.editorPreview}>{draftImage&&<img src={draftImage} alt="Peça enviada"/>}<span className={styles.processingBadge}>✦ foto recebida</span></div><p className={styles.aiNotice}><strong>Próxima camada: recorte inteligente.</strong> A foto original já entra pelo celular. Vamos conectar o processamento que remove o fundo e mantém somente a roupa real — nada de desenho ou emoji.</p><div className={styles.formGrid}><label>Nome<input value={draftName} onChange={e=>setDraftName(e.target.value)} placeholder="Ex.: Camisa branca"/></label><label>Categoria<select value={draftCategory} onChange={e=>setDraftCategory(e.target.value as Category)}>{categories.filter(c=>c.label!=='Todos').map(c=><option key={c.label}>{c.label}</option>)}</select></label><label>Cor principal<input value={draftColor} onChange={e=>setDraftColor(e.target.value)} placeholder="Ex.: Off-white"/></label></div><button className={styles.savePieceButton} onClick={savePiece}>Guardar no meu closet</button></>}
 {sheet==='occasion'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Montar look</span><h3>Para onde você vai?</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>Vou considerar a ocasião junto com o seu estilo e as peças que você tem.</p><div className={styles.occasionGrid}>{occasions.map(([name,desc])=><button key={name} className={selectedOccasion===name?styles.occasionActive:''} onClick={()=>setSelectedOccasion(name)}><strong>{name}</strong><small>{desc}</small></button>)}</div><button className={styles.savePieceButton} disabled={!selectedOccasion} onClick={()=>{setSheet(null);notify(`Montando opções para: ${selectedOccasion}`)}}>Continuar com {selectedOccasion||'a ocasião'}</button></>}
 </aside><div className={`${styles.toast} ${toast?styles.toastVisible:''}`}>{toast}</div></main>
}
