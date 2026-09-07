import type {StylistPiece,StyleProfile} from './lookEngine';

export const FASHION_PULSE_VERSION='2026-09-local';

function norm(v:string){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/-/g,' ').replace(/\s+/g,' ').trim()}
function text(p:StylistPiece){return norm(`${p.name||''} ${p.meta||''}`)}
function currentLocalContext(){if(typeof window==='undefined')return{} as any;try{return JSON.parse(sessionStorage.getItem('closet_stylist_context')||'{}')||{}}catch{return{} as any}}
function seasonFor(lat:number|null){const month=new Date().getMonth()+1;if(lat==null||!Number.isFinite(lat)||Math.abs(lat)<8)return'tropical';const south=lat<0;const seasonNorth=month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter';if(!south)return seasonNorth;return ({spring:'autumn',summer:'winter',autumn:'spring',winter:'summer'} as Record<string,string>)[seasonNorth]}
function localPulse(piece:StylistPiece,profile:StyleProfile){const c=currentLocalContext(),w:any=c.weather||profile.weather_context||{},lat=Number(w.lat),max=Number(w.feelsMax??w.tempMax),min=Number(w.feelsMin??w.tempMin),season=seasonFor(Number.isFinite(lat)?lat:null),t=text(piece);let s=0;if(Number.isFinite(max)&&max>=28){if(/linho|algodao|leve|respiravel|camiseta|polo|camisa/.test(t))s+=1.2;if(/puffer|parka|sobretudo|casaco pesado|la\b|tricot grosso/.test(t))s-=2.1}else if(Number.isFinite(max)&&max<=21){if(/tricot|sueter|jaqueta|casaco|bota|couro/.test(t))s+=.9;if(/regata|sandalia|short|bermuda/.test(t))s-=.8}if(Number.isFinite(min)&&min<=16&&/jaqueta|casaco|sueter|tricot/.test(t))s+=.5;if(Number.isFinite(lat)&&Math.abs(lat)<23.5){if(/linho|algodao|leve|overshirt|camisa/.test(t))s+=.45;if(/puffer|sobretudo/.test(t))s-=.8}if(season==='summer'&&/linho|leve|off white|branco|bege|azul claro/.test(t))s+=.35;if(season==='winter'&&/tricot|couro|jaqueta|marrom|vinho|grafite/.test(t))s+=.35;return Math.max(-2.5,Math.min(2, s))}

// Tendência é deliberadamente um sinal fraco. Contexto, clima, coerência e gosto pessoal
// devem sempre vencer esta camada.
export function fashionPulseScore(piece:StylistPiece,profile:StyleProfile={}){
 const interest=Math.max(0,Math.min(1,Number((profile as any).trend_interest??.35)));
 if(interest<=0)return 0;
 const t=text(piece);let raw=0;
 if(/alfaiataria|chino|calca reta|calca ampla|wide|relaxed|straight/.test(t))raw+=1.7;
 if(/workwear|utilitario|cargo|bomber|overshirt|jaqueta/.test(t))raw+=1.1;
 if(/marrom|caramelo|creme|off white|azul marinho|cinza|bordo|vinho|verde oliva/.test(t))raw+=.75;
 if(/vermelho|amarelo|azul royal|verde vivo|roxo/.test(t))raw+=.45;
 if(/slim extremo|skinny/.test(t))raw-=.8;
 raw+=localPulse(piece,profile);
 return Math.max(-2.5,Math.min(4.5,raw*interest));
}

export function applyFashionPulseToProfile<T extends Record<string,any>>(profile:T):T{
 const interest=Math.max(0,Math.min(1,Number(profile?.trend_interest??.35)));
 if(interest<.7)return profile;
 const original=Array.isArray(profile.preferred_styles)?profile.preferred_styles:Array.isArray(profile.styles)?profile.styles:[];
 const trendHints=interest>=.9?['alfaiataria','relaxed','workwear']:['alfaiataria'];
 return {...profile,preferred_styles:[...new Set([...original,...trendHints])],fashion_pulse:FASHION_PULSE_VERSION} as T;
}

export function fashionPulseLabel(profile:StyleProfile={}){
 const interest=Number((profile as any).trend_interest??.35);
 if(interest<=.15)return'Tendências quase não influenciam seu Stylist.';
 if(interest>=.7)return'Tendências atuais entram como inspiração e são adaptadas ao clima/estação local, sem ultrapassar seu contexto pessoal.';
 return'Tendências entram apenas como um toque final, adaptado ao clima local.';
}
