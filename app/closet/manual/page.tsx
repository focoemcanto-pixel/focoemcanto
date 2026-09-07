'use client';

import {useEffect,useMemo,useState} from 'react';
import TryOnStage from '../TryOnStage';
import {loadClosetItems,restoreClosetSession,type ClosetSession} from '../supabase';
import {loadStyleProfile} from '../styleProfile';
import {saveLook} from '../savedLooks';
import {ensureMandatoryAccessories,isBaseTop,isOuterwear,sortLookForTryOn,type LookLayer} from '../lookSemantics';
import type {StylistPiece,StyleProfile} from '../lookEngine';
import styles from './manual.module.css';

type Piece=StylistPiece&{dbMetadata?:Record<string,any>};
const models=[{id:'m-1',name:'Masculino clássico',hint:'Corpo médio · atlético',glyph:'M'},{id:'m-2',name:'Masculino slim',hint:'Corpo mais esguio',glyph:'M'},{id:'m-3',name:'Masculino amplo',hint:'Estrutura mais larga',glyph:'M'},{id:'f-1',name:'Feminino clássico',hint:'Corpo médio',glyph:'F'},{id:'f-2',name:'Feminino slim',hint:'Corpo mais esguio',glyph:'F'},{id:'f-3',name:'Feminino curvas',hint:'Corpo com curvas',glyph:'F'}];
function mapRows(rows:any[]):Piece[]{return rows.map(r=>({id:r.id,category:r.category,name:r.name,meta:[r.color,r.subcategory,r.pattern,r.style].filter(Boolean).join(' · '),image:r.image||'',dbMetadata:r.metadata||{},stylistPreference:r.metadata?.stylist_preference||{},wardrobeStatus:r.metadata?.wardrobe_status||'available'}))}
function currentContext(){if(typeof window==='undefined')return{} as any;try{return JSON.parse(sessionStorage.getItem('closet_stylist_context')||'{}')||{}}catch{return{} as any}}
function labelFor(layer:LookLayer){return ({'base-top':'Parte de cima','outerwear':'Camada externa','dress':'Vestido','bottom':'Parte de baixo','shoes':'Calçado','mandatory-accessory':'Obrigatório','accessory':'Acessórios'} as Record<string,string>)[layer]||layer}
function colorText(p:Piece){return p.meta.split(' · ')[0]||''}
function norm(v:string){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/-/g,' ').trim()}
function paletteMatch(p:Piece,colors:string[]){const c=norm(colorText(p));return Boolean(c&&colors.some(x=>norm(x)===c))}
function thermalWarning(p:Piece,profile:StyleProfile){const c=currentContext(),w=c.weather||profile.weather_context||{},max=Number(w.feelsMax??w.tempMax),t=norm(`${p.name} ${p.meta}`);if(!Number.isFinite(max))return'';if(max>=29&&/jaqueta|blazer|casaco|sobretudo|puffer|parka|sueter|tricot/.test(t))return`Pode ficar quente para ${Math.round(max)}°.`;if(max<=18&&/regata|short|bermuda|sandalia/.test(t))return`Pode ficar leve demais para ${Math.round(max)}°.`;return''}
function pieceText(p:Piece){return norm(`${p.name} ${p.meta}`)}
function styleWarning(selected:Piece[],p:Piece){
 const items=[...selected,p],texts=items.map(pieceText),all=texts.join(' | ');
 if(/camisa social/.test(all)&&/jogger|calca moletom/.test(all))return'Essa combinação mistura formalidade muito distante.';
 if(/blazer/.test(all)&&/short|bermuda/.test(all))return'Blazer + peça muito curta tende a exigir intenção de styling específica.';
 if(/alfaiataria|camisa social|blazer/.test(all)&&/running|corrida|treino|esportivo performance/.test(all))return'O calçado esportivo de performance quebra bastante a linguagem social.';
 const wide=texts.filter(t=>/oversized|amplo|wide|baggy|relaxed|boxy|pantalona/.test(t)).length;
 if(wide>=2)return'Há bastante volume em cima e embaixo. Pode funcionar, mas exige proporção intencional.';
 const tight=texts.filter(t=>/skinny|super slim|muito justo/.test(t)).length;
 if(tight>=2)return'O look está muito ajustado em mais de uma peça; confira se esse é o efeito desejado.';
 if(/puffer|parka|sobretudo/.test(all)&&/moletom|hoodie|sueter grosso/.test(all))return'Muitas camadas volumosas podem pesar visualmente e termicamente.';
 if(/estampad|xadrez|listr|floral/.test(texts[0]||'')&&texts.slice(1).some(t=>/estampad|xadrez|listr|floral/.test(t)))return'Duas estampas fortes pedem atenção à escala e às cores.';
 return'';
}

