'use client';

import { usePathname } from 'next/navigation';

export default function ClosetShellNav(){
 const pathname=usePathname();
 if(pathname==='/closet/look')return null;
 const items=[
  {href:'/closet',icon:'⌂',label:'Closet'},
  {href:'/closet/looks',icon:'♡',label:'Meus looks'},
  {href:'/closet/style',icon:'✦',label:'Meu estilo'}
 ];
 return <nav aria-label="Navegação do Closet" style={{position:'fixed',zIndex:70,left:'50%',bottom:'calc(12px + env(safe-area-inset-bottom))',transform:'translateX(-50%)',width:'min(92vw,520px)',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,padding:7,borderRadius:22,background:'rgba(250,246,239,.95)',backdropFilter:'blur(18px)',border:'1px solid rgba(91,67,50,.13)',boxShadow:'0 16px 38px rgba(45,32,23,.16)'}}>
  {items.map(item=>{const active=pathname===item.href;return <a key={item.href} href={item.href} style={{minHeight:50,borderRadius:16,textDecoration:'none',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,fontFamily:'Arial,sans-serif',fontSize:11,fontWeight:850,color:active?'#fff':'#3a2e27',background:active?'#241c17':'transparent'}}><span style={{fontSize:17,lineHeight:1}}>{item.icon}</span><span>{item.label}</span></a>})}
 </nav>
}
