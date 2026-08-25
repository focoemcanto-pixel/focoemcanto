'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './look-page.module.css';
import TryOnStage from '../TryOnStage';
import { loadClosetItems, restoreClosetSession, type ClosetSession } from '../supabase';
import { loadStyleProfile } from '../styleProfile';
import { buildStyledLook, isCompleteLook, replacementCandidates, type StylistPiece, type StyleProfile } from '../lookEngine';

type Piece=StylistPiece;
const avatarModels=[
 {id:'m-1',name:'Masculino clássico',hint:'Corpo médio · atlético',glyph:'M'},
 {id:'m-2',name:'Masculino slim',hint:'Corpo mais esguio',glyph:'M'},
 {id:'m-3',name:'Masculino amplo',hint:'Estrutura mais larga',glyph:'M'},
 {id:'f-1',name:'Feminino clássico',hint:'Corpo médio',glyph:'F'},
 {id:'f-2',name:'Feminino slim',hint:'Corpo mais esguio',glyph:'F'},
 {id:'f-3',name:'Feminino curvas',hint:'Corpo com mais curvas',glyph:'F'}
];

function mapRows(rows:any[]):Piece[]{return rows.map(r=>({id:r.id,category:r.category,name:r.name,meta:[r.color,r.subcategory,r.pattern,r.style].filter(Boolean).join(' · '),image:r.image||''}))}
function slot(p:Piece,i:number){if(p.category==='Vestidos')return styles.dress;if(p.category==='Blusas')return styles.top;if(p.category==='Calças')return styles.bottom;if(p.category==='Calçados')return styles.shoes;return [styles.accLeft,styles.accRight,styles.accLowerLeft,styles.accLowerRight][i%4]}
async function makeLookReference(items:Piece[]){const sources=await Promise.all(items.slice(0,7).map(p=>new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=reject;img.src=p.image})));const c=document.createElement('canvas');c.width=1024;c.height=1024;const ctx=c.getContext('2d');if(!ctx)throw new Error('Não consegui preparar o look.');ctx.fillStyle='#f6f0e7';ctx.fillRect(0,0,1024,1024);const cols=2,rows=Math.ceil(sources.length/2),cellW=512,cellH=1024/Math.max(1,rows);sources.forEach((img,i)=>{const col=i%2,row=Math.floor(i/2),pad=42,maxW=cellW-pad*2,maxH=cellH-pad*2,scale=Math.min(maxW/img.width,maxH/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,col*cellW+(cellW-w)/2,row*cellH+(cellH-h)/2,w,h)});return c.toDataURL('image/png')}

