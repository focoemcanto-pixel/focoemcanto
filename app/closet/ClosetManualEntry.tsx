'use client';
import {usePathname} from 'next/navigation';
export default function ClosetManualEntry(){const path=(usePathname()||'').replace(/\/+$/,'');if(path!=='/closet/stylist'&&path!=='/closet/look')return null;return <a href="/closet/manual/" style={{position:'fixed',zIndex:42,right:18,bottom:'calc(92px + env(safe-area-inset-bottom))',padding:'10px 14px',borderRadius:999,background:'#fffaf3',color:'#2d241e',border:'1px solid #d9c7b4',boxShadow:'0 10px 26px rgba(45,32,23,.12)',textDecoration:'none',fontSize:11,fontWeight:900}}>Montar manualmente</a>}
