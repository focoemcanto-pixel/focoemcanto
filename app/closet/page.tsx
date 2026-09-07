'use client';

import { useEffect } from 'react';

const TARGET = 'https://closet.focostart.com';

export default function ClosetMovedPage() {
  useEffect(() => {
    window.location.replace(TARGET);
  }, []);

  return (
    <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:'32px',fontFamily:'Arial,sans-serif',background:'#f7f4ef',color:'#1f1f1f'}}>
      <section style={{maxWidth:'520px',textAlign:'center'}}>
        <h1 style={{fontSize:'28px',marginBottom:'12px'}}>O Closet mudou.</h1>
        <p style={{lineHeight:1.6}}>Agora ele funciona como um produto independente da Foco Start.</p>
        <a href={TARGET} style={{display:'inline-block',marginTop:'18px',padding:'12px 18px',borderRadius:'999px',background:'#1f1f1f',color:'#fff',textDecoration:'none',fontWeight:700}}>Abrir Closet</a>
      </section>
    </main>
  );
}
