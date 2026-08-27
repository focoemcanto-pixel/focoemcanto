'use client';
import {useEffect,useMemo,useState} from 'react';
import type {Trip} from '../../travelStore';

type Basic={id:string;label:string;qty:number};
function days(t:Trip){return Math.max(1,Math.round((new Date(`${t.end_date}T12:00:00`).getTime()-new Date(`${t.start_date}T12:00:00`).getTime())/86400000)+1)}

export default function TripBasicsCard({trip}:{trip:Trip}){
 const d=days(trip);
 const items=useMemo<Basic[]>(()=>[
  {id:'underwear',label:'Roupas íntimas',qty:d+1},
  {id:'socks',label:'Pares de meia',qty:d+1},
  {id:'sleep',label:'Pijama',qty:Math.max(1,Math.ceil(d/4))},
  {id:'hygiene',label:'Necessaire / higiene',qty:1},
  {id:'charger',label:'Carregadores essenciais',qty:1}
 ],[d]);
 const key=`closet.trip.basics.v1.${trip.id}`;
 const [checked,setChecked]=useState<Record<string,boolean>>({});
 useEffect(()=>{try{setChecked(JSON.parse(localStorage.getItem(key)||'{}'))}catch{}},[key]);
 function toggle(id:string){setChecked(v=>{const n={...v,[id]:!v[id]};localStorage.setItem(key,JSON.stringify(n));return n})}
 const done=items.filter(x=>checked[x.id]).length;
 return <section style={{margin:'0 0 14px',padding:16,border:'1px solid #dfd2c2',borderRadius:22,background:'#fffaf3'}}>
  <div><span style={{display:'block',fontSize:9,letterSpacing:'.18em',fontWeight:900,color:'#96795b'}}>BÁSICOS DA VIAGEM</span><strong style={{display:'block',font:'22px Georgia,serif',margin:'7px 0'}}>{done}/{items.length} categorias separadas</strong><p style={{margin:'0 0 13px',fontSize:12,lineHeight:1.5,color:'#75675a'}}>Calculado para {d} {d===1?'dia':'dias'}. Estes itens não dependem dos looks do Closet.</p></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8}}>{items.map(x=><button key={x.id} onClick={()=>toggle(x.id)} style={{display:'grid',gridTemplateColumns:'28px 1fr',gap:9,alignItems:'center',textAlign:'left',border:'1px solid #e0d3c3',borderRadius:14,padding:'10px 11px',background:checked[x.id]?'#eef0e8':'#fbf7f0',color:'#2b241e'}}><i style={{width:25,height:25,borderRadius:'50%',border:'1.5px solid #b8a28b',display:'grid',placeItems:'center',fontStyle:'normal',fontWeight:900,background:checked[x.id]?'#2b241e':'transparent',color:checked[x.id]?'#fff':'inherit'}}>{checked[x.id]?'✓':''}</i><span><b style={{display:'block',fontSize:11}}>{x.label}</b><small style={{display:'block',marginTop:3,fontSize:9,color:'#7d6d60'}}>{x.qty} {x.qty===1?'unidade':'unidades'}</small></span></button>)}</div>
 </section>
}
