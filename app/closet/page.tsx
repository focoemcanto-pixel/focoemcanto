'use client';

import { ChangeEvent, useMemo, useRef, useState } from 'react';
import styles from './closet.module.css';
import scanStyles from './scanner.module.css';

type Category = 'Todos' | 'Blusas' | 'Calças' | 'Vestidos' | 'Calçados' | 'Bolsas' | 'Acessórios';
type Sheet = 'add' | 'scan' | 'scanReject' | 'edit' | 'occasion' | 'wardrobe' | 'closetStatus' | null;
type Piece = { id:number; category:Category; name:string; meta:string; tone:string; image?:string };
type ScanResult = { valid:boolean; reason:string; name:string; category:Exclude<Category,'Todos'>|''; color:string; subcategory:string; pattern:string; style:string; confidence:number };
type ScanPhase = 'detecting' | 'cutting';

const categories: Category[] = ['Todos','Blusas','Calças','Vestidos','Calçados','Bolsas','Acessórios'];
const occasions = [
 ['Igreja','Culto, ensaio ou evento'],['Trabalho','Escritório ou reunião'],['Faculdade','Confortável e estiloso'],['Escola','Prático para o dia'],['Sair','Almoço, shopping ou passeio'],['Encontro','Um pouco mais especial'],['Festa','Aniversário ou comemoração'],['Evento','Ocasião mais arrumada'],['Viagem','Conforto e versatilidade'],['Outro','Conte onde você vai']
];

async function imageToDataUrl(file: File) {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image(); el.onload = () => resolve(el); el.onerror = reject; el.src = original;
  });
  const max = 1280; const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .82);
}

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob);
  });
}

async function isolateGarment(file: File) {
  const mod = await import('@imgly/background-removal');
  const output = await mod.removeBackground(file, { output: { format: 'image/png', quality: 1 } });
  return await blobToDataUrl(output);
}

