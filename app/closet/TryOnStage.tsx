'use client';

import lookStyles from './look.module.css';

type Piece={id:string|number;category:string;name:string;meta:string;image:string};
type AvatarModel={id:string;name:string;hint:string;glyph:string};

type Props={
  pieces:Piece[];
  models:AvatarModel[];
  avatarId:string;
  image:string;
  busy:boolean;
  error:string;
  onAvatarChange:(id:string)=>void;
  onGenerate:()=>void;
  onSwap:(piece:Piece)=>void;
  onRemix:()=>void;
  onResetModel:()=>void;
};

export default function TryOnStage({pieces,models,avatarId,image,busy,error,onAvatarChange,onGenerate,onSwap,onRemix,onResetModel}:Props){
  const selected=models.find(m=>m.id===avatarId)||models[0];
  const open=Boolean(image)&&!busy;
  return <div className={lookStyles.fittingRoomWrap}>
    <div className={`${lookStyles.fittingRoom} ${open?lookStyles.fittingRoomOpen:''}`}>
      <div className={lookStyles.roomBackdrop}/>
      <div className={lookStyles.roomGlow}/>
      <div className={lookStyles.platform}/>
      <div className={lookStyles.modelArea}>
        {image?<img className={lookStyles.tryOnResult} src={image} alt="Look vestido no modelo"/>:<div className={lookStyles.modelPlaceholder}><span>{selected?.glyph||'M'}</span><strong>{busy?'Vestindo seu look...':selected?.name}</strong><small>{busy?'Ajustando caimento, proporções e acessórios.':selected?.hint}</small></div>}
      </div>
      <i className={`${lookStyles.curtain} ${lookStyles.curtainLeft}`}/><i className={`${lookStyles.curtain} ${lookStyles.curtainRight}`}/>
      <div className={lookStyles.stageLabel}>{busy?'✦ preparando o provador':open?'✦ seu look no provador':'✦ escolha o modelo e abra a cortina'}</div>
    </div>

    <div className={lookStyles.pieceRail}>
      {pieces.map(p=><button key={p.id} onClick={()=>onSwap(p)}><img src={p.image} alt={p.name}/><span>{p.name}</span><small>Trocar</small></button>)}
    </div>

    {!image&&<div className={lookStyles.modelPicker}>
      {models.map(m=><button key={m.id} className={avatarId===m.id?lookStyles.modelSelected:''} onClick={()=>onAvatarChange(m.id)}><span>{m.glyph}</span><div><strong>{m.name}</strong><small>{m.hint}</small></div></button>)}
    </div>}

    {error&&<div className={lookStyles.tryOnNotice}><strong>Visualização indisponível agora.</strong><p>{error}</p></div>}

    <div className={lookStyles.fittingActions}>
      {!image?<button className={lookStyles.primaryStageButton} disabled={busy} onClick={onGenerate}>{busy?'Vestindo seu look...':'Abrir cortina e ver vestido'}</button>:<button className={lookStyles.primaryStageButton} onClick={onResetModel}>Ver em outro modelo</button>}
      <button onClick={onRemix}>⤨ Sortear outro look</button>
    </div>
  </div>
}
