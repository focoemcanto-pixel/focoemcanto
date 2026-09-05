'use client';

import {useEffect,useState} from 'react';
import {restoreClosetSession,type ClosetSession} from '../../supabase';
import {loadSellerOrderDetail,operateShippingLabel} from '../../marketplaceSellerOps';
import styles from '../seller.module.css';

const labels:Record<string,string>={
  pending_payment:'Aguardando pagamento',paid:'Pago',awaiting_shipment:'Preparar envio',pending:'Preparar envio',label_created:'Etiqueta criada',posted:'Postado',shipped:'Enviado',in_transit:'Em trânsito',out_for_delivery:'Saiu para entrega',delivered:'Entregue',completed:'Concluído',cancelled:'Cancelado',disputed:'Em contestação',return_requested:'Devolução solicitada',return_in_transit:'Devolução em trânsito',returned:'Devolvido',partially_refunded:'Estorno parcial',refunded:'Estornado',exception:'Atenção necessária',eligible:'Elegível',held:'Bloqueado',scheduled:'Agendado',processing:'Processando',succeeded:'Concluído',failed:'Falhou'
};
const disputeLabels:Record<string,string>={opened:'Aberta',seller_response:'Aguardando resposta da loja',negotiating:'Em negociação',mediation:'Em mediação',decided:'Decidida',closed:'Encerrada',cancelled:'Cancelada'};

function money(v:any){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0))}
function dt(v:any){return v?new Date(v).toLocaleString('pt-BR'):'—'}

