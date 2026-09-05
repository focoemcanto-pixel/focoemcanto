'use client';
import {useEffect} from 'react';
export default function SellerDisputeRedirect(){useEffect(()=>{const id=new URLSearchParams(location.search).get('id')||'';location.replace(id?`/closet/protection/?id=${encodeURIComponent(id)}`:'/closet/seller')},[]);return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#f5efe6',color:'#6f5d4e'}}>Abrindo Proteção Closet…</main>}
