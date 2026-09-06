'use client';

import {useEffect} from 'react';

export default function ClosetStylistRedirect(){
 useEffect(()=>{
  const normalize=(p:string)=>p.length>1?p.replace(/\/+$/,''):p;
  function shouldIntercept(){const p=normalize(location.pathname);return p==='/closet'||p==='/closet/wardrobe'||p==='/closet/looks'}
  function go(anchor?:string){const q=anchor?`?anchor=${encodeURIComponent(anchor)}`:'';location.href=`/closet/stylist/${q}`}
  function onClick(e:MouseEvent){
   if(!shouldIntercept())return;
   const el=(e.target as HTMLElement|null)?.closest('button,a');if(!el)return;
   const text=(el.textContent||'').trim().toLowerCase();
   const href=el instanceof HTMLAnchorElement?(el.getAttribute('href')||''):'';
   const directLook=/\/closet\/look\/?(?:\?|$)/.test(href)&&!href.includes('/travel/');
   const byText=(text.includes('montar')&&text.includes('look'))||text.includes('novo look');
   if(!directLook&&!byText)return;
   const anchor=href.match(/[?&]anchor=([^&]+)/)?.[1];
   e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();go(anchor?decodeURIComponent(anchor):undefined);
  }
  const observer=new MutationObserver(()=>{
   if(normalize(location.pathname)!=='/closet')return;
   const body=(document.body.textContent||'').toLowerCase();
   if(body.includes('escolha uma ocasião')||body.includes('onde você vai?'))go();
  });
  document.addEventListener('click',onClick,true);
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  return()=>{document.removeEventListener('click',onClick,true);observer.disconnect()};
 },[]);
 return null;
}
