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
  onClose?:()=>void;
};

export default function TryOnStage({pieces,models,avatarId,image,busy,error,onAvatarChange,onGenerate,onSwap,onRemix,onResetModel,onClose}:Props){
  const selected=models.find(m=>m.id===avatarId)||models[0];
  const open=Boolean(image)&&!busy;
  return <div className={lookStyles.lookExperience}>
    <header className={lookStyles.lookExperienceHeader}>
      <div><small>SEU LOOK</small><strong>Provador</strong></div>
      {onClose&&<button onClick={onClose} aria-label="Fechar provador">×</button>}
    </header>

    <div className={lookStyles.lookExperienceIntro}>
      <span>VISUALIZAÇÃO DO LOOK</span>
      <h2>{open?'Seu look está pronto.':'Veja a combinação no provador.'}</h2>
      <p>{busy?'Estou vestindo exatamente as peças escolhidas. A cortina abre assim que estiver pronto.':'Escolha um manequim e abra a cortina. Depois você pode trocar uma peça ou sortear outra combinação.'}</p>
    </div>

    <div className={lookStyles.fittingRoomWrap}>
      <div className={`${lookStyles.fittingRoom} ${open?lookStyles.fittingRoomOpen:''} ${busy?lookStyles.fittingRoomBusy:''}`}>
        <div className={lookStyles.roomBackdrop}/>
        <div className={lookStyles.roomGlow}/>
        <div className={lookStyles.platform}/>
        <div className={lookStyles.modelArea}>
          {image?<img className={lookStyles.tryOnResult} src={image} alt="Look vestido no modelo"/>:<div className={lookStyles.modelPlaceholder}><span>{selected?.glyph||'M'}</span><strong>{busy?'Vestindo seu look...':selected?.name}</strong><small>{busy?'Ajustando caimento, proporções e acessórios.':selected?.hint}</small></div>}
        </div>
        <i className={`${lookStyles.curtain} ${lookStyles.curtainLeft}`}/><i className={`${lookStyles.curtain} ${lookStyles.curtainRight}`}/>
        <div className={lookStyles.stageLabel}>{busy?'✦ preparando atrás da cortina':open?'✦ seu look no provador':'✦ cortina fechada'}</div>
      </div>

      <div className={lookStyles.pieceRail}>
        {pieces.map(p=><button key={p.id} onClick={()=>onSwap(p)}><img src={p.image} alt={p.name}/><span>{p.name}</span><small>Toque para trocar</small></button>)}
      </div>

      {!image&&<div className={lookStyles.modelPicker}>
        {models.map(m=><button key={m.id} className={avatarId===m.id?lookStyles.modelSelected:''} onClick={()=>onAvatarChange(m.id)}><span>{m.glyph}</span><div><strong>{m.name}</strong><small>{m.hint}</small></div></button>)}
      </div>}

      {error&&<div className={lookStyles.tryOnNotice}><strong>Visualização indisponível agora.</strong><p>{error}</p></div>}

      <div className={lookStyles.fittingActions}>
        {!image?<button className={lookStyles.primaryStageButton} disabled={busy} onClick={onGenerate}>{busy?'Vestindo atrás da cortina...':'✦ Abrir cortina e ver vestido'}</button>:<button className={lookStyles.primaryStageButton} onClick={onResetModel}>Ver em outro modelo</button>}
        <button onClick={onRemix}>⤨ Sortear outro look</button>
        <button onClick={()=>pieces[0]&&onSwap(pieces[0])}>↻ Trocar uma peça</button>
      </div>
    </div>
  </div>
}
