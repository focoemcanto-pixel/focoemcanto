'use client';
import {useEffect} from 'react';

export default function ClosetAddRedirect(){
 useEffect(()=>{
  const normalize=(pathname:string)=>pathname.length>1?pathname.replace(/\/+$/,''):pathname;
  const isClosetHome=()=>normalize(window.location.pathname)==='/closet';
  function goToAdd(){if(isClosetHome())window.location.replace('/closet/add/')}
  function onClick(e:MouseEvent){
   if(!isClosetHome())return;
   const target=e.target as HTMLElement|null;
   const button=target?.closest('button,a');
   if(!button)return;
   const text=(button.textContent||'').trim().toLowerCase();
   const href=button instanceof HTMLAnchorElement?button.getAttribute('href')||'':'';
   const normalizedHref=href.replace(/\/+$/,'');
   const isAddText=
    text.includes('adicionar peça')||
    text.includes('adicionar peças')||
    text.includes('adicionar ao closet')||
    text.includes('tirar outra foto')||
    text.includes('escolher foto')||
    text==='galeria'||
    text==='+ adicionar';
   const isLegacyAddHref=normalizedHref==='/closet?add=1'||normalizedHref==='/closet#add';
   if(isAddText||isLegacyAddHref){
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    goToAdd();
   }
  }
  function onFile(e:Event){
   if(!isClosetHome())return;
   const input=e.target as HTMLInputElement|null;
   if(!input||input.tagName!=='INPUT'||input.type!=='file')return;
   e.preventDefault();
   e.stopPropagation();
   e.stopImmediatePropagation();
   input.value='';
   goToAdd();
  }
  const observer=new MutationObserver(()=>{
   if(!isClosetHome())return;
   const text=(document.body.textContent||'').toLowerCase();
   const legacySheet=
    text.includes('uma foto pode virar várias peças')||
    text.includes('scanner do closet')||
    text.includes('não consegui preparar as peças')||
    text.includes('criando peças para o closet');
   if(legacySheet)goToAdd();
  });
  document.addEventListener('click',onClick,true);
  document.addEventListener('change',onFile,true);
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  return()=>{
   document.removeEventListener('click',onClick,true);
   document.removeEventListener('change',onFile,true);
   observer.disconnect();
  };
 },[]);
 return null;
}
