'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import styles from './closet.module.css';
import scanStyles from './scanner.module.css';
import ClosetAuth from './ClosetAuth';
import { ClosetSession, loadClosetItems, restoreClosetSession, saveClosetItem } from './supabase';

type Category='Todos'|'Blusas'|'Calças'|'Vestidos'|'Calçados'|'Bolsas'|'Acessórios';
type Sheet='add'|'scan'|'scanReject'|'edit'|'occasion'|'wardrobe'|'closetStatus'|'auth'|'avatar'|null;
type Box={x:number;y:number;width:number;height:number};
type ScanItem={name:string;category:Exclude<Category,'Todos'>;color:string;subcategory:string;pattern:string;style:string;brand?:string;label_text?:string;confidence:number;visibility?:number;box:Box};
type PreparedItem=ScanItem&{image:string};
type Piece={id:string|number;category:Category;name:string;meta:string;image:string};
type ScanPhase='detecting'|'cataloging';

const categories:Category[]=['Todos','Blusas','Calças','Vestidos','Calçados','Bolsas','Acessórios'];
const occasions=[['Igreja','Culto, ensaio ou evento'],['Trabalho','Escritório ou reunião'],['Faculdade','Confortável e estiloso'],['Escola','Prático para o dia'],['Sair','Almoço, shopping ou passeio'],['Encontro','Um pouco mais especial'],['Festa','Aniversário ou comemoração'],['Evento','Ocasião mais arrumada'],['Viagem','Conforto e versatilidade'],['Outro','Conte onde você vai']];
const avatarModels=[
 {id:'m-1',name:'Masculino clássico',hint:'Corpo médio · atlético',glyph:'M'},
 {id:'m-2',name:'Masculino slim',hint:'Corpo mais esguio',glyph:'M'},
 {id:'m-3',name:'Masculino amplo',hint:'Estrutura mais larga',glyph:'M'},
 {id:'f-1',name:'Feminino clássico',hint:'Corpo médio',glyph:'F'},
 {id:'f-2',name:'Feminino slim',hint:'Corpo mais esguio',glyph:'F'},
 {id:'f-3',name:'Feminino curvas',hint:'Corpo com mais curvas',glyph:'F'}
];

async function imageToDataUrl(file:File){
 const original=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file)});
 const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=original});
 const max=1280,scale=Math.min(1,max/Math.max(img.width,img.height));
 const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d')?.drawImage(img,0,0,c.width,c.height);
 return c.toDataURL('image/jpeg',.84);
}

async function cropByBox(image:string,box:Box){
 const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=image});
 const x=Math.max(0,Math.min(1000,box.x))/1000*img.width,y=Math.max(0,Math.min(1000,box.y))/1000*img.height;
 const w=Math.max(1,Math.min(1000-box.x,box.width))/1000*img.width,h=Math.max(1,Math.min(1000-box.y,box.height))/1000*img.height;
 const pad=Math.max(w,h)*.12,sx=Math.max(0,x-pad),sy=Math.max(0,y-pad),sw=Math.min(img.width-sx,w+pad*2),sh=Math.min(img.height-sy,h+pad*2);
 const c=document.createElement('canvas');c.width=Math.max(1,Math.round(sw));c.height=Math.max(1,Math.round(sh));c.getContext('2d')?.drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height);
 return c.toDataURL('image/jpeg',.92);
}

async function catalogizeGarment(image:string,item:ScanItem){
 const r=await fetch('/api/closet/catalogize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,item})});
 const data=await r.json();
 if(!r.ok||!data?.ok||!data?.image)throw new Error(data?.message||'Não consegui criar a versão de catálogo desta peça.');
 return String(data.image);
}

async function makeLookReference(items:Piece[]){
 const sources=await Promise.all(items.slice(0,6).map(p=>new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=reject;img.src=p.image})));
 const c=document.createElement('canvas');c.width=1024;c.height=1024;const ctx=c.getContext('2d');if(!ctx)throw new Error('Não consegui preparar o look.');ctx.fillStyle='#f6f0e7';ctx.fillRect(0,0,1024,1024);
 const cols=2,rows=Math.ceil(sources.length/cols),cellW=512,cellH=1024/Math.max(1,rows);
 sources.forEach((img,i)=>{const col=i%cols,row=Math.floor(i/cols),pad=42,maxW=cellW-pad*2,maxH=cellH-pad*2,scale=Math.min(maxW/img.width,maxH/img.height),w=img.width*scale,h=img.height*scale,x=col*cellW+(cellW-w)/2,y=row*cellH+(cellH-h)/2;ctx.drawImage(img,x,y,w,h)});
 return c.toDataURL('image/png');
}