export default function ClosetPage(){
 const [category,setCategory]=useState<Category>('Todos');
 const [pieces,setPieces]=useState<Piece[]>([]);
 const [sheet,setSheet]=useState<Sheet>(null);
 const [toast,setToast]=useState('');
 const [wardrobeOpen,setWardrobeOpen]=useState(false);
 const [lookReady,setLookReady]=useState(false);
 const [liked,setLiked]=useState(false);
 const [draftImage,setDraftImage]=useState('');
 const [draftOriginal,setDraftOriginal]=useState('');
 const [draftName,setDraftName]=useState('');
 const [draftCategory,setDraftCategory]=useState<Category>('Blusas');
 const [draftColor,setDraftColor]=useState('');
 const [scanResult,setScanResult]=useState<ScanResult|null>(null);
 const [scanError,setScanError]=useState('');
 const [scanPhase,setScanPhase]=useState<ScanPhase>('detecting');
 const [selectedOccasion,setSelectedOccasion]=useState('');
 const [selectedSlot,setSelectedSlot]=useState('Peça');
 const cameraRef=useRef<HTMLInputElement>(null); const galleryRef=useRef<HTMLInputElement>(null);
 const filtered=useMemo(()=>pieces.filter(p=>category==='Todos'||p.category===category),[category,pieces]);
 const hasTop=pieces.some(p=>p.category==='Blusas'||p.category==='Vestidos');
 const hasBottom=pieces.some(p=>p.category==='Calças'||p.category==='Vestidos');
 const hasShoes=pieces.some(p=>p.category==='Calçados');
 const readyForLook=hasTop&&hasBottom&&hasShoes;
 const readiness=[hasTop,hasBottom,hasShoes].filter(Boolean).length;
 const lookPieces=pieces.slice(0,4);
 function notify(m:string){setToast(m);window.setTimeout(()=>setToast(''),2200)}
 async function scanPhoto(image:string,file:File){
   setSheet('scan'); setScanPhase('detecting'); setScanError(''); setScanResult(null);
   try {
     const response=await fetch('/api/closet/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})});
     const data=await response.json();
     if(!response.ok||!data?.ok) throw new Error(data?.message||'Não consegui analisar esta foto.');
     const result=data.scan as ScanResult; setScanResult(result);
     if(!result.valid){setSheet('scanReject');return;}
     setDraftName(result.name||'Nova peça'); setDraftCategory((result.category||'Blusas') as Category); setDraftColor(result.color||'');
     setScanPhase('cutting');
     try {
       const cutout=await isolateGarment(file);
       setDraftImage(cutout);
       setSheet('edit');
     } catch {
       setScanError('Reconheci a peça, mas não consegui remover o fundo. Tente uma foto com a roupa mais inteira e separada do corpo ou do cenário.');
       setSheet('scanReject');
     }
   } catch(error:any){setScanError(error?.message||'Falha no scanner.'); setSheet('scanReject');}
 }
 async function receivePhoto(e:ChangeEvent<HTMLInputElement>){
   const file=e.target.files?.[0]; if(!file)return;
   try{const image=await imageToDataUrl(file); setDraftOriginal(image); setDraftImage(image); await scanPhoto(image,file);}catch{setScanError('Não consegui preparar esta imagem. Tente outra foto.');setSheet('scanReject');}
   e.target.value='';
 }
 function savePiece(){const item:Piece={id:Date.now(),category:draftCategory,name:draftName||'Minha peça',meta:[draftColor,scanResult?.subcategory,scanResult?.pattern].filter(Boolean).join(' · '),tone:'#eee7dc',image:draftImage};setPieces(v=>[item,...v]);setSheet(null);setWardrobeOpen(true);notify('Peça recortada e guardada no seu closet ✦');}
 function startLook(){if(!readyForLook){setSheet('closetStatus');return;}setSheet('occasion');}
 function openSwap(label:string){setSelectedSlot(label);setSheet('wardrobe');}
 return <main className={styles.page}><section className={styles.appShell}>
  <header className={styles.topbar}><div><span className={styles.eyebrow}>SEU ESTILO, TODOS OS DIAS</span><h1>closet<span>.</span></h1></div><button className={styles.profileButton}>MC</button></header>
  <section className={styles.hero}><div className={styles.heroCopy}><span className={styles.kicker}>Stylist pessoal</span><h2>Bom dia.<br/>O que vamos vestir?</h2><p>Seu guarda-roupa, seu gosto e a ocasião — combinados de um jeito que fica cada vez mais você.</p><div className={styles.heroActions}><button className={styles.primaryButton} onClick={startLook}><span>✦</span> Montar meu look</button></div></div><div className={styles.wardrobeArt} aria-hidden="true"><div className={styles.wardrobe}><div className={styles.wardrobeTop}>CLOSET</div><div className={styles.wardrobeDoors}><div className={styles.door}><span/></div><div className={styles.door}><span/></div></div><div className={styles.wardrobeBase}/></div></div></section>
  <section className={styles.quickRow}><button onClick={()=>setSheet('add')}><span>＋</span><strong>Adicionar peça</strong><small>foto ou galeria</small></button><button onClick={startLook}><span>✦</span><strong>Montar look</strong><small>{readyForLook?'pela ocasião':`${readiness}/3 para começar`}</small></button></section>

  <section className={styles.section}><div className={styles.sectionHeader}><div><span className={styles.kicker}>Meu guarda-roupa</span><h3>{pieces.length?`${pieces.length} ${pieces.length===1?'peça guardada':'peças guardadas'}`:'Seu closet está vazio'}</h3></div><button className={styles.textButton} onClick={()=>setSheet('add')}>+ Adicionar</button></div>
   <div className={`${styles.closedClosetCard} ${wardrobeOpen?styles.closetOpen:''}`}>
    <div className={styles.closetInterior}><div className={styles.categories}>{categories.map(i=><button key={i} className={`${styles.categoryChip} ${category===i?styles.categoryActive:''}`} onClick={()=>setCategory(i)}>{i}</button>)}</div>{!filtered.length?<div className={styles.emptyCloset}><strong>{pieces.length?'Nenhuma peça nesta categoria':'Seu guarda-roupa começa com a primeira foto.'}</strong><p>Adicione uma peça e ela ficará organizada aqui, pronta para entrar nos looks.</p><button onClick={()=>setSheet('add')}>＋ Adicionar peça</button></div>:<div className={styles.pieceGrid}>{filtered.map(p=><button className={styles.pieceCard} key={p.id} onClick={()=>{setDraftImage(p.image||'');setDraftName(p.name);setDraftCategory(p.category);setSheet('edit')}}><div className={`${styles.pieceVisual} ${scanStyles.transparentPreview}`}>{p.image&&<img src={p.image} alt={p.name}/>}</div><div className={styles.pieceInfo}><strong>{p.name}</strong><span>{p.meta}</span></div></button>)}</div>}</div>
    <div className={styles.bigClosetDoors} aria-hidden={wardrobeOpen}><div className={styles.bigDoorLeft}/><div className={styles.bigDoorRight}/></div>
    <div className={styles.closetFrontCopy}><span className={styles.kicker}>Seu closet</span><strong>{wardrobeOpen?'Guarda-roupa aberto':'Tudo guardado no lugar.'}</strong><small>{wardrobeOpen?'Escolha, edite ou adicione novas peças.':'As peças só aparecem quando você abrir o guarda-roupa.'}</small><button onClick={()=>setWardrobeOpen(v=>!v)}>{wardrobeOpen?'Fechar guarda-roupa':'Abrir guarda-roupa'}</button></div>
   </div>
  </section>

  <section className={styles.lookSection}><div className={styles.sectionHeader}><div><span className={styles.kicker}>Seu look</span><h3>{lookReady?`Para ${selectedOccasion}`:'Pronto quando você estiver'}</h3></div>{lookReady&&<span className={styles.match}>96% match</span>}</div>
   {!lookReady?<div className={styles.lookPreviewEmpty}><span>✦</span><h4>{readyForLook?'Seu stylist já pode começar.':'Seu primeiro look está quase pronto.'}</h4><p>{readyForLook?'Escolha uma ocasião e eu monto usando o que está guardado no seu closet.':'Você não precisa cadastrar tudo. Basta uma parte de cima, uma parte de baixo e um calçado para testar a primeira combinação.'}</p><button onClick={startLook}>{readyForLook?'Montar meu look':'Ver o que falta'}</button></div>:
   <div className={styles.lookCard}><div className={styles.lookCanvas}>{lookPieces.map((p,i)=><button key={p.id} className={`${styles.lookRealPiece} ${styles['lookPos'+i]}`} onClick={()=>openSwap(p.category)}>{p.image&&<img src={p.image} alt={p.name}/>}</button>)}<div className={styles.lookHint}>Toque em uma peça para trocar</div></div><div className={styles.lookDetails}><p>Montei essa combinação pensando em <strong>{selectedOccasion.toLowerCase()}</strong> e no que você já tem no seu closet.</p><div className={styles.lookActions}><button onClick={()=>openSwap('Peça')}>↻ <span>Trocar uma peça</span></button><button onClick={()=>{setWardrobeOpen(true);notify('Guarda-roupa aberto')}}>▤ <span>Abrir guarda-roupa</span></button><button className={liked?styles.liked:''} onClick={()=>setLiked(v=>!v)}>{liked?'♥':'♡'} <span>{liked?'Amei':'Gostei'}</span></button></div></div></div>}
  </section>
  <nav className={styles.bottomNav}><button className={styles.navActive}><span>⌂</span>Início</button><button onClick={()=>setWardrobeOpen(true)}><span>♢</span>Closet</button><button className={styles.fab} onClick={startLook}>✦</button><button><span>▦</span>Looks</button><button><span>◌</span>Loja</button></nav>
 </section>
 <input ref={cameraRef} className={styles.hiddenInput} type="file" accept="image/*" capture="environment" onChange={receivePhoto}/><input ref={galleryRef} className={styles.hiddenInput} type="file" accept="image/*" onChange={receivePhoto}/>
 {sheet&&<button className={styles.scrim} aria-label="Fechar" onClick={()=>setSheet(null)}/>}<aside className={`${styles.sheet} ${sheet?styles.sheetOpen:''}`}><div className={styles.sheetHandle}/>
 {sheet==='closetStatus'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Primeiro look</span><h3>{pieces.length?'Seu closet está começando.':'Seu stylist está pronto.'}</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>{pieces.length?'Faltam só algumas bases para eu montar uma combinação que faça sentido.':'Só faltam suas roupas. Você pode começar com três peças e testar o app sem cadastrar o guarda-roupa inteiro.'}</p><div className={`${styles.photoTip} ${scanStyles.contrastCard}`}><span>✦</span><p><strong>{readiness} de 3 para começar</strong>Precisamos apenas das bases do primeiro look.</p></div><div className={styles.formGrid}><div className={`${styles.photoTip} ${scanStyles.contrastCard}`}><span>{hasTop?'✓':'○'}</span><p><strong>Parte de cima {hasTop?'— pronta':''}</strong>Blusa, camisa, camiseta ou vestido.</p></div><div className={`${styles.photoTip} ${scanStyles.contrastCard}`}><span>{hasBottom?'✓':'○'}</span><p><strong>Parte de baixo {hasBottom?'— pronta':''}</strong>Calça, saia, short ou vestido.</p></div><div className={`${styles.photoTip} ${scanStyles.contrastCard}`}><span>{hasShoes?'✓':'○'}</span><p><strong>Calçado {hasShoes?'— pronto':''}</strong>Tênis, sandália, salto ou sapato.</p></div></div><button className={styles.savePieceButton} onClick={()=>setSheet('add')}>Adicionar próxima peça</button><button className={scanStyles.secondaryAction} onClick={()=>{setSheet(null);setWardrobeOpen(true)}}>Abrir meu guarda-roupa</button></>}
 {sheet==='add'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Nova peça</span><h3>Coloque no seu closet</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>Fotografe a roupa ou escolha uma imagem da galeria. O scanner identifica a peça e depois remove o fundo antes de permitir o cadastro.</p><div className={styles.captureGrid}><button onClick={()=>cameraRef.current?.click()}><span>◎</span><strong>Tirar foto</strong><small>usar a câmera</small></button><button onClick={()=>galleryRef.current?.click()}><span>▧</span><strong>Escolher foto</strong><small>abrir galeria</small></button></div><div className={`${styles.photoTip} ${scanStyles.contrastCard}`}><span>✦</span><p><strong>Scanner + recorte automático</strong>O closet guarda a peça isolada, não a foto do ambiente.</p></div></>}
 {sheet==='scan'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Scanner do closet</span><h3>{scanPhase==='detecting'?'Analisando sua peça...':'Preparando para os looks...'}</h3></div></div><div className={scanStyles.scanStage}>{draftOriginal&&<img src={draftOriginal} alt="Foto sendo analisada"/>}<div className={scanStyles.scanFrame}><i className={scanStyles.scanCorner}/><i className={scanStyles.scanCorner}/><i className={scanStyles.scanCorner}/><i className={scanStyles.scanCorner}/><i className={scanStyles.scanLine}/></div></div><div className={scanStyles.scanCopy}><strong>{scanPhase==='detecting'?'Procurando uma peça de roupa':'Removendo fundo e cenário'}</strong><p>{scanPhase==='detecting'?'Estou identificando o item, a categoria, a cor e se a foto serve para entrar no seu guarda-roupa.':'A peça foi reconhecida. Agora estou isolando somente a roupa real para ela poder compor seus looks.'}</p><div className={scanStyles.scanDots}><i/><i/><i/></div></div></>}
 {sheet==='scanReject'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Scanner do closet</span><h3>Essa foto não entrou.</h3></div><button onClick={()=>setSheet(null)}>×</button></div><div className={scanStyles.rejectCard}><div className={scanStyles.rejectIcon}>⌁</div><strong>{scanResult?.valid?'Não consegui recortar essa peça.':'Não encontrei uma peça válida.'}</strong><p>{scanError||scanResult?.reason||'Tente fotografar uma roupa, calçado, bolsa ou acessório de moda de forma mais clara.'}</p></div><div className={scanStyles.retryGrid}><button onClick={()=>cameraRef.current?.click()}>Tirar outra foto</button><button onClick={()=>galleryRef.current?.click()}>Escolher da galeria</button></div></>}
 {sheet==='edit'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Peça pronta</span><h3>Confira antes de guardar</h3></div><button onClick={()=>setSheet(null)}>×</button></div><div className={`${styles.editorPreview} ${scanStyles.transparentPreview}`}>{draftImage&&<img src={draftImage} alt="Peça recortada"/>}<span className={scanStyles.detectedBadge}>✓ fundo removido</span></div>{scanResult&&<div className={scanStyles.scanMeta}><div><span>Tipo</span><strong>{scanResult.subcategory||draftName}</strong></div><div><span>Estilo</span><strong>{scanResult.style||'Não definido'}</strong></div></div>}<div className={scanStyles.cutoutNote}><span>✦</span><p><strong>Pronta para montar looks</strong>Essa é a peça real da sua foto, isolada do cenário e salva com transparência.</p></div><div className={styles.formGrid}><label>Nome<input value={draftName} onChange={e=>setDraftName(e.target.value)} placeholder="Ex.: Camisa branca"/></label><label>Categoria<select value={draftCategory} onChange={e=>setDraftCategory(e.target.value as Category)}>{categories.filter(c=>c!=='Todos').map(c=><option key={c}>{c}</option>)}</select></label><label>Cor principal<input value={draftColor} onChange={e=>setDraftColor(e.target.value)} placeholder="Ex.: Off-white"/></label></div><button className={styles.savePieceButton} onClick={savePiece}>Guardar no meu closet</button><button className={scanStyles.secondaryAction} onClick={()=>setSheet('add')}>Usar outra foto</button></>}
 {sheet==='occasion'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Montar look</span><h3>Para onde você vai?</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>A ocasião entra junto com seu estilo e seu histórico de escolhas.</p><div className={styles.occasionGrid}>{occasions.map(([name,desc])=><button key={name} className={selectedOccasion===name?styles.occasionActive:''} onClick={()=>setSelectedOccasion(name)}><strong>{name}</strong><small>{desc}</small></button>)}</div><button className={styles.savePieceButton} disabled={!selectedOccasion} onClick={()=>{setLookReady(true);setSheet(null);notify('Look montado ✦')}}>Montar para {selectedOccasion||'essa ocasião'}</button></>}
 {sheet==='wardrobe'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Trocar no look</span><h3>{selectedSlot}</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>Primeiro aparecem as opções que combinam melhor. Você também pode abrir o guarda-roupa inteiro.</p><div className={styles.swapGrid}>{pieces.slice(0,6).map(p=><button key={p.id} onClick={()=>{setSheet(null);notify(`${p.name} entrou no look`)}}>{p.image&&<img src={p.image} alt={p.name}/>}<strong>{p.name}</strong><small>{p.meta}</small></button>)}</div><button className={styles.openClosetButton} onClick={()=>{setSheet(null);setWardrobeOpen(true)}}>Abrir meu guarda-roupa</button></>}
 </aside><div className={`${styles.toast} ${toast?styles.toastVisible:''}`}>{toast}</div></main>
}
