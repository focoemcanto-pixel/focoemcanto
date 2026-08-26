'use client';
import type {ClosetSession} from './supabase';
export type AiWallet={balance:number;lifetime_earned:number;lifetime_spent:number;updated_at:string};
export type AiCreditEntry={id:string;amount:number;kind:string;operation?:string|null;partner_id?:string|null;campaign_id?:string|null;created_at:string};
const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
function headers(token:string){return {apikey:anon,Authorization:`Bearer ${token}`}}
export async function loadAiWallet(session:ClosetSession):Promise<AiWallet>{const r=await fetch(`${url}/rest/v1/closet_ai_wallets?user_id=eq.${session.user.id}&select=balance,lifetime_earned,lifetime_spent,updated_at`,{headers:headers(session.access_token)});if(!r.ok)return {balance:0,lifetime_earned:0,lifetime_spent:0,updated_at:new Date().toISOString()};const rows=await r.json();return rows?.[0]||{balance:0,lifetime_earned:0,lifetime_spent:0,updated_at:new Date().toISOString()}}
export async function loadAiCreditHistory(session:ClosetSession):Promise<AiCreditEntry[]>{const r=await fetch(`${url}/rest/v1/closet_ai_credit_ledger?user_id=eq.${session.user.id}&select=id,amount,kind,operation,partner_id,campaign_id,created_at&order=created_at.desc&limit=30`,{headers:headers(session.access_token)});return r.ok?await r.json():[]}
export const AI_OPERATION_COSTS={smart_scan:1,catalog_rebuild:1,virtual_try_on:3} as const;
export function aiOperationLabel(op:keyof typeof AI_OPERATION_COSTS){return op==='smart_scan'?'Scanner inteligente':op==='catalog_rebuild'?'Melhorar peça com IA':'Experimentar com IA'}
