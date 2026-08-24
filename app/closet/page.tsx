'use client';

import { ChangeEvent, useMemo, useRef, useState } from 'react';
import styles from './closet.module.css';

type Category = 'Todos' | 'Blusas' | 'Calças' | 'Vestidos' | 'Calçados' | 'Bolsas' | 'Acessórios';
type Sheet = 'add' | 'edit' | 'occasion' | 'wardrobe' | null;
type Piece = { id:number; category:Category; name:string; meta:string; tone:string; image?:string };

const categories: Category[] = ['Todos','Blusas','Calças','Vestidos','Calçados','Bolsas','Acessórios'];
const occasions = [
  ['Igreja','Culto, ensaio ou evento'],['Trabalho','Escritório ou reunião'],['Faculdade','Confortável e estiloso'],['Escola','Prático para o dia'],['Sair','Almoço, shopping ou passeio'],['Encontro','Um pouco mais especial'],['Festa','Aniversário ou comemoração'],['Evento','Ocasião mais arrumada'],['Viagem','Conforto e versatilidade'],['Outro','Conte onde você vai']
];

export default function ClosetPage(){
 const [category,setCategory]=useState<Category>('Todos');
 const [pieces,setPieces]=useState<Piece[]>([]);
 const [sheet,setSheet]=useState<Sheet>(null);
 const [toast,setToast]=useState('');
 const [wardrobeOpen,setWardrobeOpen]=useState(false);
 const [lookReady,setLookReady]=useState(false);
 const [liked,setLiked]=useState(false);
 const [draftImage,setDraftImage]=useState('');
 const [draftName,setDraftName]=useState('');
 const [draftCategory,setDraftCategory]=useState<Category>('Blusas');
 const [draftColor,setDraftColor]=useState('');
 const [selectedOccasion,setSelectedOccasion]=useState('');
 const [selectedSlot,setSelectedSlot]=useState('Peça');
 const cameraRef=useRef<HTMLInputElement>(null); const galleryRef=useRef<HTMLInputElement>(null);
 const filtered=useMemo(()=>pieces.filter(p=>category==='Todos'||p.category===category),[category,pieces]);
 const lookPieces=pieces.slice(0,4);
 function notify(m:string){setToast(m);window.setTimeout(()=>setToast(''),2200)}
 function receivePhoto(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;const url=URL.createObjectURL(file);setDraftImage(url);setDraftName('Nova peça');setDraftCategory('Blusas');setDraftColor('');setSheet('edit');}
 function savePiece(){const item:Piece={id:Date.now(),category:draftCategory,name:draftName||'Minha peça',meta:[draftColor,'Adicionada agora'].filter(Boolean).join(' · '),tone:'#eee7dc',image:draftImage};setPieces(v=>[item,...v]);setSheet(null);setWardrobeOpen(true);notify('Peça guardada no seu closet ✦');}
 function startLook(){if(!pieces.length){setSheet('add');return;}setSheet('occasion');}
 function openSwap(label:string){setSelectedSlot(label);setSheet('wardrobe');}
 return <main className={styles.page}><section className={styles.appShell}>
  <header className={styles.topbar}><div><span className={styles.eyebrow}>SEU ESTILO, TODOS OS DIAS</span><h1>closet<span>.</span></h1></div><button className={styles.profileButton}>MC</button></header>
  <section className={styles.hero}><div className={styles.heroCopy}><span className={styles.kicker}>Stylist pessoal</span><h2>Bom dia.<br/>O que vamos vestir?</h2><p>Seu guarda-roupa, seu gosto e a ocasião — combinados de um jeito que fica cada vez mais você.</p><div className={styles.heroActions}><button className={styles.primaryButton} onClick={startLook}><span>✦</span> Montar meu look</button></div></div><div className={styles.wardrobeArt} aria-hidden="true"><div className={styles.wardrobe}><div className={styles.wardrobeTop}>CLOSET</div><div className={styles.wardrobeDoors}><div className={styles.door}><span/></div><div className={styles.door}><span/></div></div><div className={styles.wardrobeBase}/></div></div></section>
  <section className={styles.quickRow}><button onClick={()=>setSheet('add')}><span>＋</span><strong>Adicionar peça</strong><small>foto ou galeria</small></button><button onClick={startLook}><span>✦</span><strong>Montar look</strong><small>pela ocasião</small></button></section>

  <section className={styles.section}><div className={styles.sectionHeader}><div><span className={styles.kicker}>Meu guarda-roupa</span><h3>{pieces.length?`${pieces.length} ${pieces.length===1?'peça guardada':'peças guardadas'}`:'Seu closet está vazio'}</h3></div><button className={styles.textButton} onClick={()=>setSheet('add')}>+ Adicionar</button></div>
   <div className={`${styles.closedClosetCard} ${wardrobeOpen?styles.closetOpen:''}`}>
    <div className={styles.closetInterior}>
      <div className={styles.categories}>{categories.map(i=><button key={i} className={`${styles.categoryChip} ${category===i?styles.categoryActive:''}`} onClick={()=>setCategory(i)}>{i}</button>)}</div>
      {!filtered.length?<div className={styles.emptyCloset}><strong>{pieces.length?'Nenhuma peça nesta categoria':'Seu guarda-roupa começa com a primeira foto.'}</strong><p>Adicione uma peça e ela ficará organizada aqui, pronta para entrar nos looks.</p><button onClick={()=>setSheet('add')}>＋ Adicionar peça</button></div>:<div className={styles.pieceGrid}>{filtered.map(p=><button className={styles.pieceCard} key={p.id} onClick={()=>{setDraftImage(p.image||'');setDraftName(p.name);setDraftCategory(p.category);setSheet('edit')}}><div className={styles.pieceVisual}>{p.image&&<img src={p.image} alt={p.name}/>}</div><div className={styles.pieceInfo}><strong>{p.name}</strong><span>{p.meta}</span></div></button>)}</div>}
    </div>
    <div className={styles.bigClosetDoors} aria-hidden={wardrobeOpen}><div className={styles.bigDoorLeft}/><div className={styles.bigDoorRight}/></div>
    <div className={styles.closetFrontCopy}><span className={styles.kicker}>Seu closet</span><strong>{wardrobeOpen?'Guarda-roupa aberto':'Tudo guardado no lugar.'}</strong><small>{wardrobeOpen?'Escolha, edite ou adicione novas peças.':'As peças só aparecem quando você abrir o guarda-roupa.'}</small><button onClick={()=>setWardrobeOpen(v=>!v)}>{wardrobeOpen?'Fechar guarda-roupa':'Abrir guarda-roupa'}</button></div>
   </div>
  </section>

  <section className={styles.lookSection}><div className={styles.sectionHeader}><div><span className={styles.kicker}>Seu look</span><h3>{lookReady?`Para ${selectedOccasion}`:'Pronto quando você estiver'}</h3></div>{lookReady&&<span className={styles.match}>96% match</span>}</div>
   {!lookReady?<div className={styles.lookPreviewEmpty}><span>✦</span><h4>Nada de catálogo aberto aqui.</h4><p>Você escolhe a ocasião e eu trago o look pronto. O guarda-roupa fica fechado até você querer mexer em alguma peça.</p><button onClick={startLook}>Montar meu look</button></div>:
   <div className={styles.lookCard}><div className={styles.lookCanvas}>{lookPieces.map((p,i)=><button key={p.id} className={`${styles.lookRealPiece} ${styles['lookPos'+i]}`} onClick={()=>openSwap(p.category)}>{p.image&&<img src={p.image} alt={p.name}/>}</button>)}<div className={styles.lookHint}>Toque em uma peça para trocar</div></div><div className={styles.lookDetails}><p>Montei essa combinação pensando em <strong>{selectedOccasion.toLowerCase()}</strong> e no que você já tem no seu closet.</p><div className={styles.lookActions}><button onClick={()=>openSwap('Peça')}>↻ <span>Trocar uma peça</span></button><button onClick={()=>{setWardrobeOpen(true);notify('Guarda-roupa aberto')}}>▤ <span>Abrir guarda-roupa</span></button><button className={liked?styles.liked:''} onClick={()=>setLiked(v=>!v)}>{liked?'♥':'♡'} <span>{liked?'Amei':'Gostei'}</span></button></div></div></div>}
  </section>
  <nav className={styles.bottomNav}><button className={styles.navActive}><span>⌂</span>Início</button><button onClick={()=>setWardrobeOpen(true)}><span>♢</span>Closet</button><button className={styles.fab} onClick={startLook}>✦</button><button><span>▦</span>Looks</button><button><span>◌</span>Loja</button></nav>
 </section>
 <input ref={cameraRef} className={styles.hiddenInput} type="file" accept="image/*" capture="environment" onChange={receivePhoto}/><input ref={galleryRef} className={styles.hiddenInput} type="file" accept="image/*" onChange={receivePhoto}/>
 {sheet&&<button className={styles.scrim} aria-label="Fechar" onClick={()=>setSheet(null)}/>}<aside className={`${styles.sheet} ${sheet?styles.sheetOpen:''}`}><div className={styles.sheetHandle}/>
 {sheet==='add'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Nova peça</span><h3>Coloque no seu closet</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>Fotografe a roupa ou escolha uma imagem da galeria.</p><div className={styles.captureGrid}><button onClick={()=>cameraRef.current?.click()}><span>◎</span><strong>Tirar foto</strong><small>usar a câmera</small></button><button onClick={()=>galleryRef.current?.click()}><span>▧</span><strong>Escolher foto</strong><small>abrir galeria</small></button></div><div className={styles.photoTip}><span>✦</span><p><strong>Uma peça por foto</strong>Depois o processamento recorta e prepara a roupa real para os looks.</p></div></>}
 {sheet==='edit'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Preparar peça</span><h3>Confira antes de guardar</h3></div><button onClick={()=>setSheet(null)}>×</button></div><div className={styles.editorPreview}>{draftImage&&<img src={draftImage} alt="Peça enviada"/>}<span className={styles.processingBadge}>✦ foto recebida</span></div><div className={styles.formGrid}><label>Nome<input value={draftName} onChange={e=>setDraftName(e.target.value)} placeholder="Ex.: Camisa branca"/></label><label>Categoria<select value={draftCategory} onChange={e=>setDraftCategory(e.target.value as Category)}>{categories.filter(c=>c!=='Todos').map(c=><option key={c}>{c}</option>)}</select></label><label>Cor principal<input value={draftColor} onChange={e=>setDraftColor(e.target.value)} placeholder="Ex.: Off-white"/></label></div><button className={styles.savePieceButton} onClick={savePiece}>Guardar no meu closet</button></>}
 {sheet==='occasion'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Montar look</span><h3>Para onde você vai?</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>A ocasião entra junto com seu estilo e seu histórico de escolhas.</p><div className={styles.occasionGrid}>{occasions.map(([name,desc])=><button key={name} className={selectedOccasion===name?styles.occasionActive:''} onClick={()=>setSelectedOccasion(name)}><strong>{name}</strong><small>{desc}</small></button>)}</div><button className={styles.savePieceButton} disabled={!selectedOccasion} onClick={()=>{setLookReady(true);setSheet(null);notify('Look montado ✦')}}>Montar para {selectedOccasion||'essa ocasião'}</button></>}
 {sheet==='wardrobe'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Trocar no look</span><h3>{selectedSlot}</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>Primeiro aparecem as opções que combinam melhor. Você também pode abrir o guarda-roupa inteiro.</p><div className={styles.swapGrid}>{pieces.slice(0,6).map(p=><button key={p.id} onClick={()=>{setSheet(null);notify(`${p.name} entrou no look`)}}>{p.image&&<img src={p.image} alt={p.name}/>}<strong>{p.name}</strong><small>{p.meta}</small></button>)}</div><button className={styles.openClosetButton} onClick={()=>{setSheet(null);setWardrobeOpen(true)}}>Abrir meu guarda-roupa</button></>}
 </aside><div className={`${styles.toast} ${toast?styles.toastVisible:''}`}>{toast}</div></main>
}
