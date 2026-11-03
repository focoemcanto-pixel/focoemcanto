'use client';
import {useEffect,useState} from 'react';
import type {CampaignState} from './prelaunch-model';
import s from './black.module.css';
export function blackInsideVisible(campaign:CampaignState|null,now:number) {
 const benefit=campaign?.inside;
 return campaign?.phase==='open'&&benefit?.available===true&&['scheduled','active'].includes(benefit.status)&&Number.isFinite(Date.parse(benefit.acquisition_ends_at))&&now<Date.parse(benefit.acquisition_ends_at);
}
export default function BlackInside({campaign}:{campaign:CampaignState|null}) {
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const update=()=>setNow(Date.now());const tick=setInterval(update,1000);window.addEventListener('pageshow',update);return()=>{clearInterval(tick);window.removeEventListener('pageshow',update);};},[]);
 if(!blackInsideVisible(campaign,now))return null;
 const format=(value:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Bahia',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value));
 const benefit=campaign!.inside!,lastDay=new Date(Date.parse(benefit.ends_at)-1).toISOString();
 return <section className={s.included} aria-labelledby="black-inside-title"><div className={s.includedHeading}>
  <p className={s.eyebrow}>BENEFÍCIO ESPECIAL DE ABERTURA</p><h2 id="black-inside-title">BLACK<br/><em>INSIDE.</em></h2>
  <p>60 dias nos bastidores de Marcos Cruz.</p>
 </div><div style={{maxWidth:760,lineHeight:1.7,fontSize:'clamp(17px,2vw,21px)'}}>
  <p>Uma experiência privada nos Melhores Amigos do Instagram de Marcos: rotina vocal, preparação para cantar, ensaios, estudos, repertório e bastidores profissionais e musicais.</p>
  <p>De {format(benefit.starts_at)} a {format(lastDay)}. No Foco Premium, Marcos acompanha a sua evolução. No BLACK INSIDE, você acompanha os bastidores dele.</p>
  <p>Não inclui análise individual, suporte privado ou uma segunda mentoria.</p>
  <p>Incluído nas compras elegíveis até <strong>{format(new Date(Date.parse(benefit.acquisition_ends_at)-1).toISOString())}, às 23h59</strong>, horário de Brasília. Depois desse prazo, a oferta BLACK continua sem este benefício para novos compradores.</p>
 </div></section>;
}
