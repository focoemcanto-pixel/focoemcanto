'use client';

import { ChangeEvent, useMemo, useRef, useState } from 'react';
import styles from './closet.module.css';
import scanStyles from './scanner.module.css';

type Category = 'Todos'|'Blusas'|'Calças'|'Vestidos'|'Calçados'|'Bolsas'|'Acessórios';
type Sheet = 'add'|'scan'|'scanReject'|'edit'|'occasion'|'wardrobe'|'closetStatus'|null;
type Box = {x:number;y:number;width:number;height:number};
type ScanItem = {name:string;category:Exclude<Category,'Todos'>;color:string;subcategory:string;pattern:string;style:string;confidence:number;box:Box};
type PreparedItem = ScanItem & {image:string};
type Piece = {id:number;category:Category;name:string;meta:string;image:string};
type ScanPhase = 'detecting'|'cutting'|'aligning';

const categories:Category[]=['Todos','Blusas','Calças','Vestidos','Calçados','Bolsas','Acessórios'];
const occasions=[['Igreja','Culto, ensaio ou evento'],['Trabalho','Escritório ou reunião'],['Faculdade','Confortável e estiloso'],['Escola','Prático para o dia'],['Sair','Almoço, shopping ou passeio'],['Encontro','Um pouco mais especial'],['Festa','Aniversário ou comemoração'],['Evento','Ocasião mais arrumada'],['Viagem','Conforto e versatilidade'],['Outro','Conte onde você vai']];

async function imageToDataUrl(file:File){
 const original=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file)});
 const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=original});
 const max=1280,scale=Math.min(1,max/Math.max(img.width,img.height));
 const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d')?.drawImage(img,0,0,c.width,c.height);
 return c.toDataURL('image/jpeg',.84);
}
async function blobToDataUrl(blob:Blob){return await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob)})}
async function cropByBox(image:string,box:Box){
 const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=image});
 const x=Math.max(0,Math.min(1000,box.x))/1000*img.width,y=Math.max(0,Math.min(1000,box.y))/1000*img.height;
 const w=Math.max(1,Math.min(1000-box.x,box.width))/1000*img.width,h=Math.max(1,Math.min(1000-box.y,box.height))/1000*img.height;
 const pad=Math.max(w,h)*.06,sx=Math.max(0,x-pad),sy=Math.max(0,y-pad),sw=Math.min(img.width-sx,w+pad*2),sh=Math.min(img.height-sy,h+pad*2);
 const c=document.createElement('canvas');c.width=Math.max(1,Math.round(sw));c.height=Math.max(1,Math.round(sh));c.getContext('2d')?.drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height);
 return c.toDataURL('image/jpeg',.9);
}
async function isolateGarment(image:string){
 const runtimeImport=new Function('url','return import(url)') as (url:string)=>Promise<any>;
 const mod=await runtimeImport('https://esm.sh/@imgly/background-removal@1.5.8?bundle&deps=onnxruntime-web@1.21.0-dev.20250114-228dd16893');
 const removeBackground=mod.removeBackground||mod.default;if(typeof removeBackground!=='function')throw new Error('Motor de recorte indisponível.');
 const blob=await removeBackground(image,{publicPath:'https://staticimgly.com/@imgly/background-removal-data/1.5.8/dist/',device:'cpu',proxyToWorker:false,model:'isnet_quint8',output:{format:'image/png',quality:1,type:'foreground'}});
 if(!(blob instanceof Blob))throw new Error('Recorte inválido.');return await blobToDataUrl(blob);
}
async function normalizeCutout(dataUrl:string,category:Category){
 const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=dataUrl});
 const src=document.createElement('canvas');src.width=img.width;src.height=img.height;const ctx=src.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Falha no enquadramento');ctx.drawImage(img,0,0);
 const px=ctx.getImageData(0,0,src.width,src.height),d=px.data;let minX=src.width,minY=src.height,maxX=-1,maxY=-1;
 for(let y=0;y<src.height;y+=2)for(let x=0;x<src.width;x+=2)if(d[(y*src.width+x)*4+3]>18){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}
 if(maxX<minX)throw new Error('Peça não encontrada no recorte.');const p=Math.max(8,Math.round(Math.max(maxX-minX,maxY-minY)*.025));minX=Math.max(0,minX-p);minY=Math.max(0,minY-p);maxX=Math.min(src.width-1,maxX+p);maxY=Math.min(src.height-1,maxY+p);
 const cw=maxX-minX+1,ch=maxY-minY+1,out=document.createElement('canvas');out.width=900;out.height=1100;const o=out.getContext('2d');if(!o)throw new Error('Falha ao organizar peça.');
 const wide=['Calçados','Bolsas','Acessórios'].includes(category),mw=out.width*(wide?.84:.76),mh=out.height*(wide?.64:.84),s=Math.min(mw/cw,mh/ch),dw=cw*s,dh=ch*s;
 o.imageSmoothingEnabled=true;o.imageSmoothingQuality='high';o.drawImage(src,minX,minY,cw,ch,(out.width-dw)/2,(out.height-dh)/2,dw,dh);return out.toDataURL('image/png');
}

