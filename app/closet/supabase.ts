'use client';

export type ClosetSession={access_token:string;refresh_token?:string;user:{id:string;email?:string|null;user_metadata?:Record<string,any>}};
export type ClosetDbItem={
 id:string;user_id:string;name:string;category:string;subcategory?:string|null;color?:string|null;pattern?:string|null;style?:string|null;brand?:string|null;label_text?:string|null;
 original_image_path?:string|null;catalog_image_path?:string|null;confidence?:number|null;visibility?:number|null;metadata?:Record<string,any>|null;created_at?:string;
};

const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
const SESSION_KEY='closet_supabase_session_v1';

function configured(){return Boolean(url&&anon)}
function headers(token?:string,extra:Record<string,string>={}){return {apikey:anon,Authorization:`Bearer ${token||anon}`,...extra}}
async function readJson(r:Response){const t=await r.text();let data:any=null;try{data=t?JSON.parse(t):null}catch{data=t}if(!r.ok)throw new Error(data?.msg||data?.message||data?.error_description||data?.error||`Supabase ${r.status}`);return data}

export function getStoredSession():ClosetSession|null{
 if(typeof window==='undefined')return null;
 try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}
}
function storeSession(s:ClosetSession|null){if(typeof window==='undefined')return;if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY)}

export async function signInCloset(email:string,password:string){
 if(!configured())throw new Error('Supabase não configurado no deploy.');
 const r=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers:headers(undefined,{'Content-Type':'application/json'}),body:JSON.stringify({email,password})});
 const data=await readJson(r);const session={access_token:data.access_token,refresh_token:data.refresh_token,user:data.user} as ClosetSession;storeSession(session);return session;
}

export async function signUpCloset(email:string,password:string,name:string){
 if(!configured())throw new Error('Supabase não configurado no deploy.');
 const r=await fetch(`${url}/auth/v1/signup`,{method:'POST',headers:headers(undefined,{'Content-Type':'application/json'}),body:JSON.stringify({email,password,data:{name}})});
 const data=await readJson(r);
 if(data?.access_token){const session={access_token:data.access_token,refresh_token:data.refresh_token,user:data.user} as ClosetSession;storeSession(session);return {session,needsConfirmation:false}}
 return {session:null,needsConfirmation:true};
}

export function signOutCloset(){storeSession(null)}

async function authed(token:string,path:string,init:RequestInit={}){return fetch(`${url}${path}`,{...init,headers:{...headers(token),...(init.headers||{})}})}

async function signedImageUrl(token:string,path?:string|null){
 if(!path)return '';
 const r=await authed(token,`/storage/v1/object/sign/closet/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:60*60*12})});
 const data=await readJson(r);const signed=data?.signedURL||data?.signedUrl||'';return signed?`${url}/storage/v1${signed}`:'';
}

export async function loadClosetItems(session:ClosetSession){
 if(!configured())throw new Error('Supabase não configurado no deploy.');
 const r=await authed(session.access_token,'/rest/v1/closet_items?select=*&is_active=eq.true&order=created_at.desc');
 const rows=await readJson(r) as ClosetDbItem[];
 return Promise.all(rows.map(async row=>({...row,image:await signedImageUrl(session.access_token,row.catalog_image_path)})));
}

function dataUrlToBlob(dataUrl:string){const [head,b64]=dataUrl.split(',');const mime=head.match(/data:([^;]+)/)?.[1]||'image/png';const bin=atob(b64||'');const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new Blob([bytes],{type:mime})}
function extFromDataUrl(dataUrl:string,fallback='png'){const mime=dataUrl.match(/^data:image\/([^;]+)/i)?.[1]?.toLowerCase();return mime==='jpeg'||mime==='jpg'?'jpg':mime==='webp'?'webp':fallback}
async function upload(token:string,userId:string,folder:string,dataUrl:string){
 const ext=extFromDataUrl(dataUrl),path=`${userId}/${folder}/${crypto.randomUUID()}.${ext}`,blob=dataUrlToBlob(dataUrl);
 const r=await authed(token,`/storage/v1/object/closet/${path}`,{method:'POST',headers:{'Content-Type':blob.type,'x-upsert':'false'},body:blob});await readJson(r);return path;
}

export async function saveClosetItem(session:ClosetSession,input:{name:string;category:string;color:string;source:any;catalogImage:string;originalImage?:string}){
 const token=session.access_token,userId=session.user.id;
 const catalogPath=await upload(token,userId,'catalog',input.catalogImage);
 let originalPath:string|null=null;
 try{if(input.originalImage)originalPath=await upload(token,userId,'original',input.originalImage)}catch{}
 const s=input.source||{};
 const payload={user_id:userId,name:input.name,category:input.category,subcategory:s.subcategory||null,color:input.color||s.color||null,pattern:s.pattern||null,style:s.style||null,brand:s.brand||null,label_text:s.label_text||null,original_image_path:originalPath,catalog_image_path:catalogPath,confidence:s.confidence??null,visibility:s.visibility??null,metadata:{scanner_box:s.box||null},is_active:true};
 const r=await authed(token,'/rest/v1/closet_items',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(payload)});
 const rows=await readJson(r) as ClosetDbItem[];const row=rows[0];return {...row,image:await signedImageUrl(token,row.catalog_image_path)};
}