export default function LookPage(){
 const [session,setSession]=useState<ClosetSession|null>(null),[pieces,setPieces]=useState<Piece[]>([]),[profile,setProfile]=useState<StyleProfile>({}),[occasion,setOccasion]=useState('Sair');
 const [look,setLook]=useState<Piece[]>([]),[seed,setSeed]=useState(0),[building,setBuilding]=useState(true),[revealed,setRevealed]=useState(false),[swap,setSwap]=useState<Piece|null>(null),[toast,setToast]=useState('');
 const [tryOn,setTryOn]=useState(false),[avatarId,setAvatarId]=useState('m-1'),[tryOnImage,setTryOnImage]=useState(''),[tryOnBusy,setTryOnBusy]=useState(false),[tryOnError,setTryOnError]=useState('');
 const candidates=useMemo(()=>swap?replacementCandidates(pieces,swap,look,occasion,profile):[],[pieces,swap,look,occasion,profile]);
 function notify(m:string){setToast(m);window.setTimeout(()=>setToast(''),2200)}
 function reveal(next:Piece[],delay=1050){setBuilding(true);setRevealed(false);window.setTimeout(()=>{setLook(next);setBuilding(false);window.setTimeout(()=>setRevealed(true),90)},delay)}
 useEffect(()=>{let alive=true;(async()=>{const query=new URLSearchParams(window.location.search);const o=query.get('occasion')||sessionStorage.getItem('closet_last_occasion')||'Sair';setOccasion(o);const s=await restoreClosetSession();if(!alive)return;if(!s){setBuilding(false);return}setSession(s);const [rows,sp]=await Promise.all([loadClosetItems(s),loadStyleProfile(s)]);if(!alive)return;const mapped=mapRows(rows);setPieces(mapped);setProfile(sp||{});const initial=buildStyledLook(mapped,o,sp||{},0);reveal(initial,800)})().catch(()=>setBuilding(false));return()=>{alive=false}},[]);
 function remix(){const nextSeed=seed+1;setSeed(nextSeed);setTryOnImage('');setTryOnError('');const next=buildStyledLook(pieces,occasion,profile,nextSeed);reveal(next,850);notify('Novo look sendo montado ✦')}
 function applySwap(p:Piece){if(!swap)return;const next=look.map(x=>x.id===swap.id?p:x);if(!isCompleteLook(next)){notify('Essa troca deixaria o look incompleto.');return}setLook(next);setSwap(null);setTryOnImage('');setTryOnError('');notify(`${p.name} entrou no look ✦`)}
 async function generateTryOn(){if(!look.length)return;setTryOnBusy(true);setTryOnError('');setTryOnImage('');try{const image=await makeLookReference(look);const r=await fetch('/api/closet/try-on',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,avatarId,occasion,items:look.map(p=>({name:p.name,category:p.category,meta:p.meta}))})});const data=await r.json();if(!r.ok||!data?.ok||!data?.image)throw new Error(data?.message||'Não consegui vestir este look.');setTryOnImage(String(data.image))}catch(e:any){const raw=String(e?.message||'');setTryOnError(/credits|billing|quota/i.test(raw)?'A visualização vestida está temporariamente indisponível. Seu look continua salvo aqui.':raw||'Não consegui vestir este look agora.')}finally{setTryOnBusy(false)}}
 const complete=isCompleteLook(look),personalized=Object.keys(profile||{}).length>0;
 if(!session&&!building)return <main className={styles.page}><div className={styles.empty}><span>SEU LOOK</span><h1>Entre no closet primeiro.</h1><p>Seu guarda-roupa precisa estar conectado para o stylist montar uma combinação.</p><button onClick={()=>window.location.href='/closet'}>Voltar ao closet</button></div></main>;
 return <main className={styles.page}>
  <header className={styles.header}><button onClick={()=>window.location.href='/closet'}>‹</button><div><span>STYLIST PESSOAL</span><strong>Para {occasion}</strong></div><button className={styles.more} onClick={()=>remix()}>↻</button></header>
  {!tryOn?<section className={styles.experience}>
   <div className={`${styles.stage} ${revealed&&!building?styles.stageOpen:''}`}>
    <div className={styles.backdrop}/><div className={styles.glow}/><div className={styles.platform}/>
    <div className={styles.lookArea}>{complete&&look.map((p,i)=><button key={p.id} className={`${styles.item} ${slot(p,i)}`} onClick={()=>setSwap(p)} aria-label={`Trocar ${p.name}`}><img src={p.image} alt={p.name}/></button>)}</div>
    {!building&&!complete&&<div className={styles.invalid}><strong>Falta uma peça essencial.</strong><small>O stylist não revela um look incompleto.</small><button onClick={()=>window.location.href='/closet'}>Adicionar ao closet</button></div>}
    <i className={`${styles.curtain} ${styles.leftCurtain}`}/><i className={`${styles.curtain} ${styles.rightCurtain}`}/>
    <div className={styles.stageCopy}>{building?'✦ combinando suas peças':complete?`✦ pronto para ${occasion.toLowerCase()}`:'✦ look incompleto'}</div>
   </div>
   <div className={styles.reason}><span>{personalized?'BASEADO NO SEU PERFIL':'STYLIST V1'}</span><strong>{personalized?'Seu gosto + ocasião + harmonia.':'Ocasião + harmonia + regras de moda.'}</strong><small>Roupa completa primeiro. Depois entram cores, formalidade, proporção e acessórios sem duplicidade.</small></div>
   <div className={styles.actions}><button onClick={remix}>↻ Sortear outro</button><button disabled={!complete} onClick={()=>{setTryOn(true);setTryOnError('')}}>♙ Ver vestido</button><button onClick={()=>notify('Feedback registrado para este look ✦')}>♡ Gostei</button></div>
  </section>:<section className={styles.tryOnScreen}><TryOnStage pieces={look} models={avatarModels} avatarId={avatarId} image={tryOnImage} busy={tryOnBusy} error={tryOnError} onAvatarChange={id=>{setAvatarId(id);setTryOnImage('');setTryOnError('')}} onGenerate={generateTryOn} onSwap={p=>{setTryOn(false);setSwap(p)}} onRemix={()=>{setTryOn(false);remix()}} onResetModel={()=>{setTryOnImage('');setTryOnError('')}} onClose={()=>setTryOn(false)}/></section>}
  {swap&&<div className={styles.swapBackdrop} onClick={()=>setSwap(null)}><div className={styles.swapSheet} onClick={e=>e.stopPropagation()}><div className={styles.swapHead}><div><span>TROCAR ITEM</span><strong>Escolha outra opção</strong></div><button onClick={()=>setSwap(null)}>×</button></div><div className={styles.swapGrid}>{candidates.slice(0,16).map(p=><button key={p.id} onClick={()=>applySwap(p)}><img src={p.image} alt={p.name}/></button>)}</div>{!candidates.length&&<p>Não há outra peça compatível desse tipo no closet.</p>}</div></div>}
  <div className={`${styles.toast} ${toast?styles.toastShow:''}`}>{toast}</div>
 </main>
}
