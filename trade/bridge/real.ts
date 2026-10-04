import { config, rpc, type BridgeEnv } from './config';
import { feedStatus } from './mt5';
import type { Proposal } from './approval';
import { commandCanonical, type BrokerCommand } from './protocol';
export type RealGate = { key:string; label:string; ok:boolean; reason:string };
/** Financial limits, calendar and rollover are explicit policy, never guesses. */
export function realReadiness(ctx:any,env:BridgeEnv,p?:Proposal,now=Date.now()) {
 const c=config(env),b=ctx?.bridge,s=b?.state||{},policy=ctx?.policy||{},feed=feedStatus(b,env,now),local=s.localLimits||{};
 const gates:RealGate[]=[];
 const add=(key:string,label:string,ok:unknown,reason:string)=>gates.push({key,label,ok:ok===true,reason});
 const pos=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 const recent=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&now-Date.parse(v)>=-2000&&now-Date.parse(v)<=c.maxAgeMs;
 const authorized=(a:any)=>a?.live_authorized===true&&a?.stage==='live-monitoring';
 const auth=p?(ctx?.authorizations||[]).find((a:any)=>a.strategy_id===p.setup.strategy&&a.version===p.setup.version):(ctx?.authorizations||[]).find(authorized);
 add('backend','Execução backend',c.execution,'TRADE_EXECUTION_ENABLED permanece false até ativação deliberada.');
 add('policy','Política REAL aprovada',policy.enabled===true,'Aprovação explícita da política de risco necessária.');
 add('authorization','Autorização live da estratégia/versão',authorized(auth),'liveAuthorized=false; homologação e autorização por versão necessárias.');
 add('kill','Kill switch liberado',b?.killSwitch===false,'Kill switch ativo: novas ordens reais bloqueadas.');
 add('ea','EA execution habilitado',s.executionAllowed===true,'EnableExecution=false ou permissões MT5 bloqueadas.');
 add('bridge','Bridge conectado',s.connected===true&&recent(b?.receivedAt),'Conexão/heartbeat antigo ou indisponível.');
 add('feed','Feed e preço recentes',feed.status==='LIVE'&&pos(b?.tick?.bid)&&pos(b?.tick?.ask)&&b.tick.ask>=b.tick.bid,'Preço antigo ou Bid/Ask indisponível.');
 add('account','Conta/fingerprint autorizado',/^[a-f0-9]{64}$/.test(c.accountHash)&&b?.accountHash===c.accountHash&&policy.account_hash===c.accountHash,'Conta autorizada não configurada ou divergente.');
 add('protocol','Pipeline assinado v2 disponível',s.protocolVersion===2&&s.magic==='706032601'&&!!env.TRADE_BRIDGE_TOKEN&&env.TRADE_BRIDGE_TOKEN.length>=32,'Compile/instale o EA v2 e confira o Magic Number.');
 add('symbol','Símbolo autorizado',policy.symbol===c.symbol&&(!p||p.symbol===c.symbol),'Símbolo da proposta/política/bridge divergente.');
 add('expiration','Contrato vigente',typeof policy.contract_expires_at==='string'&&Date.parse(policy.contract_expires_at)>now&&pos(s.expirationTime)&&s.expirationTime*1000>now,'Vencimento confirmado e metadado de expiração do MT5 necessários.');
 add('rollover','Rollover validado',policy.rollover_confirmed===true&&policy.symbol===c.symbol,'Rollover precisa de validação explícita para este contrato.');
 add('session','Mercado/sessão autorizados',Array.isArray(policy.session_windows)&&policy.session_windows.some((w:any)=>Date.parse(w.open)<=now&&Date.parse(w.close)>now)&&s.sessionOpen===true&&s.tradeMode===4,'Fora da janela datada autorizada ou mercado indisponível.');
 add('limits','Limites de risco configurados',pos(policy.max_risk_brl)&&pos(policy.max_daily_loss_brl)&&pos(policy.max_slippage_points)&&Number.isInteger(policy.max_contracts)&&policy.max_contracts>=1&&Number.isInteger(policy.max_positions)&&policy.max_positions>=1,'Defina limites financeiros, de posições, contratos e desvio.');
 add('local','Conta e limites locais do EA',s.localAccountAuthorized===true&&pos(local.maxRiskBRL)&&pos(local.maxLossBRL)&&pos(local.maxSlippagePoints)&&Number.isInteger(local.maxContracts)&&local.maxContracts>=1&&Number.isInteger(local.maxPositions)&&local.maxPositions>=1,'Fingerprint e limites locais do EA ausentes; zero mantém REAL bloqueado.');
 const meta=s.currency==='BRL'&&pos(s.tickSize)&&pos(s.tickValue)&&pos(s.volumeMin)&&pos(s.volumeStep)&&pos(s.volumeMax)&&pos(s.point)&&Number.isFinite(s.stopsLevel)&&s.stopsLevel>=0;
 add('metadata','Metadados de lote/SL/TP',meta,'Valor monetário, volume ou distância mínima incompletos.');
 add('reconciliation','Histórico/posições reconciliados',s.historyReady===true&&recent(b?.receivedAt)&&pos(s.historyAsOfMsc)&&now-s.historyAsOfMsc>=-2000&&now-s.historyAsOfMsc<=c.maxAgeMs&&s.protectionFault!==true,'Histórico incompleto ou falha de proteção.');
 add('unresolved','Sem comando indeterminado',ctx?.unresolved===0,'Comando pendente/indeterminado. Reconcilie; não reenvie.');
 const price=p?(p.direction==='BUY'?b?.tick?.ask:b?.tick?.bid):0,sign=p?.direction==='SELL'?-1:1;
 const risk=p?sign*(price-p.sl):0,reward=p?sign*(p.tp-price):0,value=meta?s.tickValue/s.tickSize:0;
 const budget=meta&&p?Math.max(p.riskBRL,risk*value*p.quantity):p?.riskBRL||0;
 add('daily','Perda máxima e reserva de risco',Number.isFinite(s.loss24hBRL)&&s.loss24hBRL>=0&&pos(policy.max_daily_loss_brl)&&pos(local.maxLossBRL)&&s.loss24hBRL+budget<Math.min(policy.max_daily_loss_brl,local.maxLossBRL),'Perdas conservadoras em 24h + reserva excedem limite ou histórico indisponível.');
 add('positions','Limite de posições/exposição',Array.isArray(s.positions)&&Array.isArray(s.orders)&&s.positions.length===0&&s.orders.length===0,'Nova entrada exige conta sem posições/ordens para evitar netting e risco não mensurado.');
 if(p){
  const aligned=(v:number)=>pos(s.tickSize)&&Math.abs(v/s.tickSize-Math.round(v/s.tickSize))<1e-7;
  add('quantity','Quantidade/lote válido',Number.isInteger(p.quantity)&&p.quantity>=s.volumeMin&&p.quantity<=Math.min(c.maxContracts,policy.max_contracts,local.maxContracts,s.volumeMax)&&pos(s.volumeStep)&&Math.abs(p.quantity/s.volumeStep-Math.round(p.quantity/s.volumeStep))<1e-7,'Lote fora do mínimo, step ou limites.');
  add('prices','Entrada, stop e alvo válidos',pos(price)&&pos(p.sl)&&pos(p.tp)&&risk>0&&reward>0&&risk>=s.stopsLevel*s.point&&reward>=s.stopsLevel*s.point&&aligned(p.sl)&&aligned(p.tp)&&Math.abs(price-p.entry)<=Math.min(policy.max_slippage_points,local.maxSlippagePoints),'SL/TP inválidos ou preço além do desvio autorizado.');
  add('risk','Risco financeiro da proposta',meta&&risk*value*p.quantity<=Math.min(policy.max_risk_brl,local.maxRiskBRL)&&p.pointValue===value&&Math.abs(p.riskBRL-p.riskPoints*p.pointValue*p.quantity)<1e-6&&p.riskBRL<=Math.min(policy.max_risk_brl,local.maxRiskBRL),'Risco ou valor monetário excede limite/está divergente.');
  add('proposal','Proposta atual em dados reais',p.mode==='REAL'&&p.source==='mt5'&&p.expiresAt>now&&p.asOf<=now/1000&&now/1000-p.asOf<=120&&p.setup.conditions.every(x=>x.met)&&p.setup.conflicts.length===0,'Proposta antiga ou hipótese incompleta/conflitante.');
 }
 const canExecute=gates.every(g=>g.ok);
 return {status:canExecute?'REAL PRONTO PARA CONFIRMAÇÃO':'REAL DESARMADO',canExecute,pipeline:'IMPLEMENTADO',gates,symbol:c.symbol,lastTick:feed.status==='LIVE'?feed.lastTick:null,limits:{maxContracts:Math.min(c.maxContracts,policy.max_contracts||c.maxContracts),maxRiskBRL:policy.max_risk_brl??null,maxDailyLossBRL:policy.max_daily_loss_brl??null,maxPositions:policy.max_positions??null}};
}
export async function realContext(env:BridgeEnv){return rpc(env,'trade_real_context',{p_bridge:config(env).bridgeId});}
export function assertReady(r:ReturnType<typeof realReadiness>){if(!r.canExecute)throw new Error('REAL BLOQUEADO: '+r.gates.filter(g=>!g.ok).map(g=>g.label).join(' · '));}
export async function nonceHash(n:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(n)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function signCommand(c:BrokerCommand,env:BridgeEnv){if(!env.TRADE_BRIDGE_TOKEN||env.TRADE_BRIDGE_TOKEN.length<32)throw new Error('Assinatura indisponível');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.TRADE_BRIDGE_TOKEN),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(commandCanonical(c)));return {...c,signature:Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join(''),signatureVersion:2};}
