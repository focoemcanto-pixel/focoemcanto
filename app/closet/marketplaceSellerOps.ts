'use client';

import type {ClosetSession} from './supabase';

const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';

function h(token:string,extra:Record<string,string>={}){
  return {apikey:anon,Authorization:`Bearer ${token}`,...extra};
}

async function read(r:Response){
  const t=await r.text();
  let d:any=null;
  try{d=t?JSON.parse(t):null}catch{d=t}
  if(!r.ok)throw Error(d?.message||d?.error||`Marketplace ${r.status}`);
  return d;
}

async function get<T>(s:ClosetSession,path:string):Promise<T>{
  return read(await fetch(`${url}/rest/v1/${path}`,{headers:h(s.access_token),cache:'no-store'}));
}

async function post<T>(s:ClosetSession,path:string,payload:any):Promise<T>{
  return read(await fetch(`${url}/rest/v1/${path}`,{method:'POST',headers:h(s.access_token,{'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify(payload)}));
}

async function patch<T>(s:ClosetSession,path:string,payload:any):Promise<T>{
  return read(await fetch(`${url}/rest/v1/${path}`,{method:'PATCH',headers:h(s.access_token,{'Content-Type':'application/json','Prefer':'return=representation'}),body:JSON.stringify(payload)}));
}

async function rpc<T>(s:ClosetSession,name:string,payload:any):Promise<T>{
  return read(await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:h(s.access_token,{'Content-Type':'application/json'}),body:JSON.stringify(payload)}));
}

export type SellerAddress={id:string;seller_id:string;address_type:'business'|'return'|'warehouse';postal_code:string;street:string;number?:string|null;complement?:string|null;district?:string|null;city:string;state:string;country_code:string;verified:boolean;created_at:string;updated_at:string};

export async function loadSellerAddresses(s:ClosetSession,sellerId:string){
  return get<SellerAddress[]>(s,`closet_seller_addresses?select=*&seller_id=eq.${encodeURIComponent(sellerId)}&order=address_type.asc,created_at.asc`);
}

export async function saveSellerAddress(s:ClosetSession,sellerId:string,input:Omit<SellerAddress,'id'|'seller_id'|'verified'|'created_at'|'updated_at'>,id?:string){
  const payload={seller_id:sellerId,...input,country_code:input.country_code||'BR',updated_at:new Date().toISOString()};
  if(id){
    const rows=await patch<SellerAddress[]>(s,`closet_seller_addresses?id=eq.${encodeURIComponent(id)}&seller_id=eq.${encodeURIComponent(sellerId)}`,payload);
    return rows[0]||null;
  }
  const rows=await post<SellerAddress[]>(s,'closet_seller_addresses',payload);
  return rows[0]||null;
}

export async function loadSellerCatalogDetail(s:ClosetSession,sellerId:string){
  const select='*,variants:closet_product_variants(*,inventory:closet_product_inventory(*)),media:closet_product_media(*)';
  return get<any[]>(s,`closet_products?select=${encodeURIComponent(select)}&seller_id=eq.${encodeURIComponent(sellerId)}&order=updated_at.desc&limit=300`);
}

export async function updateVariant(s:ClosetSession,variantId:string,input:{sku?:string|null;title?:string|null;color?:string|null;size?:string|null;material?:string|null;price?:number;compare_at_price?:number|null;weight_grams?:number|null;status?:string}){
  const rows=await patch<any[]>(s,`closet_product_variants?id=eq.${encodeURIComponent(variantId)}`,{...input,updated_at:new Date().toISOString()});
  return rows[0]||null;
}

export async function setVariantInventory(s:ClosetSession,variantId:string,quantity:number,allowBackorder=false){
  const rows=await post<any[]>(s,'closet_product_inventory?on_conflict=variant_id',{variant_id:variantId,quantity_on_hand:Math.max(0,Math.floor(quantity)),quantity_reserved:0,allow_backorder:Boolean(allowBackorder),updated_at:new Date().toISOString()});
  return rows[0]||null;
}

export async function loadSellerOrderDetail(s:ClosetSession,orderId:string){
  const [orders,items,shipments,disputes,returns,refunds,payouts]=await Promise.all([
    get<any[]>(s,`closet_orders?select=*&id=eq.${encodeURIComponent(orderId)}&limit=1`),
    get<any[]>(s,`closet_order_items?select=*&order_id=eq.${encodeURIComponent(orderId)}`),
    get<any[]>(s,`closet_shipments?select=*&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.desc`),
    get<any[]>(s,`closet_disputes?select=*&order_id=eq.${encodeURIComponent(orderId)}&order=opened_at.desc`).catch(()=>[]),
    get<any[]>(s,`closet_returns?select=*&order_id=eq.${encodeURIComponent(orderId)}&order=requested_at.desc`).catch(()=>[]),
    get<any[]>(s,`closet_refunds?select=*&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.desc`).catch(()=>[]),
    get<any[]>(s,`closet_payouts?select=*&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.desc`).catch(()=>[]),
  ]);
  const shipmentIds=(shipments||[]).map(x=>x.id),itemIds=(items||[]).map(x=>x.id);
  const [events,snapshots]=await Promise.all([
    shipmentIds.length?get<any[]>(s,`closet_shipment_events?select=*&shipment_id=in.(${shipmentIds.join(',')})&order=occurred_at.desc`).catch(()=>[]):Promise.resolve([]),
    itemIds.length?get<any[]>(s,`closet_order_item_snapshots?select=*&order_item_id=in.(${itemIds.join(',')})`).catch(()=>[]):Promise.resolve([]),
  ]);
  return {order:orders[0]||null,items,shipments,events,snapshots,disputes,returns,refunds,payouts};
}

export async function operateShippingLabel(s:ClosetSession,shipmentId:string,action:'purchase'|'generate'|'print'|'track'){
  return read(await fetch('/api/closet/shipping/label',{method:'POST',headers:{Authorization:`Bearer ${s.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({shipment_id:shipmentId,action})}));
}

export async function startMercadoPagoConnection(s:ClosetSession,sellerId:string){
  return read(await fetch('/api/closet/mercadopago/start',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`},body:JSON.stringify({seller_id:sellerId})}));
}

export async function loadPaymentConnection(s:ClosetSession,sellerId:string){
  const rows=await get<any[]>(s,`closet_seller_payment_connections?select=seller_id,provider,provider_user_id,status,connected_at,expires_at,payouts_enabled,transfers_enabled,requirements_due&seller_id=eq.${encodeURIComponent(sellerId)}&provider=eq.mercadopago&limit=1`);
  return rows[0]||null;
}

export async function loadSellerDocuments(s:ClosetSession,sellerId:string){
  return get<any[]>(s,`closet_seller_documents?select=*&seller_id=eq.${encodeURIComponent(sellerId)}&order=created_at.desc`);
}

export async function uploadSellerDocument(s:ClosetSession,sellerId:string,file:File,documentType:string,verificationId?:string|null){
  const form=new FormData();
  form.append('seller_id',sellerId);
  form.append('document_type',documentType);
  if(verificationId)form.append('verification_id',verificationId);
  form.append('file',file);
  return read(await fetch('/api/closet/seller/document',{method:'POST',headers:{Authorization:`Bearer ${s.access_token}`},body:form}));
}

export async function loadSellerReturns(s:ClosetSession,sellerId:string){
  const select='*,order:closet_orders(id,order_number,status,total_amount,created_at,delivered_at,buyer_user_id)';
  return get<any[]>(s,`closet_returns?select=${encodeURIComponent(select)}&seller_id=eq.${encodeURIComponent(sellerId)}&order=requested_at.desc&limit=200`);
}

export async function decideSellerReturn(s:ClosetSession,returnId:string,decision:'approve'|'reject',response=''){
  return rpc<any>(s,'closet_seller_decide_return',{p_return_id:returnId,p_decision:decision,p_response:response});
}

export async function confirmSellerReturnReceived(s:ClosetSession,returnId:string,notes=''){
  return rpc<any>(s,'closet_seller_confirm_return_received',{p_return_id:returnId,p_notes:notes});
}

export async function prepareReverseLogistics(s:ClosetSession,returnId:string,service:1|2=1){
  return read(await fetch('/api/closet/shipping/return',{method:'POST',headers:{Authorization:`Bearer ${s.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({return_id:returnId,service})}));
}

export async function loadSellerDisputes(s:ClosetSession,sellerId:string){
  const select='*,order:closet_orders(id,order_number,status,total_amount,created_at,delivered_at,buyer_user_id)';
  return get<any[]>(s,`closet_disputes?select=${encodeURIComponent(select)}&seller_id=eq.${encodeURIComponent(sellerId)}&order=opened_at.desc&limit=200`);
}

export async function addSellerDisputeMessage(s:ClosetSession,disputeId:string,message:string){
  return rpc<any>(s,'closet_add_dispute_message',{p_dispute_id:disputeId,p_message:message});
}
