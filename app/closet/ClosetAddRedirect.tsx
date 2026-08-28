'use client';
import {useEffect} from 'react';

export default function ClosetAddRedirect(){
 useEffect(()=>{
  function onClick(e:MouseEvent){
   if(!window.location.pathname.startsWith('/closet'))return;
   const target=e.target as HTMLElement|null;
   const button=target?.closest('button,a');
   if(!button)return;
   const text=(button.textContent||'').trim().toLowerCase();
   const href=button instanceof HTMLAnchorElement?button.getAttribute('href')||'':'';
   const isAddText=text.includes('adicionar peça')||text.includes('adicionar peças')||text.includes('adicionar ao closet')||text==='+ adicionar';
   const isLegacyAddHref=href==='/closet?add=1'||href==='/closet#add';
   if(isAddText||isLegacyAddHref){
    e.preventDefault();
    e.stopPropagation();
    window.location.href='/closet/add';
   }
  }
  document.addEventListener('click',onClick,true);
  return()=>document.removeEventListener('click',onClick,true);
 },[]);
 return null;
}
