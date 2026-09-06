'use client';
import {ChangeEvent,useEffect,useMemo,useRef,useState} from 'react';
import {restoreClosetSession,saveClosetItem,saveClosetItems,type ClosetSession} from '../supabase';
import {loadAiWallet,type AiWallet} from '../aiCredits';
import ClosetAuth from '../ClosetAuth';
import styles from './add.module.css';

type Category='Blusas'|'Calças'|'Vestidos'|'Calçados'|'Bolsas'|'Acessórios';
type Box={x:number;y:number;width:number;height:number};
type ScanItem={name:string;category:Category;color:string;subcategory:string;pattern?:string;style?:string;brand?:string;label_text?:string;confidence?:number;visibility?:number;box:Box};
type Detected=ScanItem&{crop:string;selected:boolean;catalog?:string};
type ManualDraft={id:string;image:string;name:string;category:Category;color:string;subcategory:string;colorAuto?:boolean};

const categories:Category[]=['Blusas','Calças','Vestidos','Calçados','Bolsas','Acessórios'];
const typeSuggestions:Record<Category,string[]>={
  'Blusas':['Camisa social','Camisa casual','Camiseta','Polo','Blusa','Suéter','Jaqueta'],
  'Calças':['Calça social','Alfaiataria','Jeans','Chino','Bermuda','Short'],
  'Vestidos':['Vestido curto','Vestido midi','Vestido longo','Vestido social'],
  'Calçados':['Tênis','Sapato social','Sapatênis','Sandália','Bota','Salto'],
  'Bolsas':['Bolsa de mão','Bolsa transversal','Mochila','Clutch','Pasta'],
  'Acessórios':['Cinto','Relógio','Óculos','Gravata','Pulseira','Colar','Lenço']
};

async function imageToDataUrl(file:File){
  const raw=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file)});
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=raw});
  const max=1400,scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
  c.getContext('2d')?.drawImage(img,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',.88);
}
async function loadImage(src:string){return await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=src})}
function rgbToHsl(r:number,g:number,b:number){
  r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min;let h=0,s=0;
  if(d){s=d/(1-Math.abs(2*l-1));if(max===r)h=60*(((g-b)/d)%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4);if(h<0)h+=360}
  return {h,s,l};
}
function colorName(r:number,g:number,b:number){
  const {h,s,l}=rgbToHsl(r,g,b);
  if(l<.13)return 'Preto';
  if(l>.91&&s<.16)return 'Branco';
  if(s<.12)return l>.72?'Cinza claro':l<.32?'Grafite':'Cinza';
  if(h<15||h>=345)return l>.72?'Rosa claro':'Vermelho';
  if(h<42)return l>.74?'Bege':l<.42?'Marrom':'Caramelo';
  if(h<68)return 'Amarelo';
  if(h<165)return l<.28?'Verde escuro':'Verde';
  if(h<198)return 'Verde-água';
  if(h<255)return l<.34?'Azul-marinho':l>.72?'Azul claro':'Azul';
  if(h<292)return 'Roxo';
  if(h<345)return l>.68?'Rosa':'Vinho';
  return 'Neutro';
}
async function estimateDominantColor(src:string){
  try{
    const img=await loadImage(src),size=72,c=document.createElement('canvas');c.width=size;c.height=size;
    const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)return '';
    const scale=Math.max(size/img.width,size/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);
    const data=ctx.getImageData(0,0,size,size).data,tally=new Map<string,number>();
    for(let y=7;y<size-7;y+=2)for(let x=7;x<size-7;x+=2){const i=(y*size+x)*4,r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];if(a<180)continue;const {s,l}=rgbToHsl(r,g,b);if(l>.96&&s<.08)continue;const dx=(x-size/2)/(size/2),dy=(y-size/2)/(size/2),center=Math.max(.25,1-Math.sqrt(dx*dx+dy*dy)*.5),weight=center*(.65+s*1.35),name=colorName(r,g,b);tally.set(name,(tally.get(name)||0)+weight)}
    return [...tally.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
  }catch{return ''}
}
async function cropByBox(image:string,box:Box){
  const img=await loadImage(image);
  const x=Math.max(0,Math.min(1000,box.x))/1000*img.width,y=Math.max(0,Math.min(1000,box.y))/1000*img.height,w=Math.max(1,Math.min(1000-box.x,box.width))/1000*img.width,h=Math.max(1,Math.min(1000-box.y,box.height))/1000*img.height,pad=Math.max(w,h)*.1,sx=Math.max(0,x-pad),sy=Math.max(0,y-pad),sw=Math.min(img.width-sx,w+pad*2),sh=Math.min(img.height-sy,h+pad*2),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(sw));c.height=Math.max(1,Math.round(sh));c.getContext('2d')?.drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',.9);
}
async function apiJson(path:string,session:ClosetSession,body:any){
  const requestId=crypto.randomUUID();
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,'X-Closet-Request-Id':requestId},body:JSON.stringify(body)}),data=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(data?.message||'Não consegui concluir esta ação.'),{code:data?.code,status:r.status,cost:data?.cost});
  return data;
}

