'use client';
import {useEffect} from 'react';

export default function ClosetAddRedirect(){
 useEffect(()=>{
  function goToAdd(){
   if(window.location.pathname==='/closet')window.location.replace('/closet/add');
  }
  function onClick(e:MouseEvent){
   if(window.location.pathname!=='/closet')return;
   const target=e.target as HTMLElement|null;
   const button=target?.closest('button,a');
   if(!button)return;
   const text=(button.textContent||'').trim().toLowerCase();
   const href=button instanceof HTMLAnchorElement?button.getAttribute('href')||'':'';
   const isAddText=
    text.includes('adicionar peça')||
    text.includes('adicionar peças')||
    text.includes('adicionar ao closet')||
    text.includes('tirar outra foto')||
    text==='galeria'||
    text==='escolher foto'||
    text==='tirar foto'||
    text==='+ adicionar';
   const isLegacyAddHref=href==='/closet?add=1'||href==='/closet#add';
   if(isAddText||isLegacyAddHref){
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    goToAdd();
   }
  }
  function onFile(e:Event){
   if(window.location.pathname!=='/closet')return;
   const input=e.target as HTMLInputElement|null;
   if(!input||input.tagName!=='INPUT'||input.type!=='file')return;
   e.preventDefault();
   e.stopPropagation();
   e.stopImmediatePropagation();
   input.value='';
   goToAdd();
  }
  function hasLegacyScannerUi(){
   const text=(document.body?.innerText||'').toLowerCase();
   return text.includes('uma foto pode virar várias peças')||
    text.includes('scanner do closet')||
    text.includes('não consegui preparar as peças')||
    text.includes('procurando todas as peças visíveis')||
    text.includes('criando versões de catálogo');
  }
  const observer=new MutationObserver(()=>{
   if(window.location.pathname!=='/closet')return;
   if(hasLegacyScannerUi())goToAdd();
  });
  document.addEventListener('click',onClick,true);
  document.addEventListener('change',onFile,true);
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  if(hasLegacyScannerUi())goToAdd();
  return()=>{
   document.removeEventListener('click',onClick,true);
   document.removeEventListener('change',onFile,true);
   observer.disconnect();
  };
 },[]);
 return null;
}
