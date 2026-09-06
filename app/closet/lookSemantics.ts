import type {StylistPiece} from './lookEngine';

export type LookLayer='base-top'|'outerwear'|'dress'|'bottom'|'shoes'|'mandatory-accessory'|'accessory';

function norm(v:string){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/-/g,' ').replace(/\s+/g,' ').trim()}
function text(p:StylistPiece){return norm(`${p.name||''} ${p.meta||''}`)}

export function isOuterwear(p:StylistPiece){
 const t=text(p);
 return /\bjaqueta\b|\bblazer\b|\bcasaco\b|sobretudo|parka|puffer|cardigan|trench|corta vento|corta-vento|anorak/.test(t);
}
export function isBaseTop(p:StylistPiece){return p.category==='Blusas'&&!isOuterwear(p)}
export function isMandatoryAccessory(p:StylistPiece){return Boolean((p.stylistPreference as any)?.mandatory)}
export function mandatoryOccasions(p:StylistPiece){const v=(p.stylistPreference as any)?.mandatory_occasions;return Array.isArray(v)?v.map(norm):[]}
export function mandatoryForOccasion(p:StylistPiece,occasion:string){if(!isMandatoryAccessory(p))return false;const only=mandatoryOccasions(p);return !only.length||only.includes(norm(occasion))}

export function layerOf(p:StylistPiece):LookLayer{
 if(p.category==='Vestidos')return'dress';
 if(p.category==='Blusas')return isOuterwear(p)?'outerwear':'base-top';
 if(p.category==='Calças')return'bottom';
 if(p.category==='Calçados')return'shoes';
 if(isMandatoryAccessory(p))return'mandatory-accessory';
 return'accessory';
}

const order:Record<LookLayer,number>={'base-top':10,dress:15,outerwear:20,bottom:30,shoes:40,'mandatory-accessory':50,accessory:60};
export function sortLookForTryOn<T extends StylistPiece>(items:T[]):T[]{return [...items].sort((a,b)=>order[layerOf(a)]-order[layerOf(b)])}

export function hasSemanticBase(items:StylistPiece[]){return items.some(p=>p.category==='Vestidos'||isBaseTop(p))}
export function hasOuterwear(items:StylistPiece[]){return items.some(isOuterwear)}

export function thermalLevel(p:StylistPiece){
 const explicit=Number((p as any)?.dbMetadata?.thermal_level ?? (p as any)?.metadata?.thermal_level);
 if(Number.isFinite(explicit)&&explicit>=1&&explicit<=5)return explicit;
 const t=text(p);
 if(/puffer|parka|sobretudo|fleece|l[aã]|cashmere|segunda pele|t[eé]rmic/.test(t))return 5;
 if(/casaco|jaqueta de couro|couro|trench|anorak/.test(t))return 4;
 if(/jaqueta|blazer|cardigan|su[eé]ter|tricot/.test(t))return 3;
 if(/camisa|polo|jeans|chino|alfaiataria/.test(t))return 2;
 return 1;
}

export function ensureMandatoryAccessories<T extends StylistPiece>(look:T[],all:T[],occasion:string){
 const ids=new Set(look.map(x=>String(x.id)));
 const required=all.filter(p=>mandatoryForOccasion(p,occasion)&&!ids.has(String(p.id))&&(p.category==='Acessórios'||p.category==='Bolsas'));
 return [...look,...required];
}

export function ensureBaseUnderOuterwear<T extends StylistPiece>(look:T[],all:T[],occasion:string){
 if(!hasOuterwear(look)||hasSemanticBase(look))return look;
 const current=new Set(look.map(x=>String(x.id)));
 const pool=all.filter(p=>isBaseTop(p)&&!current.has(String(p.id))&&(!p.wardrobeStatus||p.wardrobeStatus==='available')&&p.stylistPreference?.frequency!=='never');
 if(!pool.length)return look;
 const preferred=pool.find(p=>/branco|preto|off white|off-white|bege|cinza|azul marinho/.test(text(p)))||pool[0];
 const outerIndex=look.findIndex(isOuterwear);
 const next=[...look];next.splice(Math.max(0,outerIndex),0,preferred);return next;
}