export default function AddPiecePage(){
  const [session,setSession]=useState<ClosetSession|null>(null),[wallet,setWallet]=useState<AiWallet|null>(null),[mode,setMode]=useState<'choose'|'manual'|'ai-photo'|'ai-confirm'|'ai-results'>('choose'),[image,setImage]=useState(''),[manualDrafts,setManualDrafts]=useState<ManualDraft[]>([]),[activeDraftId,setActiveDraftId]=useState(''),[saving,setSaving]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[detected,setDetected]=useState<Detected[]>([]),[authOpen,setAuthOpen]=useState(false),[afterAuth,setAfterAuth]=useState<'save'|'ai'|null>(null);
  const camera=useRef<HTMLInputElement>(null),gallery=useRef<HTMLInputElement>(null),aiCamera=useRef<HTMLInputElement>(null),aiGallery=useRef<HTMLInputElement>(null);
  const activeDraft=useMemo(()=>manualDrafts.find(x=>x.id===activeDraftId)||manualDrafts[0]||null,[manualDrafts,activeDraftId]);
  const activeIndex=useMemo(()=>activeDraft?manualDrafts.findIndex(x=>x.id===activeDraft.id):-1,[manualDrafts,activeDraft]);
  const suggestedTypes=activeDraft?typeSuggestions[activeDraft.category]:[];

  useEffect(()=>{(async()=>{const s=await restoreClosetSession();setSession(s);if(s)setWallet(await loadAiWallet(s))})()},[]);
  async function refreshWallet(s=session){if(s)setWallet(await loadAiWallet(s))}
  async function handleSessionChange(next:ClosetSession|null){setSession(next);if(next){await refreshWallet(next);setMessage(afterAuth==='save'?'Conta conectada. Suas fotos e seus dados continuam aqui.':'Conta conectada. Agora você pode usar os recursos disponíveis.');setAuthOpen(false)}else setWallet(null)}
  function requireAuth(intent:'save'|'ai'){setAfterAuth(intent);setAuthOpen(true)}
  function patchDraft(patch:Partial<ManualDraft>){if(!activeDraft)return;setManualDrafts(v=>v.map(x=>x.id===activeDraft.id?{...x,...patch}:x))}
  function removeDraft(id:string){setManualDrafts(v=>{const next=v.filter(x=>x.id!==id);if(activeDraftId===id)setActiveDraftId(next[0]?.id||'');return next})}
  function chooseType(type:string){if(!activeDraft)return;const autoName=!activeDraft.name.trim()?[type,activeDraft.color?activeDraft.color.toLowerCase():''].filter(Boolean).join(' '):activeDraft.name;patchDraft({subcategory:type,name:autoName})}

  async function filesToDrafts(files:File[]){
    const images=await Promise.all(files.map(imageToDataUrl)),colors=await Promise.all(images.map(estimateDominantColor));
    return images.map((photo,i)=>({id:crypto.randomUUID(),image:photo,name:'',category:'Blusas' as Category,color:colors[i]||'',subcategory:'',colorAuto:Boolean(colors[i])}));
  }
  async function receiveManual(e:ChangeEvent<HTMLInputElement>){
    const files=Array.from(e.target.files||[]).filter(f=>f.type.startsWith('image/'));e.target.value='';if(!files.length)return;setBusy(true);setMessage('');
    try{const drafts=await filesToDrafts(files);setManualDrafts(prev=>[...prev,...drafts]);if(!activeDraftId)setActiveDraftId(drafts[0].id);setMode('manual');setMessage(files.length>1?`${files.length} fotos adicionadas. A cor foi sugerida no aparelho; revise cada peça antes de guardar.`:'Foto adicionada. Sugeri a cor no próprio aparelho, sem usar créditos.');}catch{setMessage('Não consegui abrir uma das fotos selecionadas.')}finally{setBusy(false)}
  }
  async function receiveAi(e:ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];e.target.value='';if(!f)return;try{const photo=await imageToDataUrl(f);setImage(photo);setDetected([]);setMode('ai-confirm');setMessage('Foto pronta. O scanner só será executado se você confirmar o uso de 1 crédito.');}catch{setMessage('Não consegui abrir esta foto.')}}
  async function runAiScan(){
    if(!image)return;if(!session){requireAuth('ai');return}
    if((wallet?.balance||0)<1){const color=await estimateDominantColor(image),draft:ManualDraft={id:crypto.randomUUID(),image,name:'',category:'Blusas',color,subcategory:'',colorAuto:Boolean(color)};setManualDrafts(v=>[...v,draft]);setActiveDraftId(draft.id);setMode('manual');setMessage('Seu saldo está zerado. Mantive a foto no cadastro gratuito e sugeri a cor localmente — nenhum crédito foi usado.');return}
    setBusy(true);setMessage('');
    try{const data=await apiJson('/api/closet/scan',session,{image}),items=(data?.scan?.items||[]) as ScanItem[];if(!items.length)throw new Error(data?.scan?.reason||'Não encontrei peças suficientemente visíveis.');const ready=await Promise.all(items.map(async item=>({...item,crop:await cropByBox(image,item.box),selected:true})));setDetected(ready);await refreshWallet();setMode('ai-results');}catch(e:any){setMessage(e?.code==='closet_ai_locked'?'O Closet AI está temporariamente indisponível. Nenhum crédito foi gasto.':e?.message||'Não consegui analisar a foto.')}finally{setBusy(false)}
  }
  async function saveManual(){
    const draft=activeDraft;if(!draft)return;if(!session){requireAuth('save');return}if(!draft.name.trim()){setMessage('Dê um nome para esta peça antes de guardar.');return}setSaving(true);setMessage('');
    try{await saveClosetItem(session,{name:draft.name.trim(),category:draft.category,color:draft.color.trim(),source:{subcategory:draft.subcategory.trim(),pattern:null,style:null,confidence:1,visibility:1,manual:true,batch_free:manualDrafts.length>1,color_detected_locally:Boolean(draft.colorAuto)},catalogImage:draft.image,originalImage:draft.image});const remaining=manualDrafts.filter(x=>x.id!==draft.id);if(!remaining.length){location.href='/closet/wardrobe';return}const next=remaining[Math.min(activeIndex,remaining.length-1)]||remaining[0];setManualDrafts(remaining);setActiveDraftId(next.id);setMessage(`Peça guardada. Faltam ${remaining.length} ${remaining.length===1?'foto':'fotos'} para cadastrar.`);}catch(e:any){setMessage(e?.message||'Não consegui guardar a peça.')}finally{setSaving(false)}
  }
  async function saveDetected(item:Detected,index:number,useAi:boolean){if(!session){requireAuth(useAi?'ai':'save');return}setBusy(true);setMessage('');try{let asset=item.crop;if(useAi){if((wallet?.balance||0)<1)throw Object.assign(new Error('Você precisa de 1 crédito para melhorar esta peça.'),{code:'insufficient_ai_credits'});const data=await apiJson('/api/closet/catalogize',session,{image:item.crop,item});asset=String(data.image);setDetected(v=>v.map((x,i)=>i===index?{...x,catalog:asset}:x));await refreshWallet()}await saveClosetItem(session,{name:item.name,category:item.category,color:item.color,source:{...item,ai_catalog:Boolean(useAi)},catalogImage:asset,originalImage:image});setDetected(v=>v.map((x,i)=>i===index?{...x,selected:false}:x));setMessage(`${item.name} guardado${useAi?' com versão de catálogo':''}.`);}catch(e:any){setMessage(e?.code==='closet_ai_locked'?'O Closet AI está temporariamente indisponível. Nenhum crédito foi gasto.':e?.message||'Não consegui guardar esta peça.')}finally{setBusy(false)}}
  async function saveAllFree(){if(!session){requireAuth('save');return}const pending=detected.filter(x=>x.selected);if(!pending.length)return;setBusy(true);setMessage('');try{await saveClosetItems(session,pending.map(item=>({name:item.name,category:item.category,color:item.color,source:{...item,ai_catalog:false,batch_free:true},catalogImage:item.crop,originalImage:image})));setDetected(v=>v.map(x=>({...x,selected:false})));setMessage(`${pending.length} ${pending.length===1?'peça guardada':'peças guardadas'} sem gastar créditos.`)}catch(e:any){setMessage(e?.message||'Não consegui guardar todas as peças.')}finally{setBusy(false)}}

  return <main className={styles.page}>
    <header><button onClick={()=>history.back()}>‹</button><div><span>ADICIONAR PEÇA</span><strong>Novo item</strong></div><button onClick={()=>location.href='/closet'}>⌂</button></header>
    {mode==='choose'?<section className={styles.choose}>
      <span>VOCÊ ESCOLHE</span><h1>Cadastre grátis ou deixe a IA ajudar.</h1><p>O Closet funciona sem IA. Recursos inteligentes só são usados quando você escolhe explicitamente — e o custo aparece antes.</p>
      <button className={styles.freeCard} onClick={()=>setMode('manual')}><b>GRÁTIS</b><strong>Cadastrar pela foto</strong><small>Escolha uma ou várias fotos. A cor pode ser sugerida no próprio aparelho, sem scanner e sem créditos.</small><i>Continuar →</i></button>
      <button className={styles.aiCard} onClick={()=>setMode('ai-photo')}><b>CLOSET AI</b><strong>Scanner inteligente</strong><small>Uma foto pode conter várias peças. O scanner custa 1 crédito por foto e reconhece peça, tipo, cor e detalhes automaticamente.</small><i>{wallet?`${wallet.balance} créditos disponíveis`:session?'Carregando saldo':'Ver como funciona'} →</i></button>
      <div className={styles.note}>Fotos da galeria nunca acionam IA sozinhas. Selecionar ou fotografar uma peça não consome crédito.</div>
    </section>:mode==='manual'?<section className={styles.manual}>
      <div className={styles.title}><span>CADASTRO GRATUITO</span><h1>Uma ou várias fotos. Zero créditos.</h1><p>Cadastre usando a própria foto. A cor é estimada localmente no aparelho e você pode corrigir tudo antes de guardar.</p></div>
      {!manualDrafts.length?<div className={styles.capture}><button disabled={busy} onClick={()=>camera.current?.click()}><span>◎</span><strong>{busy?'Abrindo…':'Tirar foto'}</strong><small>usar câmera</small></button><button disabled={busy} onClick={()=>gallery.current?.click()}><span>▧</span><strong>{busy?'Carregando…':'Escolher da galeria'}</strong><small>selecionar várias fotos</small></button></div>:activeDraft&&<>
        {manualDrafts.length>1&&<div className={styles.batchBar}><div><strong>{activeIndex+1} de {manualDrafts.length} fotos</strong><button onClick={()=>gallery.current?.click()}>+ adicionar mais</button></div><div>{manualDrafts.map((d,i)=><button key={d.id} onClick={()=>setActiveDraftId(d.id)} className={d.id===activeDraft.id?styles.thumbActive:''}><img src={d.image} alt={`Foto ${i+1}`}/><span>{i+1}</span></button>)}</div></div>}
        <div className={styles.preview}><img src={activeDraft.image} alt="Peça escolhida"/><div><button onClick={()=>gallery.current?.click()}>Adicionar fotos</button><button onClick={()=>removeDraft(activeDraft.id)}>Remover esta</button></div></div>
        <div className={styles.assist}><div><span>AUXÍLIO GRATUITO</span><strong>{activeDraft.color?`Cor sugerida: ${activeDraft.color}`:'Não consegui sugerir a cor'}</strong><small>Feito no seu aparelho. Sem IA e sem gastar crédito.</small></div></div>
        <div className={styles.form}>
          <label>Nome<input value={activeDraft.name} onChange={e=>patchDraft({name:e.target.value})} placeholder="Ex.: Camisa social azul-marinho"/></label>
          <label>Categoria<select value={activeDraft.category} onChange={e=>patchDraft({category:e.target.value as Category,subcategory:''})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
          <label>Cor <small>{activeDraft.colorAuto?'· sugerida automaticamente':''}</small><input value={activeDraft.color} onChange={e=>patchDraft({color:e.target.value,colorAuto:false})} placeholder="Ex.: Azul-marinho"/></label>
          <label>Tipo<input value={activeDraft.subcategory} onChange={e=>patchDraft({subcategory:e.target.value})} placeholder="Ex.: Camisa social"/></label>
        </div>
        <div className={styles.quickTypes}><span>Sugestões rápidas de tipo</span><div>{suggestedTypes.map(type=><button key={type} className={activeDraft.subcategory===type?styles.chipActive:''} onClick={()=>chooseType(type)}>{type}</button>)}</div><small>O tipo é uma sugestão manual. Reconhecimento automático de “camisa social”, “manga longa” e outros detalhes fica no Scanner AI.</small></div>
        <button className={styles.primaryAction} disabled={saving} onClick={saveManual}>{saving?'Guardando…':'Guardar peça'}</button>
      </>}
    </section>:mode==='ai-photo'?<section className={styles.manual}>
      <div className={styles.title}><span>CLOSET AI</span><h1>Escolha uma foto para o scanner.</h1><p>Uma foto pode conter várias peças. Tirar ou selecionar a foto é grátis; nenhum crédito é usado até você confirmar a análise.</p></div><div className={styles.capture}><button disabled={busy} onClick={()=>aiCamera.current?.click()}><span>◎</span><strong>Tirar foto</strong><small>nenhum crédito ainda</small></button><button disabled={busy} onClick={()=>aiGallery.current?.click()}><span>▧</span><strong>Escolher da galeria</strong><small>nenhum crédito ainda</small></button></div><button className={styles.secondaryAction} onClick={()=>setMode('choose')}>Voltar</button>
    </section>:mode==='ai-confirm'?<section className={styles.manual}>
      <div className={styles.title}><span>CONFIRMAR SCANNER</span><h1>Esta foto pode virar várias peças.</h1><p>O scanner identifica todas as peças visíveis nesta única foto por <strong>1 crédito</strong>. Depois, salvar os recortes encontrados é grátis.</p></div><div className={styles.preview}><img src={image} alt="Foto pronta para análise"/></div><div className={styles.balance}><span>Custo desta análise</span><strong>1 crédito</strong><a href="/closet/credits">Saldo: {wallet?.balance??0}</a></div><button className={styles.primaryAction} disabled={busy} onClick={runAiScan}>{busy?'Analisando…':'Usar 1 crédito e analisar'}</button><button className={styles.secondaryAction} disabled={busy} onClick={()=>setMode('ai-photo')}>Escolher outra foto</button>
    </section>:<section className={styles.results}>
      <div className={styles.title}><span>PEÇAS ENCONTRADAS</span><h1>{detected.length} {detected.length===1?'peça identificada':'peças identificadas'}.</h1><p>O scanner já foi concluído. Salvar os recortes é grátis. Só a melhoria de catálogo usa mais 1 crédito por peça.</p></div><div className={styles.balance}><span>Saldo atual</span><strong>{wallet?.balance??0} créditos</strong><a href="/closet/credits">Ver carteira</a></div><button className={styles.saveAllFree} disabled={busy||!detected.some(x=>x.selected)} onClick={saveAllFree}>Salvar todas com os recortes · grátis</button><div className={styles.detectedGrid}>{detected.map((item,index)=><article key={`${item.name}-${index}`} className={!item.selected?styles.done:''}><div className={styles.detectedImage}><img src={item.catalog||item.crop} alt={item.name}/>{!item.selected&&<span>Guardado</span>}</div><div className={styles.detectedCopy}><small>{item.category} · {item.color}</small><strong>{item.name}</strong><p>{item.subcategory}</p>{item.selected&&<div className={styles.itemActions}><button disabled={busy} onClick={()=>saveDetected(item,index,false)}>Salvar recorte<em>grátis</em></button><button className={styles.itemAi} disabled={busy} onClick={()=>saveDetected(item,index,true)}>Melhorar e salvar<em>1 crédito</em></button></div>}</div></article>)}</div>
    </section>}
    {message&&<p className={styles.message}>{message}</p>}
    {authOpen&&<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(29,23,18,.58)',display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'16px 12px'}} onClick={()=>setAuthOpen(false)}><section style={{width:'min(100%,520px)',maxHeight:'92vh',overflowY:'auto',background:'#fbf8f2',borderRadius:'26px 26px 18px 18px',boxShadow:'0 -18px 50px rgba(0,0,0,.18)'}} onClick={e=>e.stopPropagation()}><div style={{display:'flex',justifyContent:'flex-end',padding:'10px 12px 0'}}><button aria-label="Fechar" onClick={()=>setAuthOpen(false)} style={{border:0,background:'transparent',fontSize:26,color:'#493d33'}}>×</button></div><ClosetAuth session={session} intent="save" onClose={()=>setAuthOpen(false)} onSessionChange={handleSessionChange}/></section></div>}
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={receiveManual}/><input ref={gallery} type="file" accept="image/*" multiple hidden onChange={receiveManual}/><input ref={aiCamera} type="file" accept="image/*" capture="environment" hidden onChange={receiveAi}/><input ref={aiGallery} type="file" accept="image/*" hidden onChange={receiveAi}/>
  </main>
}
