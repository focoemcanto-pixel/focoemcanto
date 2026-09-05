'use client';

import {usePathname} from 'next/navigation';

export default function ClosetShellNav(){
 const pathname=usePathname();
 if(pathname!=='/closet'&&pathname!=='/closet/')return null;
 return <section style={{maxWidth:760,margin:'0 auto 28px',padding:'0 14px'}} aria-label="Marketplace Closet">
  <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:9}}>
   <a href="/closet/orders" style={{display:'grid',gap:4,padding:'14px 15px',border:'1px solid #ded1c1',borderRadius:16,background:'#fffaf3',color:'#2b211b',textDecoration:'none'}}><small style={{fontSize:9,letterSpacing:'.13em',fontWeight:900,color:'#96795b'}}>COMPRAS</small><strong>Meus pedidos</strong><span style={{fontSize:11,color:'#75685d'}}>Rastreio e Proteção Closet</span></a>
   <a href="/closet/seller" style={{display:'grid',gap:4,padding:'14px 15px',border:'1px solid #ded1c1',borderRadius:16,background:'#fffaf3',color:'#2b211b',textDecoration:'none'}}><small style={{fontSize:9,letterSpacing:'.13em',fontWeight:900,color:'#96795b'}}>SELLER</small><strong>Vender no Closet</strong><span style={{fontSize:11,color:'#75685d'}}>Loja, produtos e reputação</span></a>
  </div>
 </section>;
}
