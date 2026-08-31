'use client';

import {CSSProperties, useEffect, useState} from 'react';

type Props={
  src?:string|null;
  alt:string;
  className?:string;
  style?:CSSProperties;
  fallbackLabel?:string;
};

export default function ClosetImage({src,alt,className,style,fallbackLabel='Peça sem foto'}:Props){
  const [failed,setFailed]=useState(!src);
  useEffect(()=>setFailed(!src),[src]);
  if(failed)return <div className={className} style={{...style,display:'grid',placeItems:'center',textAlign:'center',background:'linear-gradient(145deg,#eee5da,#faf6ef)',color:'#9a8069',padding:12}} role="img" aria-label={`${alt} · ${fallbackLabel}`}><span style={{display:'grid',gap:5,placeItems:'center'}}><b style={{font:'28px Georgia,serif'}}>✦</b><small style={{fontSize:9,lineHeight:1.25}}>{fallbackLabel}</small></span></div>;
  return <img src={src||''} alt={alt} className={className} style={style} onError={()=>setFailed(true)}/>;
}
