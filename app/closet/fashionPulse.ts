import type {StylistPiece,StyleProfile} from './lookEngine';

export const FASHION_PULSE_VERSION='2026-09';

function norm(v:string){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/-/g,' ').replace(/\s+/g,' ').trim()}
function text(p:StylistPiece){return norm(`${p.name||''} ${p.meta||''}`)}

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
 return Math.max(-2,Math.min(4,raw*interest));
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
 if(interest>=.7)return'Tendências atuais entram como inspiração, sem ultrapassar seu contexto pessoal.';
 return'Tendências entram apenas como um toque final na escolha.';
}