export default function ManualBuilder(){
 const [session,setSession]=useState<ClosetSession|null>(null),[profile,setProfile]=useState<StyleProfile>({}),[pieces,setPieces]=useState<Piece[]>([]),[loading,setLoading]=useState(true),[occasion,setOccasion]=useState('Uso livre'),[selected,setSelected]=useState<Record<string,Piece|undefined>>({}),[accessories,setAccessories]=useState<Piece[]>([]),[picker,setPicker]=useState<LookLayer|null>(null),[tryOn,setTryOn]=useState(false),[avatarId,setAvatarId]=useState('m-1'),[saving,setSaving]=useState(false),[toast,setToast]=useState('');
 const ctx=currentContext(),colors=Array.isArray(ctx.colors)?ctx.colors:[];
 useEffect(()=>{let alive=true;(async()=>{const s=await restoreClosetSession();if(!alive)return;if(!s){setLoading(false);return}setSession(s);const [rows,p]=await Promise.all([loadClosetItems(s),loadStyleProfile(s)]);if(!alive)return;const mapped=mapRows(rows);setPieces(mapped);setProfile(p||{});setOccasion(new URLSearchParams(location.search).get('occasion')||ctx.occasion||'Uso livre');const mandatory=ensureMandatoryAccessories([],mapped,ctx.occasion||'Uso livre').filter((x:any)=>x.category==='Acessórios'||x.category==='Bolsas') as Piece[];setAccessories(mandatory);setLoading(false)})().catch(()=>setLoading(false));return()=>{alive=false}},[]);
 const available=useMemo(()=>pieces.filter(p=>!p.wardrobeStatus||p.wardrobeStatus==='available'),[pieces]);
 const pools=useMemo(()=>({
  'base-top':available.filter(isBaseTop),
  outerwear:available.filter(isOuterwear),
  dress:available.filter(p=>p.category==='Vestidos'),
  bottom:available.filter(p=>p.category==='Calças'),
  shoes:available.filter(p=>p.category==='Calçados'),
  accessory:available.filter(p=>p.category==='Acessórios'||p.category==='Bolsas'),
  'mandatory-accessory':[] as Piece[]
 }),[available]);
 const composed=useMemo(()=>{let arr=[selected['base-top'],selected.dress,selected.outerwear,selected.bottom,selected.shoes].filter(Boolean) as Piece[];arr=[...arr,...accessories];return sortLookForTryOn(arr)},[selected,accessories]);
 const ready=Boolean(selected.dress?selected.shoes:(selected['base-top']&&selected.bottom&&selected.shoes));
 function notify(m:string){setToast(m);window.setTimeout(()=>setToast(''),2200)}
 function pick(layer:LookLayer,p:Piece){if(layer==='accessory'){setAccessories(v=>v.some(x=>String(x.id)===String(p.id))?v.filter(x=>String(x.id)!==String(p.id)):[...v,p]);return}const next={...selected,[layer]:p};if(layer==='dress'){next['base-top']=undefined;next.bottom=undefined}else if(layer==='base-top'||layer==='bottom')next.dress=undefined;setSelected(next);setPicker(null)}
 function remove(layer:LookLayer){setSelected(v=>({...v,[layer]:undefined}))}
 async function save(){if(!session||!ready)return;setSaving(true);try{sessionStorage.setItem('closet_stylist_context',JSON.stringify({...ctx,occasion,source:'manual',createdAt:new Date().toISOString()}));await saveLook(session,{occasion,itemIds:composed.map(p=>String(p.id)),rating:'saved',source:'manual',tags:['manual']});notify('Look manual salvo ♡')}catch(e:any){notify(e?.message||'Não consegui salvar.')}finally{setSaving(false)}}
 function warningFor(p:Piece){return thermalWarning(p,profile)||styleWarning(composed.filter(x=>String(x.id)!==String(p.id)),p)}
 if(loading)return <main className={styles.page}><div className={styles.loading}>Abrindo seu guarda-roupa…</div></main>;
 if(!session)return <main className={styles.page}><div className={styles.empty}><h1>Entre no Closet primeiro.</h1><button onClick={()=>location.href='/closet/'}>Voltar</button></div></main>;
 if(tryOn)return <main className={styles.page}><TryOnStage pieces={composed} models={models} avatarId={avatarId} image="" busy={false} error="" onAvatarChange={setAvatarId} onGenerate={()=>{}} onSwap={()=>setTryOn(false)} onRemix={()=>setTryOn(false)} onResetModel={()=>{}} onClose={()=>setTryOn(false)}/></main>;
 return <main className={styles.page}><header><button onClick={()=>history.back()}>‹</button><div><span>MONTAGEM MANUAL</span><strong>{occasion}</strong></div><button onClick={()=>location.href='/closet/'}>⌂</button></header><section className={styles.shell}><div className={styles.hero}><span>VOCÊ DECIDE</span><h1>Monte peça por peça.</h1><p>O Closet orienta, mas não bloqueia. Paleta, clima e coerência aparecem como dicas — a decisão final é sua.</p></div>
 <div className={styles.slots}>{(['base-top','outerwear','bottom','shoes'] as LookLayer[]).map(layer=>{const p=selected[layer];return <button key={layer} className={styles.slot} onClick={()=>setPicker(layer)}>{p?<><img src={p.image} alt={p.name}/><div><span>{labelFor(layer)}</span><strong>{p.name}</strong><small>{warningFor(p)||'Toque para trocar'}</small></div></>:<><i>＋</i><div><span>{labelFor(layer)}</span><strong>{layer==='outerwear'?'Opcional':'Escolher peça'}</strong><small>{layer==='outerwear'?'Jaqueta, blazer ou casaco':'Toque para abrir seu Closet'}</small></div></>}</button>})}</div>
 <div className={styles.alt}><span>OU LOOK DE UMA PEÇA</span><button onClick={()=>setPicker('dress')}>{selected.dress?<><img src={selected.dress.image} alt={selected.dress.name}/><strong>{selected.dress.name}</strong></>:<>Escolher vestido</>}</button></div>
 <div className={styles.accessoryBlock}><div><span>ACESSÓRIOS</span><strong>{accessories.length?`${accessories.length} no look`:'Adicionar acessórios'}</strong></div><button onClick={()=>setPicker('accessory')}>Gerenciar</button><div className={styles.accessoryRail}>{accessories.map(p=><button key={p.id} onClick={()=>{if((p.stylistPreference as any)?.mandatory){notify('Este acessório está marcado como obrigatório. Altere na peça para removê-lo.');return}setAccessories(v=>v.filter(x=>String(x.id)!==String(p.id)))}}><img src={p.image} alt={p.name}/><small>{(p.stylistPreference as any)?.mandatory?'obrigatório':'remover'}</small></button>)}</div></div>
 {colors.length>0&&<div className={styles.context}><span>PALETA ATIVA</span><strong>{colors.join(' + ')}</strong><p>Peças da paleta aparecem primeiro no seletor, mas outras continuam disponíveis.</p></div>}
 <div className={styles.actions}><button disabled={!ready} onClick={()=>setTryOn(true)}>Ver no provador</button><button disabled={!ready||saving} onClick={save}>{saving?'Salvando…':'Salvar look'}</button></div></section>
 {picker&&<div className={styles.sheetBackdrop} onClick={()=>setPicker(null)}><div className={styles.sheet} onClick={e=>e.stopPropagation()}><div className={styles.sheetHead}><div><span>{labelFor(picker)}</span><strong>Escolha livremente</strong></div><button onClick={()=>setPicker(null)}>×</button></div>{picker!=='accessory'&&selected[picker]&&<button className={styles.remove} onClick={()=>{remove(picker);setPicker(null)}}>Remover esta camada</button>}<div className={styles.grid}>{(pools[picker]||[]).slice().sort((a,b)=>Number(paletteMatch(b,colors))-Number(paletteMatch(a,colors))).map(p=>{const on=picker==='accessory'?accessories.some(x=>String(x.id)===String(p.id)):String(selected[picker]?.id||'')===String(p.id);return <button key={p.id} className={on?styles.selected:''} onClick={()=>pick(picker,p)}><img src={p.image} alt={p.name}/><div><strong>{p.name}</strong><small>{paletteMatch(p,colors)?'na paleta':warningFor(p)||colorText(p)}</small></div></button>})}</div></div></div>}
 <div className={`${styles.toast} ${toast?styles.show:''}`}>{toast}</div></main>
}