export default function ClosetPage(){
 const [pieces,setPieces]=useState<Piece[]>([]),[category,setCategory]=useState<Category>('Todos'),[sheet,setSheet]=useState<Sheet>(null),[wardrobeOpen,setWardrobeOpen]=useState(false),[toast,setToast]=useState('');
 const [draftOriginal,setDraftOriginal]=useState(''),[prepared,setPrepared]=useState<PreparedItem[]>([]),[currentIndex,setCurrentIndex]=useState(0),[scanPhase,setScanPhase]=useState<ScanPhase>('detecting'),[scanError,setScanError]=useState(''),[processingText,setProcessingText]=useState('');
 const [draftName,setDraftName]=useState(''),[draftCategory,setDraftCategory]=useState<Category>('Blusas'),[draftColor,setDraftColor]=useState(''),[selectedOccasion,setSelectedOccasion]=useState(''),[lookReady,setLookReady]=useState(false),[liked,setLiked]=useState(false),[selectedSlot,setSelectedSlot]=useState('Peça');
 const cameraRef=useRef<HTMLInputElement>(null),galleryRef=useRef<HTMLInputElement>(null);
 const filtered=useMemo(()=>pieces.filter(p=>category==='Todos'||p.category===category),[pieces,category]);
 const current=prepared[currentIndex];
 const hasTop=pieces.some(p=>p.category==='Blusas'||p.category==='Vestidos'),hasBottom=pieces.some(p=>p.category==='Calças'||p.category==='Vestidos'),hasShoes=pieces.some(p=>p.category==='Calçados'),readyForLook=hasTop&&hasBottom&&hasShoes,readiness=[hasTop,hasBottom,hasShoes].filter(Boolean).length;
 function notify(m:string){setToast(m);window.setTimeout(()=>setToast(''),2200)}
 function loadDraft(i:number,list=prepared){const p=list[i];if(!p)return;setDraftName(p.name);setDraftCategory(p.category);setDraftColor(p.color)}
 async function scanPhoto(image:string){
  setSheet('scan');setScanPhase('detecting');setScanError('');setPrepared([]);setCurrentIndex(0);setProcessingText('Procurando todas as peças do look');
  try{
   const r=await fetch('/api/closet/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})}),data=await r.json();if(!r.ok||!data?.ok)throw new Error(data?.message||'Não consegui analisar esta foto.');
   const items=(data.scan?.items||[]) as ScanItem[];if(!items.length){setScanError(data.scan?.reason||'Não encontrei peças válidas.');setSheet('scanReject');return}
   const ready:PreparedItem[]=[];
   for(let i=0;i<items.length;i++){
    const item=items[i];setScanPhase('cutting');setProcessingText(`Separando peça ${i+1} de ${items.length}`);
    const crop=await cropByBox(image,item.box);const cut=await isolateGarment(crop);setScanPhase('aligning');setProcessingText(`Organizando peça ${i+1} de ${items.length}`);const normalized=await normalizeCutout(cut,item.category);ready.push({...item,image:normalized});
   }
   setPrepared(ready);loadDraft(0,ready);setSheet('edit');
  }catch(e:any){setScanError(e?.message||'Falha no scanner.');setSheet('scanReject')}
 }
 async function receivePhoto(e:ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;try{const image=await imageToDataUrl(f);setDraftOriginal(image);await scanPhoto(image)}catch{setScanError('Não consegui preparar esta imagem.');setSheet('scanReject')}e.target.value=''}
 function saveCurrent(){if(!current)return;const item:Piece={id:Date.now()+currentIndex,category:draftCategory,name:draftName||current.name,meta:[draftColor,current.subcategory,current.pattern].filter(Boolean).join(' · '),image:current.image};setPieces(v=>[item,...v]);
  if(currentIndex<prepared.length-1){const next=currentIndex+1;setCurrentIndex(next);loadDraft(next);notify(`Peça ${currentIndex+1} salva. Próxima!`)}else{setSheet(null);setWardrobeOpen(true);notify(`${prepared.length} ${prepared.length===1?'peça salva':'peças salvas'} no closet ✦`);setPrepared([]);setCurrentIndex(0)}}
 function startLook(){if(!readyForLook){setSheet('closetStatus');return}setSheet('occasion')}
 function openSwap(s:string){setSelectedSlot(s);setSheet('wardrobe')}
 return <main className={styles.page}><section className={styles.appShell}>
  <header className={styles.topbar}><div><span className={styles.eyebrow}>SEU ESTILO, TODOS OS DIAS</span><h1>closet<span>.</span></h1></div><button className={styles.profileButton}>MC</button></header>
  <section className={styles.hero}><div className={styles.heroCopy}><span className={styles.kicker}>Stylist pessoal</span><h2>Bom dia.<br/>O que vamos vestir?</h2><p>Seu guarda-roupa, seu gosto e a ocasião — combinados de um jeito que fica cada vez mais você.</p><div className={styles.heroActions}><button className={styles.primaryButton} onClick={startLook}><span>✦</span> Montar meu look</button></div></div><div className={styles.wardrobeArt} aria-hidden="true"><div className={styles.wardrobe}><div className={styles.wardrobeTop}>CLOSET</div><div className={styles.wardrobeDoors}><div className={styles.door}/><div className={styles.door}/></div><div className={styles.wardrobeBase}/></div></div></section>
  <section className={styles.quickRow}><button onClick={()=>setSheet('add')}><span>＋</span><strong>Adicionar peça</strong><small>foto, galeria ou look vestido</small></button><button onClick={startLook}><span>✦</span><strong>Montar look</strong><small>{readyForLook?'pela ocasião':`${readiness}/3 para começar`}</small></button></section>
  <section className={styles.section}><div className={styles.sectionHeader}><div><span className={styles.kicker}>Meu guarda-roupa</span><h3>{pieces.length?`${pieces.length} ${pieces.length===1?'peça guardada':'peças guardadas'}`:'Seu closet está vazio'}</h3></div><button className={styles.textButton} onClick={()=>setSheet('add')}>+ Adicionar</button></div><div className={`${styles.closedClosetCard} ${wardrobeOpen?styles.closetOpen:''}`}><div className={styles.closetInterior}><div className={styles.categories}>{categories.map(c=><button key={c} className={`${styles.categoryChip} ${category===c?styles.categoryActive:''}`} onClick={()=>setCategory(c)}>{c}</button>)}</div>{!filtered.length?<div className={styles.emptyCloset}><strong>Seu guarda-roupa começa com uma foto.</strong><p>Você pode fotografar uma peça sozinha ou fotografar um look vestido e deixar o scanner separar tudo.</p><button onClick={()=>setSheet('add')}>＋ Adicionar</button></div>:<div className={styles.pieceGrid}>{filtered.map(p=><button className={styles.pieceCard} key={p.id}><div className={`${styles.pieceVisual} ${scanStyles.transparentPreview}`}><img src={p.image} alt={p.name}/></div><div className={styles.pieceInfo}><strong>{p.name}</strong><span>{p.meta}</span></div></button>)}</div>}</div><div className={styles.bigClosetDoors}><div className={styles.bigDoorLeft}/><div className={styles.bigDoorRight}/></div><div className={styles.closetFrontCopy}><span className={styles.kicker}>Seu closet</span><strong>{wardrobeOpen?'Guarda-roupa aberto':'Tudo guardado no lugar.'}</strong><small>{wardrobeOpen?'Veja as peças que você já cadastrou.':'As peças só aparecem quando você abrir o guarda-roupa.'}</small><button onClick={()=>setWardrobeOpen(v=>!v)}>{wardrobeOpen?'Fechar guarda-roupa':'Abrir guarda-roupa'}</button></div></div></section>
  <section className={styles.lookSection}><div className={styles.sectionHeader}><div><span className={styles.kicker}>Seu look</span><h3>{lookReady?`Para ${selectedOccasion}`:'Pronto quando você estiver'}</h3></div></div>{!lookReady?<div className={styles.lookPreviewEmpty}><span>✦</span><h4>{readyForLook?'Seu stylist já pode começar.':'Seu primeiro look está quase pronto.'}</h4><p>{readyForLook?'Escolha uma ocasião e eu monto usando o seu closet.':'Basta uma parte de cima, uma parte de baixo e um calçado para testar.'}</p><button onClick={startLook}>{readyForLook?'Montar meu look':'Ver o que falta'}</button></div>:<div className={styles.lookCard}><div className={styles.lookCanvas}>{pieces.slice(0,4).map((p,i)=><button key={p.id} className={`${styles.lookRealPiece} ${styles['lookPos'+i]}`} onClick={()=>openSwap(p.category)}><img src={p.image} alt={p.name}/></button>)}</div><div className={styles.lookDetails}><p>Montei pensando em <strong>{selectedOccasion.toLowerCase()}</strong>.</p><div className={styles.lookActions}><button onClick={()=>openSwap('Peça')}>↻ Trocar uma peça</button><button onClick={()=>setWardrobeOpen(true)}>▤ Abrir guarda-roupa</button><button className={liked?styles.liked:''} onClick={()=>setLiked(v=>!v)}>{liked?'♥':'♡'} {liked?'Amei':'Gostei'}</button></div></div></div>}</section>
  <nav className={styles.bottomNav}><button className={styles.navActive}><span>⌂</span>Início</button><button onClick={()=>setWardrobeOpen(true)}><span>♢</span>Closet</button><button className={styles.fab} onClick={startLook}>✦</button><button><span>▦</span>Looks</button><button><span>◌</span>Loja</button></nav>
 </section>
 <input ref={cameraRef} className={styles.hiddenInput} type="file" accept="image/*" capture="environment" onChange={receivePhoto}/><input ref={galleryRef} className={styles.hiddenInput} type="file" accept="image/*" onChange={receivePhoto}/>
 {sheet&&<button className={styles.scrim} onClick={()=>setSheet(null)}/>}<aside className={`${styles.sheet} ${sheet?styles.sheetOpen:''}`}><div className={styles.sheetHandle}/>
 {sheet==='add'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Cadastro rápido</span><h3>Uma foto pode virar várias peças.</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>Pode fotografar uma roupa sozinha ou você já vestido. Se houver camiseta + calça + tênis, o scanner tenta separar e cadastrar cada item individualmente.</p><div className={styles.captureGrid}><button onClick={()=>cameraRef.current?.click()}><span>◎</span><strong>Tirar foto</strong><small>usar câmera</small></button><button onClick={()=>galleryRef.current?.click()}><span>▧</span><strong>Escolher foto</strong><small>abrir galeria</small></button></div></>}
 {sheet==='scan'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Scanner do closet</span><h3>{scanPhase==='detecting'?'Analisando seu look...':scanPhase==='cutting'?'Separando as peças...':'Organizando as peças...'}</h3></div></div><div className={scanStyles.scanStage}>{draftOriginal&&<img src={draftOriginal} alt="Foto sendo analisada"/>}<div className={scanStyles.scanFrame}><i className={scanStyles.scanCorner}/><i className={scanStyles.scanCorner}/><i className={scanStyles.scanCorner}/><i className={scanStyles.scanCorner}/><i className={scanStyles.scanLine}/></div></div><div className={scanStyles.scanCopy}><strong>{processingText}</strong><p>Vou transformar cada roupa encontrada em uma peça independente do seu guarda-roupa.</p><div className={scanStyles.scanDots}><i/><i/><i/></div></div></>}
 {sheet==='scanReject'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Scanner do closet</span><h3>Não consegui separar as peças.</h3></div><button onClick={()=>setSheet(null)}>×</button></div><div className={scanStyles.rejectCard}><strong>Tente outra foto.</strong><p>{scanError||'Deixe as roupas mais visíveis e com boa iluminação.'}</p></div><div className={scanStyles.retryGrid}><button onClick={()=>cameraRef.current?.click()}>Tirar outra foto</button><button onClick={()=>galleryRef.current?.click()}>Galeria</button></div></>}
 {sheet==='edit'&&current&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>{prepared.length>1?`${prepared.length} peças identificadas · ${currentIndex+1} de ${prepared.length}`:'Peça pronta'}</span><h3>{currentIndex===0?'Confira e guarde':'Próxima peça'}</h3></div><button onClick={()=>setSheet(null)}>×</button></div>{prepared.length>1&&<div style={{display:'flex',gap:8,overflowX:'auto',padding:'8px 0 12px'}}>{prepared.map((p,i)=><button key={i} onClick={()=>{setCurrentIndex(i);loadDraft(i)}} style={{flex:'0 0 72px',height:86,border:i===currentIndex?'2px solid #211b17':'1px solid #ddd0c2',borderRadius:14,background:'#f4ecdf',padding:5}}><img src={p.image} alt={p.name} style={{width:'100%',height:'100%',objectFit:'contain'}}/></button>)}</div>}<div className={`${styles.editorPreview} ${scanStyles.transparentPreview}`}><img src={current.image} alt={current.name}/><span className={scanStyles.detectedBadge}>✓ peça {currentIndex+1} de {prepared.length}</span></div><div className={styles.formGrid}><label>Nome<input value={draftName} onChange={e=>setDraftName(e.target.value)}/></label><label>Categoria<select value={draftCategory} onChange={e=>setDraftCategory(e.target.value as Category)}>{categories.filter(c=>c!=='Todos').map(c=><option key={c}>{c}</option>)}</select></label><label>Cor principal<input value={draftColor} onChange={e=>setDraftColor(e.target.value)}/></label></div><button className={styles.savePieceButton} onClick={saveCurrent}>{currentIndex<prepared.length-1?'Guardar e ver próxima →':'Guardar no meu closet'}</button><button className={scanStyles.secondaryAction} onClick={()=>setSheet('add')}>Usar outra foto</button></>}
 {sheet==='closetStatus'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Primeiro look</span><h3>Seu stylist está pronto.</h3></div><button onClick={()=>setSheet(null)}>×</button></div><p className={styles.sheetIntro}>Você precisa de parte de cima, parte de baixo e calçado.</p><button className={styles.savePieceButton} onClick={()=>setSheet('add')}>Adicionar peças</button></>}
 {sheet==='occasion'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Montar look</span><h3>Para onde você vai?</h3></div><button onClick={()=>setSheet(null)}>×</button></div><div className={styles.occasionGrid}>{occasions.map(([n,d])=><button key={n} className={selectedOccasion===n?styles.occasionActive:''} onClick={()=>setSelectedOccasion(n)}><strong>{n}</strong><small>{d}</small></button>)}</div><button className={styles.savePieceButton} disabled={!selectedOccasion} onClick={()=>{setLookReady(true);setSheet(null)}}>Montar look</button></>}
 {sheet==='wardrobe'&&<><div className={styles.sheetHeader}><div><span className={styles.kicker}>Trocar peça</span><h3>{selectedSlot}</h3></div><button onClick={()=>setSheet(null)}>×</button></div><div className={styles.swapGrid}>{pieces.slice(0,6).map(p=><button key={p.id}><img src={p.image} alt={p.name}/><strong>{p.name}</strong></button>)}</div></>}
 </aside><div className={`${styles.toast} ${toast?styles.toastVisible:''}`}>{toast}</div></main>
}