export default function ClosetPage(){
 const [pieces,setPieces]=useState<Piece[]>([]),[category,setCategory]=useState<Category>('Todos'),[sheet,setSheet]=useState<Sheet>(null),[wardrobeOpen,setWardrobeOpen]=useState(false),[toast,setToast]=useState('');
 const [draftOriginal,setDraftOriginal]=useState(''),[prepared,setPrepared]=useState<PreparedItem[]>([]),[currentIndex,setCurrentIndex]=useState(0),[scanPhase,setScanPhase]=useState<ScanPhase>('detecting'),[scanError,setScanError]=useState(''),[processingText,setProcessingText]=useState('');
 const [draftName,setDraftName]=useState(''),[draftCategory,setDraftCategory]=useState<Category>('Blusas'),[draftColor,setDraftColor]=useState(''),[selectedOccasion,setSelectedOccasion]=useState(''),[lookReady,setLookReady]=useState(false),[liked,setLiked]=useState(false),[selectedSlot,setSelectedSlot]=useState('Peça');
 const [session,setSession]=useState<ClosetSession|null>(null),[authIntent,setAuthIntent]=useState<'account'|'save'>('account'),[saving,setSaving]=useState(false),[sessionReady,setSessionReady]=useState(false);
 const [avatarId,setAvatarId]=useState('m-1'),[tryOnImage,setTryOnImage]=useState(''),[tryOnBusy,setTryOnBusy]=useState(false),[tryOnError,setTryOnError]=useState('');
 const cameraRef=useRef<HTMLInputElement>(null),galleryRef=useRef<HTMLInputElement>(null);
 const filtered=useMemo(()=>pieces.filter(p=>category==='Todos'||p.category===category),[pieces,category]);
 const current=prepared[currentIndex],lookPieces=pieces.slice(0,4);
 const hasTop=pieces.some(p=>p.category==='Blusas'||p.category==='Vestidos'),hasBottom=pieces.some(p=>p.category==='Calças'||p.category==='Vestidos'),hasShoes=pieces.some(p=>p.category==='Calçados'),readyForLook=hasTop&&hasBottom&&hasShoes,readiness=[hasTop,hasBottom,hasShoes].filter(Boolean).length;
 function notify(m:string){setToast(m);window.setTimeout(()=>setToast(''),2600)}
 function loadDraft(i:number,list=prepared){const p=list[i];if(!p)return;setDraftName(p.name);setDraftCategory(p.category);setDraftColor(p.color)}
 function mapDbRows(rows:any[]):Piece[]{return rows.map(r=>({id:r.id,category:r.category as Category,name:r.name,meta:[r.color,r.subcategory,r.pattern].filter(Boolean).join(' · '),image:r.image||''}))}
 async function refreshCloset(s:ClosetSession){try{const rows=await loadClosetItems(s);setPieces(mapDbRows(rows))}catch(e:any){notify(e?.message||'Não consegui carregar seu closet.')}}
 async function handleSessionChange(next:ClosetSession|null){setSession(next);if(next){await refreshCloset(next);notify(authIntent==='save'?'Conta conectada. Sua peça continua aqui ✦':'Bem-vindo ao seu closet ✦')}else{setPieces([]);notify('Você saiu do closet.')}}
 function openAuth(intent:'account'|'save'){setAuthIntent(intent);setSheet('auth')}
 useEffect(()=>{let active=true;(async()=>{const restored=await restoreClosetSession();if(!active)return;if(restored){setSession(restored);await refreshCloset(restored)}setSessionReady(true)})();return()=>{active=false}},[]);
 async function scanPhoto(image:string){
  setSheet('scan');setScanPhase('detecting');setScanError('');setPrepared([]);setCurrentIndex(0);setProcessingText('Procurando todas as peças visíveis');
  try{
   const r=await fetch('/api/closet/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})}),data=await r.json();
   if(!r.ok||!data?.ok)throw new Error(data?.message||'Não consegui analisar esta foto.');
   const items=(data.scan?.items||[]) as ScanItem[];
   if(!items.length){setScanError(data.scan?.reason||'Não encontrei peças válidas.');setSheet('scanReject');return}
   setScanPhase('cataloging');setProcessingText(items.length===1?'Criando sua versão de catálogo':'Criando versões de catálogo em paralelo');
   const ready=new Array<PreparedItem>(items.length);let nextIndex=0,completed=0;
   const worker=async()=>{while(true){const i=nextIndex++;if(i>=items.length)return;const item=items[i];const crop=await cropByBox(image,item.box);const catalogAsset=await catalogizeGarment(crop,item);ready[i]={...item,image:catalogAsset};completed+=1;setProcessingText(items.length===1?'Versão de catálogo pronta':`Preparando em paralelo · ${completed} de ${items.length} prontas`)}};
   const concurrency=Math.min(2,items.length);await Promise.all(Array.from({length:concurrency},()=>worker()));setPrepared(ready);loadDraft(0,ready);setSheet('edit');
  }catch(e:any){setScanError(e?.message||'Falha no scanner.');setSheet('scanReject')}
 }
 async function receivePhoto(e:ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;try{const image=await imageToDataUrl(f);setDraftOriginal(image);await scanPhoto(image)}catch{setScanError('Não consegui preparar esta imagem.');setSheet('scanReject')}e.target.value=''}
 async function saveCurrent(){
  if(!current)return;
  if(!session){openAuth('save');return}
  setSaving(true);
  try{
   const row=await saveClosetItem(session,{name:draftName||current.name,category:draftCategory,color:draftColor,source:current,catalogImage:current.image,originalImage:draftOriginal});
   const item:Piece={id:row.id,category:row.category as Category,name:row.name,meta:[row.color,row.subcategory,row.pattern].filter(Boolean).join(' · '),image:row.image||current.image};
   setPieces(v=>[item,...v.filter(p=>p.id!==item.id)]);
   if(currentIndex<prepared.length-1){const next=currentIndex+1;setCurrentIndex(next);loadDraft(next);notify(`Peça ${currentIndex+1} salva. Próxima!`)}
   else{setSheet(null);setWardrobeOpen(true);notify(`${prepared.length} ${prepared.length===1?'peça salva':'peças salvas'} no closet ✦`);setPrepared([]);setCurrentIndex(0)}
  }catch(e:any){notify(e?.message||'Não consegui guardar esta peça.')}finally{setSaving(false)}
 }
 async function generateTryOn(){
  if(!lookPieces.length)return;setTryOnBusy(true);setTryOnError('');
  try{const image=await makeLookReference(lookPieces);const r=await fetch('/api/closet/try-on',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,avatarId,occasion:selectedOccasion,items:lookPieces.map(p=>({name:p.name,category:p.category,meta:p.meta}))})});const data=await r.json();if(!r.ok||!data?.ok||!data?.image)throw new Error(data?.message||'Não consegui vestir este look.');setTryOnImage(String(data.image))}catch(e:any){setTryOnError(e?.message||'Não consegui vestir este look.')}finally{setTryOnBusy(false)}
 }
 function startLook(){if(!readyForLook){setSheet('closetStatus');return}setSheet('occasion')}
 function openSwap(s:string){setSelectedSlot(s);setSheet('wardrobe')}
 const initials=session?.user?.user_metadata?.name?.split(' ').map((x:string)=>x[0]).join('').slice(0,2).toUpperCase()||session?.user?.email?.slice(0,2).toUpperCase()||'';
 return <main className={styles.page}><section className={styles.appShell}>
  <header className={styles.topbar}><div><span className={styles.eyebrow}>SEU ESTILO, TODOS OS DIAS</span><h1>closet<span>.</span></h1></div><button className={styles.profileButton} aria-label={session?'Abrir minha conta':'Entrar no closet'} onClick={()=>openAuth('account')}>{!sessionReady?'…':session?initials:'◌'}</button></header>
  <section className={styles.hero}><div className={styles.heroCopy}><span className={styles.kicker}>Stylist pessoal</span><h2>Bom dia.<br/>O que vamos vestir?</h2><p>Seu guarda-roupa, seu gosto e a ocasião — combinados de um jeito que fica cada vez mais você.</p><div className={styles.heroActions}><button className={styles.primaryButton} onClick={startLook}><span>✦</span> Montar meu look</button></div></div><div className={styles.wardrobeArt} aria-hidden="true"><div className={styles.wardrobe}><div className={styles.wardrobeTop}>CLOSET</div><div className={styles.wardrobeDoors}><div className={styles.door}/><div className={styles.door}/></div><div className={styles.wardrobeBase}/></div></div></section>
  <section className={styles.quickRow}><button onClick={()=>setSheet('add')}><span>＋</span><strong>Adicionar peça</strong><small>foto, galeria ou look vestido</small></button><button onClick={startLook}><span>✦</span><strong>Montar look</strong><small>{readyForLook?'pela ocasião':`${readiness}/3 para começar`}</small></button></section>
  <section className={styles.section}><div className={styles.sectionHeader}><div><span className={styles.kicker}>Meu guarda-roupa</span><h3>{pieces.length?`${pieces.length} ${pieces.length===1?'peça guardada':'peças guardadas'}`:'Seu closet está vazio'}</h3></div><button className={styles.textButton} onClick={()=>setSheet('add')}>+ Adicionar</button></div><div className={`${styles.closedClosetCard} ${wardrobeOpen?styles.closetOpen:''}`}><div className={styles.closetInterior}><div className={styles.categories}>{categories.map(c=><button key={c} className={`${styles.categoryChip} ${category===c?styles.categoryActive:''}`} onClick={()=>setCategory(c)}>{c}</button>)}</div>{!filtered.length?<div className={styles.emptyCloset}><strong>Seu guarda-roupa começa com uma foto.</strong><p>Você pode fotografar uma peça sozinha ou usar uma foto sua vestido. O scanner transforma cada roupa em um asset de catálogo independente.</p><button onClick={()=>setSheet('add')}>＋ Adicionar</button></div>:<div className={styles.pieceGrid}>{filtered.map(p=><button className={styles.pieceCard} key={p.id}><div className={`${styles.pieceVisual} ${scanStyles.transparentPreview}`}><img src={p.image} alt={p.name}/></div><div className={styles.pieceInfo}><strong>{p.name}</strong><span>{p.meta}</span></div></button>)}</div>}</div><div className={styles.bigClosetDoors}><div className={styles.bigDoorLeft}/><div className={styles.bigDoorRight}/></div><div className={styles.closetFrontCopy}><span className={styles.kicker}>Seu closet</span><strong>{wardrobeOpen?'Guarda-roupa aberto':'Tudo guardado no lugar.'}</strong><small>{wardrobeOpen?'Veja as peças que você já cadastrou.':'As peças só aparecem quando você abrir o guarda-roupa.'}</small><button onClick={()=>setWardrobeOpen(v=>!v)}>{wardrobeOpen?'Fechar guarda-roupa':'Abrir guarda-roupa'}</button></div></div></section>
  <section className={styles.lookSection}><div className={styles.sectionHeader}><div><span className={styles.kicker}>Seu look</span><h3>{lookReady?`Para ${selectedOccasion}`:'Pronto quando você estiver'}</h3></div></div>{!lookReady?<div className={styles.lookPreviewEmpty}><span>✦</span><h4>{readyForLook?'Seu stylist já pode começar.':'Seu primeiro look está quase pronto.'}</h4><p>{readyForLook?'Escolha uma ocasião e eu monto usando o seu closet.':'Basta uma parte de cima, uma parte de baixo e um calçado para testar.'}</p><button onClick={startLook}>{readyForLook?'Montar meu look':'Ver o que falta'}</button></div>:<div className={styles.lookCard}><div className={styles.lookCanvas}>{lookPieces.map((p,i)=><button key={p.id} className={`${styles.lookRealPiece} ${styles['lookPos'+i]}`} onClick={()=>openSwap(p.category)}><img src={p.image} alt={p.name}/></button>)}</div><div className={styles.lookDetails}><p>Montei pensando em <strong>{selectedOccasion.toLowerCase()}</strong>.</p><div className={styles.lookActions}><button onClick={()=>openSwap('Peça')}>↻ Trocar uma peça</button><button onClick={()=>setWardrobeOpen(true)}>▤ Abrir guarda-roupa</button><button onClick={()=>{setTryOnError('');setSheet('avatar')}}>♙ Ver vestido</button><button className={liked?styles.liked:''} onClick={()=>setLiked(v=>!v)}>{liked?'♥':'♡'} {liked?'Amei':'Gostei'}</button></div></div></div>}</section>
  <nav className={styles.bottomNav}><button className={styles.navActive}><span>⌂</span>Início</button><button onClick={()=>setWardrobeOpen(true)}><span>♢</span>Closet</button><button className={styles.fab} onClick={startLook}>✦</button><button><span>▦</span>Looks</button><button><span>◌</span>Loja</button></nav>
 </section>
 <input ref={cameraRef} className={styles.hiddenInput} type="file" accept="image/*" capture="environment" onChange={receivePhoto}/><input ref={galleryRef} className={styles.hiddenInput} type="file" accept="image/*" onChange={receivePhoto}/>
 {sheet&&<button className={styles.scrim} onClick={()=>setSheet(null)}/>}<aside className={`${styles.sheet} ${sheet?styles.sheetOpen:''}`}><div className={styles.sheetHandle}/>
 {sheet==='add'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Cadastro rápido</span><h3>Uma foto pode virar várias peças.</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>Pode fotografar a roupa sozinha ou escolher uma foto sua já vestido. O sistema identifica cada item e cria uma versão limpa de catálogo para o closet.</p><div className={styles.captureGrid}><button onClick={()=>cameraRef.current?.click()}><span>◎</span><strong>Tirar foto</strong><small>usar câmera</small></button><button onClick={()=>galleryRef.current?.click()}><span>▧</span><strong>Escolher foto</strong><small>abrir galeria</small></button></div></>}
 {sheet==='scan'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Scanner do closet</span><h3>{scanPhase==='detecting'?'Analisando seu look...':'Criando peças para o closet...'}</h3></div></div><div className={scanStyles.scanStage}>{draftOriginal&&<img src={draftOriginal} alt="Foto sendo analisada"/>}<div className={scanStyles.scanFrame}><i className={scanStyles.scanCorner}/><i className={scanStyles.scanCorner}/><i className={scanStyles.scanCorner}/><i className={scanStyles.scanCorner}/><i className={scanStyles.scanLine}/></div></div><div className={scanStyles.scanCopy}><strong>{processingText}</strong><p>{scanPhase==='detecting'?'Estou identificando cada roupa visível e seus detalhes.':'As peças válidas estão sendo preparadas em paralelo, mantendo a mesma qualidade e fidelidade do catálogo.'}</p><div className={scanStyles.scanDots}><i/><i/><i/></div></div></>}
 {sheet==='scanReject'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Scanner do closet</span><h3>Não consegui preparar as peças.</h3></div><button onClick={()=>setSheet(null)}>×</button></div><div className={scanStyles.rejectCard}><strong>Tente outra foto.</strong><p>{scanError||'Deixe as roupas mais visíveis e com boa iluminação.'}</p></div><div className={scanStyles.retryGrid}><button onClick={()=>cameraRef.current?.click()}>Tirar outra foto</button><button onClick={()=>galleryRef.current?.click()}>Galeria</button></div></>}
 {sheet==='edit'&&current&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>{prepared.length>1?`${prepared.length} peças identificadas · ${currentIndex+1} de ${prepared.length}`:'Peça de catálogo pronta'}</span><h3>{currentIndex===0?'Confira e guarde':'Próxima peça'}</h3></div><button onClick={()=>setSheet(null)}>×</button></div>{prepared.length>1&&<div style={{display:'flex',gap:8,overflowX:'auto',padding:'8px 0 12px'}}>{prepared.map((p,i)=><button key={i} onClick={()=>{setCurrentIndex(i);loadDraft(i)}} style={{flex:'0 0 72px',height:86,border:i===currentIndex?'2px solid #211b17':'1px solid #ddd0c2',borderRadius:14,background:'#f4ecdf',padding:5}}><img src={p.image} alt={p.name} style={{width:'100%',height:'100%',objectFit:'contain'}}/></button>)}</div>}<div className={`${styles.editorPreview} ${scanStyles.transparentPreview}`}><img src={current.image} alt={current.name}/><span className={scanStyles.detectedBadge}>✓ versão de catálogo</span></div><div className={styles.formGrid}><label>Nome<input value={draftName} onChange={e=>setDraftName(e.target.value)}/></label><label>Categoria<select value={draftCategory} onChange={e=>setDraftCategory(e.target.value as Category)}>{categories.filter(c=>c!=='Todos').map(c=><option key={c}>{c}</option>)}</select></label><label>Cor principal<input value={draftColor} onChange={e=>setDraftColor(e.target.value)}/></label></div><button className={styles.savePieceButton} disabled={saving} onClick={saveCurrent}>{saving?'Guardando...':currentIndex<prepared.length-1?'Guardar e ver próxima →':'Guardar no meu closet'}</button><button className={scanStyles.secondaryAction} onClick={()=>setSheet('add')}>Usar outra foto</button></>}
 {sheet==='auth'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>{session?'Minha conta':authIntent==='save'?'Salve seu progresso':'Sua conta'}</span><h3>{session?'Conta e sincronização':authIntent==='save'?'Guarde esta peça na nuvem':'Entre no seu closet'}</h3></div><button onClick={()=>setSheet(authIntent==='save'&&current?'edit':null)}>×</button></div><ClosetAuth session={session} intent={authIntent} onClose={()=>setSheet(authIntent==='save'&&current?'edit':null)} onSessionChange={handleSessionChange}/></>}
 {sheet==='avatar'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Visualização do look</span><h3>Veja vestido no modelo</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>Escolha um manequim padrão. Vou vestir nele exatamente as peças deste look, sem alterar seu closet.</p>{tryOnImage?<><div style={{borderRadius:28,overflow:'hidden',background:'#eee5d8',margin:'8px 0 18px',minHeight:360,display:'grid',placeItems:'center'}}><img src={tryOnImage} alt="Look vestido no modelo" style={{width:'100%',display:'block'}}/></div><button className={styles.savePieceButton} onClick={()=>setTryOnImage('')}>Ver em outro modelo</button></>:<><div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10,margin:'12px 0 18px'}}>{avatarModels.map(a=><button key={a.id} onClick={()=>setAvatarId(a.id)} style={{textAlign:'left',padding:14,borderRadius:18,border:avatarId===a.id?'2px solid #211b17':'1px solid #dfd0be',background:avatarId===a.id?'#efe2d0':'#fffaf2',color:'#2b241f'}}><span style={{width:38,height:38,borderRadius:14,display:'grid',placeItems:'center',background:'#211b17',color:'#fff',fontWeight:800,marginBottom:10}}>{a.glyph}</span><strong style={{display:'block',fontSize:15}}>{a.name}</strong><small style={{opacity:.68}}>{a.hint}</small></button>)}</div>{tryOnError&&<p style={{padding:'12px 14px',borderRadius:14,background:'#f3e1dc',color:'#6d3028'}}>{tryOnError}</p>}<button className={styles.savePieceButton} disabled={tryOnBusy} onClick={generateTryOn}>{tryOnBusy?'Vestindo seu look...':'✦ Ver este look vestido'}</button><p style={{textAlign:'center',fontSize:13,opacity:.62,marginTop:10}}>A visualização pode levar alguns segundos porque preserva as peças em alta qualidade.</p></>}</>}
 {sheet==='closetStatus'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Primeiro look</span><h3>Seu stylist está pronto.</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>Você precisa de parte de cima, parte de baixo e calçado.</p><button className={styles.savePieceButton} onClick={()=>setSheet('add')}>Adicionar peças</button></>}
 {sheet==='occasion'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Montar look</span><h3>Para onde você vai?</h3></div><button onClick={()=>setSheet(null)}>×</button></div><div className={styles.occasionGrid}>{occasions.map(([n,d])=><button key={n} className={selectedOccasion===n?styles.occasionActive:''} onClick={()=>setSelectedOccasion(n)}><strong>{n}</strong><small>{d}</small></button>)}</div><button className={styles.savePieceButton} disabled={!selectedOccasion} onClick={()=>{setLookReady(true);setTryOnImage('');setSheet(null)}}>Montar look</button></>}
 {sheet==='wardrobe'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Trocar peça</span><h3>{selectedSlot}</h3></div><button onClick={()=>setSheet(null)}>×</button></div><div className={styles.swapGrid}>{pieces.slice(0,6).map(p=><button key={p.id}><img src={p.image} alt={p.name}/><strong>{p.name}</strong></button>)}</div></>}
 </aside><div className={`${styles.toast} ${toast?styles.toastVisible:''}`}>{toast}</div></main>
}
