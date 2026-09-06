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
type ManualDraft={id:string;image:string;name:string;category:Category;color:string;subcategory:string};

const categories:Category[]=['Blusas','Calças','Vestidos','Calçados','Bolsas','Acessórios'];

async function imageToDataUrl(file:File){
  const raw=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file)});
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=raw});
  const max=1400,scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
  c.getContext('2d')?.drawImage(img,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',.88);
}
async function cropByBox(image:string,box:Box){
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=image});
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
  const [session,setSession]=useState<ClosetSession|null>(null);
  const [wallet,setWallet]=useState<AiWallet|null>(null);
  const [mode,setMode]=useState<'choose'|'manual'|'ai-photo'|'ai-confirm'|'ai-results'>('choose');
  const [image,setImage]=useState('');
  const [manualDrafts,setManualDrafts]=useState<ManualDraft[]>([]);
  const [activeDraftId,setActiveDraftId]=useState('');
  const [saving,setSaving]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [detected,setDetected]=useState<Detected[]>([]);
  const [authOpen,setAuthOpen]=useState(false);
  const [afterAuth,setAfterAuth]=useState<'save'|'ai'|null>(null);
  const camera=useRef<HTMLInputElement>(null),gallery=useRef<HTMLInputElement>(null),aiCamera=useRef<HTMLInputElement>(null),aiGallery=useRef<HTMLInputElement>(null);
  const activeDraft=useMemo(()=>manualDrafts.find(x=>x.id===activeDraftId)||manualDrafts[0]||null,[manualDrafts,activeDraftId]);
  const activeIndex=useMemo(()=>activeDraft?manualDrafts.findIndex(x=>x.id===activeDraft.id):-1,[manualDrafts,activeDraft]);

  useEffect(()=>{(async()=>{const s=await restoreClosetSession();setSession(s);if(s)setWallet(await loadAiWallet(s))})()},[]);
  async function refreshWallet(s=session){if(s)setWallet(await loadAiWallet(s))}
  async function handleSessionChange(next:ClosetSession|null){setSession(next);if(next){await refreshWallet(next);setMessage(afterAuth==='save'?'Conta conectada. Suas fotos e seus dados continuam aqui.':'Conta conectada. Agora você pode usar os recursos disponíveis.');setAuthOpen(false)}else setWallet(null)}
  function requireAuth(intent:'save'|'ai'){setAfterAuth(intent);setAuthOpen(true)}
  function patchDraft(patch:Partial<ManualDraft>){if(!activeDraft)return;setManualDrafts(v=>v.map(x=>x.id===activeDraft.id?{...x,...patch}:x))}
  function removeDraft(id:string){setManualDrafts(v=>{const next=v.filter(x=>x.id!==id);if(activeDraftId===id)setActiveDraftId(next[0]?.id||'');return next})}

  async function filesToDrafts(files:File[]){
    const images=await Promise.all(files.map(imageToDataUrl));
    return images.map(photo=>({id:crypto.randomUUID(),image:photo,name:'',category:'Blusas' as Category,color:'',subcategory:''}));
  }
  async function receiveManual(e:ChangeEvent<HTMLInputElement>){
    const files=Array.from(e.target.files||[]).filter(f=>f.type.startsWith('image/'));
    e.target.value='';
    if(!files.length)return;
    setBusy(true);setMessage('');
    try{
      const drafts=await filesToDrafts(files);
      setManualDrafts(prev=>[...prev,...drafts]);
      if(!activeDraftId)setActiveDraftId(drafts[0].id);
      setMode('manual');
      setMessage(files.length>1?`${files.length} fotos adicionadas. Cadastre uma por uma sem usar créditos.`:'Foto adicionada. Este cadastro é gratuito e não usa scanner.');
    }catch{setMessage('Não consegui abrir uma das fotos selecionadas.')}finally{setBusy(false)}
  }
  async function receiveAi(e:ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0];
    e.target.value='';
    if(!f)return;
    try{
      const photo=await imageToDataUrl(f);
      setImage(photo);
      setDetected([]);
      setMode('ai-confirm');
      setMessage('Foto pronta. O scanner só será executado se você confirmar o uso de 1 crédito.');
    }catch{setMessage('Não consegui abrir esta foto.')}
  }
  async function runAiScan(){
    if(!image)return;
    if(!session){requireAuth('ai');return}
    if((wallet?.balance||0)<1){
      const draft:ManualDraft={id:crypto.randomUUID(),image,name:'',category:'Blusas',color:'',subcategory:''};
      setManualDrafts(v=>[...v,draft]);setActiveDraftId(draft.id);setMode('manual');
      setMessage('Seu saldo está zerado. Mantive a foto e abri o cadastro gratuito — nenhum scanner foi executado e nenhum crédito foi necessário.');
      return;
    }
    setBusy(true);setMessage('');
    try{
      const data=await apiJson('/api/closet/scan',session,{image}),items=(data?.scan?.items||[]) as ScanItem[];
      if(!items.length)throw new Error(data?.scan?.reason||'Não encontrei peças suficientemente visíveis.');
      const ready=await Promise.all(items.map(async item=>({...item,crop:await cropByBox(image,item.box),selected:true})));
      setDetected(ready);await refreshWallet();setMode('ai-results');
    }catch(e:any){setMessage(e?.code==='closet_ai_locked'?'O Closet AI ainda está protegido enquanto finalizamos a cobrança por créditos. Nenhum crédito foi gasto.':e?.message||'Não consegui analisar a foto.')}finally{setBusy(false)}
  }

  async function saveManual(){
    const draft=activeDraft;if(!draft)return;
    if(!session){requireAuth('save');return}
    if(!draft.name.trim()){setMessage('Dê um nome para esta peça antes de guardar.');return}
    setSaving(true);setMessage('');
    try{
      await saveClosetItem(session,{name:draft.name.trim(),category:draft.category,color:draft.color.trim(),source:{subcategory:draft.subcategory.trim(),pattern:null,style:null,confidence:1,visibility:1,manual:true,batch_free:manualDrafts.length>1},catalogImage:draft.image,originalImage:draft.image});
      const remaining=manualDrafts.filter(x=>x.id!==draft.id);
      if(!remaining.length){location.href='/closet/wardrobe';return}
      const next=remaining[Math.min(activeIndex,remaining.length-1)]||remaining[0];
      setManualDrafts(remaining);setActiveDraftId(next.id);
      setMessage(`Peça guardada. Faltam ${remaining.length} ${remaining.length===1?'foto':'fotos'} para cadastrar.`);
    }catch(e:any){setMessage(e?.message||'Não consegui guardar a peça.')}finally{setSaving(false)}
  }

  async function saveDetected(item:Detected,index:number,useAi:boolean){
    if(!session){requireAuth(useAi?'ai':'save');return}
    setBusy(true);setMessage('');
    try{
      let asset=item.crop;
      if(useAi){
        if((wallet?.balance||0)<1)throw Object.assign(new Error('Você precisa de 1 crédito para melhorar esta peça.'),{code:'insufficient_ai_credits'});
        const data=await apiJson('/api/closet/catalogize',session,{image:item.crop,item});asset=String(data.image);setDetected(v=>v.map((x,i)=>i===index?{...x,catalog:asset}:x));await refreshWallet();
      }
      await saveClosetItem(session,{name:item.name,category:item.category,color:item.color,source:{...item,ai_catalog:Boolean(useAi)},catalogImage:asset,originalImage:image});
      setDetected(v=>v.map((x,i)=>i===index?{...x,selected:false}:x));setMessage(`${item.name} guardado${useAi?' com versão de catálogo':''}.`);
    }catch(e:any){setMessage(e?.code==='closet_ai_locked'?'O Closet AI ainda está protegido. Nenhum crédito foi gasto.':e?.message||'Não consegui guardar esta peça.')}finally{setBusy(false)}
  }
  async function saveAllFree(){
    if(!session){requireAuth('save');return}
    const pending=detected.filter(x=>x.selected);if(!pending.length)return;
    setBusy(true);setMessage('');
    try{await saveClosetItems(session,pending.map(item=>({name:item.name,category:item.category,color:item.color,source:{...item,ai_catalog:false,batch_free:true},catalogImage:item.crop,originalImage:image})));setDetected(v=>v.map(x=>({...x,selected:false})));setMessage(`${pending.length} ${pending.length===1?'peça guardada':'peças guardadas'} sem gastar créditos.`)}catch(e:any){setMessage(e?.message||'Não consegui guardar todas as peças.')}finally{setBusy(false)}
  }

  return <main className={styles.page}>
    <header><button onClick={()=>history.back()}>‹</button><div><span>ADICIONAR PEÇA</span><strong>Novo item</strong></div><button onClick={()=>location.href='/closet'}>⌂</button></header>
    {mode==='choose'?<section className={styles.choose}>
      <span>VOCÊ ESCOLHE</span><h1>Cadastre grátis ou deixe a IA ajudar.</h1><p>O Closet funciona sem IA. Recursos inteligentes só são usados quando você escolhe explicitamente — e o custo aparece antes.</p>
      <button className={styles.freeCard} onClick={()=>setMode('manual')}><b>GRÁTIS</b><strong>Cadastrar pela foto</strong><small>Escolha uma ou várias fotos do celular. Sem scanner, sem reconstrução e sem créditos.</small><i>Continuar →</i></button>
      <button className={styles.aiCard} onClick={()=>setMode('ai-photo')}><b>CLOSET AI</b><strong>Scanner inteligente</strong><small>Uma foto pode conter várias peças. O scanner custa 1 crédito por foto analisada. Depois você decide, peça por peça, se quer melhorar a imagem por mais 1 crédito.</small><i>{wallet?`${wallet.balance} créditos disponíveis`:session?'Carregando saldo':'Ver como funciona'} →</i></button>
      <div className={styles.note}>Fotos da galeria nunca acionam IA sozinhas. Selecionar ou fotografar uma peça não consome crédito.</div>
    </section>:mode==='manual'?<section className={styles.manual}>
      <div className={styles.title}><span>CADASTRO GRATUITO</span><h1>Uma ou várias fotos. Zero créditos.</h1><p>Selecione várias peças de uma vez e cadastre cada uma usando a própria foto. O scanner não participa deste fluxo.</p></div>
      {!manualDrafts.length?<div className={styles.capture}>
        <button disabled={busy} onClick={()=>camera.current?.click()}><span>◎</span><strong>{busy?'Abrindo…':'Tirar foto'}</strong><small>usar câmera</small></button>
        <button disabled={busy} onClick={()=>gallery.current?.click()}><span>▧</span><strong>{busy?'Carregando…':'Escolher da galeria'}</strong><small>selecionar várias fotos</small></button>
      </div>:activeDraft&&<>
        {manualDrafts.length>1&&<div style={{display:'grid',gap:9,marginBottom:14}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><strong style={{fontSize:12}}>{activeIndex+1} de {manualDrafts.length} fotos</strong><button onClick={()=>gallery.current?.click()} style={{border:'1px solid #d9cbbb',background:'#fffaf3',borderRadius:12,padding:'8px 10px',fontWeight:800}}>+ adicionar mais</button></div><div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4}}>{manualDrafts.map((d,i)=><button key={d.id} onClick={()=>setActiveDraftId(d.id)} style={{flex:'0 0 64px',height:70,border:d.id===activeDraft.id?'2px solid #2b211b':'1px solid #d8c9b8',borderRadius:12,padding:2,background:'#fff',overflow:'hidden',position:'relative'}}><img src={d.image} alt={`Foto ${i+1}`} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:9}}/><span style={{position:'absolute',right:4,bottom:4,minWidth:18,height:18,borderRadius:9,background:'rgba(37,30,24,.85)',color:'#fff',fontSize:9,display:'grid',placeItems:'center'}}>{i+1}</span></button>)}</div></div>}
        <div className={styles.preview}><img src={activeDraft.image} alt="Peça escolhida"/><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button onClick={()=>gallery.current?.click()}>Adicionar fotos</button><button onClick={()=>removeDraft(activeDraft.id)}>Remover esta</button></div></div>
        <div className={styles.form}>
          <label>Nome<input value={activeDraft.name} onChange={e=>patchDraft({name:e.target.value})} placeholder="Ex.: Camisa off-white"/></label>
          <label>Categoria<select value={activeDraft.category} onChange={e=>patchDraft({category:e.target.value as Category})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
          <label>Cor<input value={activeDraft.color} onChange={e=>patchDraft({color:e.target.value})} placeholder="Ex.: Off-white"/></label>
          <label>Tipo<input value={activeDraft.subcategory} onChange={e=>patchDraft({subcategory:e.target.value})} placeholder="Ex.: Camisa social"/></label>
        </div>
        <button disabled={saving} onClick={saveManual}>{saving?'Guardando…':'Guardar peça'}</button>
      </>}
    </section>:mode==='ai-photo'?<section className={styles.manual}>
      <div className={styles.title}><span>CLOSET AI</span><h1>Escolha uma foto para o scanner.</h1><p>Uma foto pode conter várias peças. Tirar ou selecionar a foto é grátis; nenhum crédito é usado até você confirmar a análise.</p></div>
      <div className={styles.capture}>
        <button disabled={busy} onClick={()=>aiCamera.current?.click()}><span>◎</span><strong>Tirar foto</strong><small>nenhum crédito ainda</small></button>
        <button disabled={busy} onClick={()=>aiGallery.current?.click()}><span>▧</span><strong>Escolher da galeria</strong><small>nenhum crédito ainda</small></button>
      </div>
      <button onClick={()=>setMode('choose')}>Voltar</button>
    </section>:mode==='ai-confirm'?<section className={styles.manual}>
      <div className={styles.title}><span>CONFIRMAR SCANNER</span><h1>Esta foto pode virar várias peças.</h1><p>O scanner identifica todas as peças visíveis nesta única foto por <strong>1 crédito</strong>. Depois, salvar os recortes encontrados é grátis.</p></div>
      <div className={styles.preview}><img src={image} alt="Foto pronta para análise"/></div>
      <div className={styles.balance}><span>Custo desta análise</span><strong>1 crédito</strong><a href="/closet/credits">Saldo: {wallet?.balance??0}</a></div>
      <button disabled={busy} onClick={runAiScan}>{busy?'Analisando…':'Usar 1 crédito e analisar'}</button>
      <button disabled={busy} onClick={()=>setMode('ai-photo')}>Escolher outra foto</button>
    </section>:<section className={styles.results}>
      <div className={styles.title}><span>PEÇAS ENCONTRADAS</span><h1>{detected.length} {detected.length===1?'peça identificada':'peças identificadas'}.</h1><p>O scanner já foi concluído. Salvar os recortes é grátis. Só a melhoria de catálogo usa mais 1 crédito por peça.</p></div>
      <div className={styles.balance}><span>Saldo atual</span><strong>{wallet?.balance??0} créditos</strong><a href="/closet/credits">Ver carteira</a></div>
      <button disabled={busy||!detected.some(x=>x.selected)} onClick={saveAllFree}>Salvar todas com os recortes · grátis</button>
      <div style={{display:'grid',gap:12,marginTop:14}}>{detected.map((item,index)=><article key={`${item.name}-${index}`} style={{display:'grid',gridTemplateColumns:'88px 1fr',gap:12,alignItems:'start',padding:12,border:'1px solid #e4d8ca',borderRadius:16,background:'#fff'}}><img src={item.catalog||item.crop} alt={item.name} style={{width:88,height:104,objectFit:'cover',borderRadius:12}}/><div style={{display:'grid',gap:6}}><strong>{item.name}</strong><small>{item.category} · {item.color}</small>{item.selected?<><button disabled={busy} onClick={()=>saveDetected(item,index,false)}>Salvar recorte · grátis</button><button disabled={busy} onClick={()=>saveDetected(item,index,true)}>Melhorar e salvar · 1 crédito</button></>:<small>Guardado</small>}</div></article>)}</div>
    </section>}
    {message&&<p>{message}</p>}
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={receiveManual}/>
    <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={receiveManual}/>
    <input ref={aiCamera} type="file" accept="image/*" capture="environment" hidden onChange={receiveAi}/>
    <input ref={aiGallery} type="file" accept="image/*" hidden onChange={receiveAi}/>
    <ClosetAuth open={authOpen} onClose={()=>setAuthOpen(false)} session={session} onSessionChange={handleSessionChange}/>
  </main>
}