export default function SellerOrderDetail(){
  const [session,setSession]=useState<ClosetSession|null>(null),[detail,setDetail]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState('');
  const id=typeof window!=='undefined'?new URLSearchParams(location.search).get('id')||'':'';

  async function reload(s=session){if(s&&id)setDetail(await loadSellerOrderDetail(s,id))}

  useEffect(()=>{let alive=true;(async()=>{try{const s=await restoreClosetSession();if(!alive)return;setSession(s);if(s&&id){const d=await loadSellerOrderDetail(s,id);if(alive)setDetail(d)}}catch(e:any){if(alive)setError(e?.message||'Não consegui abrir este pedido.')}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[id]);

  async function act(shipmentId:string,action:'purchase'|'generate'|'print'|'track'){
    if(!session)return;
    const k=shipmentId+action;setBusy(k);setError('');
    try{const r=await operateShippingLabel(session,shipmentId,action);if(action==='print'&&r?.url)window.open(typeof r.url==='string'?r.url:r.url?.url||'','_blank','noopener,noreferrer');await reload(session)}catch(e:any){setError(e?.message||'Não consegui operar a etiqueta.')}finally{setBusy('')}
  }

  if(loading)return <main className={styles.page}><div className={styles.loading}>Abrindo pedido…</div></main>;
  const o=detail?.order;
  if(!session||!o)return <main className={styles.page}><div className={styles.empty}><strong>Pedido não encontrado.</strong><span>{error||'Entre com a conta do seller responsável.'}</span><button className={styles.primary} onClick={()=>location.href='/closet/seller/orders'}>Voltar</button></div></main>;

  const addr=o.shipping_address_snapshot||{};
  const snapMap=new Map((detail?.snapshots||[]).map((x:any)=>[x.order_item_id,x.product_snapshot]));
  const disputes=detail?.disputes||[],returns=detail?.returns||[],refunds=detail?.refunds||[],payouts=detail?.payouts||[];
  const activeDispute=disputes.find((x:any)=>!['closed','cancelled'].includes(x.status));
  const latestReturn=returns[0]||null,latestRefund=refunds[0]||null,latestPayout=payouts[0]||null;

  return <main className={styles.page}>
    <header className={styles.header}><button onClick={()=>location.href='/closet/seller/orders'}>‹</button><div><span>PEDIDO SELLER</span><strong>CL-{String(o.order_number).padStart(6,'0')}</strong></div><button onClick={()=>location.href='/closet'}>⌂</button></header>
    <div className={styles.wrap}>
      <section className={styles.hero}><span className={styles.eyebrow}>{labels[o.status]||o.status}</span><h1>{money(o.total_amount)}</h1><p>Pedido criado em {dt(o.created_at)}. Pagamento, logística, Proteção Closet, devolução e repasse permanecem ligados ao mesmo histórico.</p></section>
      {error&&<div className={styles.error}>{error}</div>}

      <section className={styles.panel}><span className={styles.eyebrow}>ITENS</span><h2>Conteúdo do pedido</h2>{detail.items?.map((it:any)=>{const snap:any=snapMap.get(it.id)||{};return <div className={styles.row} key={it.id}><div><strong>{snap?.name||snap?.title||'Produto'}</strong><span>{[snap?.variant_title,snap?.color,snap?.size].filter(Boolean).join(' · ')||`${it.quantity} unidade${it.quantity>1?'s':''}`}</span></div><div style={{textAlign:'right'}}><strong>{it.quantity} × {money(it.unit_price)}</strong><span>{money(it.subtotal)}</span></div></div>})}</section>

      <section className={styles.panel}><span className={styles.eyebrow}>LOGÍSTICA</span><h2>Entrega e devolução</h2>{addr.street?<p>{addr.recipient_name&&<><strong>{addr.recipient_name}</strong><br/></>}{addr.street}, {addr.number||'s/n'}{addr.complement?` · ${addr.complement}`:''}<br/>{addr.district?`${addr.district} · `:''}{addr.city} · {addr.state}<br/>{addr.postal_code||addr.zip||''}</p>:<p>Endereço não disponível neste pedido.</p>}{detail.shipments?.length?<div className={styles.cards}>{detail.shipments.map((s:any)=>{const reverse=s.metadata?.direction==='return',purchaseKey=s.id+'purchase',generateKey=s.id+'generate',printKey=s.id+'print',trackKey=s.id+'track';return <article className={styles.card} key={s.id}><div className={styles.cardHead}><div><small>{reverse?'DEVOLUÇÃO':'ENVIO AO CLIENTE'} · {s.carrier_name||s.provider}</small><h3>{reverse?'Logística reversa':labels[s.status]||s.status}</h3></div><span className={styles.status}>{s.tracking_code||s.service_id||'frete protegido'}</span></div>{s.shipping_method&&<p><strong>{s.shipping_method}</strong></p>}{s.charged_amount!=null&&<p>Frete: <strong>{money(s.charged_amount)}</strong></p>}{s.estimated_delivery_at&&<p>Previsão: {new Date(s.estimated_delivery_at).toLocaleDateString('pt-BR')}</p>}{s.provider_shipment_id?<div className={styles.actions}>{!['purchased','generated'].includes(s.label_status)&&<button className={styles.primary} disabled={!!busy} onClick={()=>act(s.id,'purchase')}>{busy===purchaseKey?'Comprando…':'Comprar etiqueta'}</button>}{s.label_status==='purchased'&&<button className={styles.primary} disabled={!!busy} onClick={()=>act(s.id,'generate')}>{busy===generateKey?'Gerando…':'Gerar etiqueta'}</button>}{s.label_status==='generated'&&<button className={styles.primary} disabled={!!busy} onClick={()=>act(s.id,'print')}>{busy===printKey?'Abrindo…':'Imprimir etiqueta'}</button>}<button className={styles.secondary} disabled={!!busy} onClick={()=>act(s.id,'track')}>{busy===trackKey?'Atualizando…':'Atualizar rastreio'}</button></div>:<p>O envio será inserido no carrinho logístico após a etapa protegida do pedido.</p>}</article>})}</div>:<div className={styles.empty}><strong>Aguardando logística.</strong><span>Quando o frete for criado, os controles de etiqueta aparecerão aqui.</span></div>}</section>

      {(activeDispute||latestReturn)&&<section className={styles.panel}><span className={styles.eyebrow}>PÓS-VENDA</span><h2>Proteção e devoluções</h2>{activeDispute&&<><div className={styles.row}><span>Contestação</span><strong>{disputeLabels[activeDispute.status]||activeDispute.status}</strong></div><div className={styles.row}><span>Motivo</span><strong>{activeDispute.reason_code}</strong></div><div className={styles.row}><span>Repasse</span><strong>{activeDispute.payout_hold?'Bloqueado durante a análise':'Sem hold do caso'}</strong></div>{activeDispute.seller_response_due_at&&<div className={styles.row}><span>Responder até</span><strong>{dt(activeDispute.seller_response_due_at)}</strong></div>}<div className={styles.actions}><button className={styles.primary} onClick={()=>location.href=`/closet/protection/?id=${encodeURIComponent(activeDispute.id)}`}>Abrir Proteção Closet</button></div></>}{latestReturn&&<><div className={styles.row}><span>Devolução</span><strong>{labels[latestReturn.status]||latestReturn.status}</strong></div><div className={styles.row}><span>Motivo informado</span><strong>{latestReturn.reason||'—'}</strong></div><div className={styles.actions}><button className={styles.secondary} onClick={()=>location.href='/closet/seller/returns'}>Gerenciar devolução</button></div></>}</section>}

      <section className={styles.panel}><span className={styles.eyebrow}>FINANCEIRO</span><h2>Composição e repasse</h2><div className={styles.row}><span>Produtos</span><strong>{money(o.products_amount)}</strong></div><div className={styles.row}><span>Frete</span><strong>{money(o.shipping_amount)}</strong></div><div className={styles.row}><span>Comissão Closet</span><strong>- {money(o.commission_amount)}</strong></div><div className={styles.row}><span>Processamento</span><strong>- {money(o.processing_fee_amount)}</strong></div><div className={styles.row}><span>Líquido seller</span><strong>{money(o.seller_net_amount)}</strong></div>{latestPayout&&<><div className={styles.row}><span>Status do repasse</span><strong>{labels[latestPayout.status]||latestPayout.status}</strong></div><div className={styles.row}><span>Elegível em</span><strong>{dt(latestPayout.eligible_at)}</strong></div>{latestPayout.hold_reason&&<div className={styles.row}><span>Motivo do bloqueio</span><strong>{latestPayout.hold_reason}</strong></div>}</>}{latestRefund&&<><div className={styles.row}><span>Reembolso</span><strong>{labels[latestRefund.status]||latestRefund.status}</strong></div><div className={styles.row}><span>Valor</span><strong>- {money(latestRefund.amount)}</strong></div></>}</section>

      {o.delivered_at&&<section className={styles.panel}><span className={styles.eyebrow}>PROTEÇÃO</span><h2>Janelas do pedido</h2><div className={styles.row}><span>Entrega confirmada</span><strong>{dt(o.delivered_at)}</strong></div><div className={styles.row}><span>Proteção termina</span><strong>{dt(o.protection_ends_at)}</strong></div><div className={styles.row}><span>Repasse pode se tornar elegível</span><strong>{dt(o.payout_eligible_at)}</strong></div><p style={{fontSize:12,color:'#806f62'}}>Essas datas não substituem um bloqueio por contestação, devolução, reembolso ou sinal de risco. O motor financeiro revalida o pedido antes de liberar elegibilidade.</p></section>}
    </div>
  </main>;
}
