import {
  config,
  rpc,
  persistenceFailure,
  PersistenceError,
  type BridgeEnv,
} from '../../../trade/bridge/config';
import {
  MT5MarketDataProvider,
  MT5BrokerExecutionProvider,
  feedStatus,
} from '../../../trade/bridge/mt5';
import {
  approvalPolicy,
  makeProposal,
  executionView,
  type Proposal,
} from '../../../trade/bridge/approval';
import { TrendPullbackConfirmation } from '../../../trade/core/strategy';
import { generateMockCandles, snapshotOf } from '../../../trade/core/providers';
import { realContext,realReadiness,assertReady,signCommand,nonceHash } from '../../../trade/bridge/real';
import { paperExecution,PaperExecutionProvider } from '../../../trade/bridge/paper';
import { instrumentValue } from '../../../trade/bridge/instruments';
import { scannerParameters } from '../../../trade/scanner/strategies';
import { scanMarket } from '../../../trade/scanner/engine';
import { validateCommand } from '../../../trade/bridge/protocol';
const owner = 'focoos-admin'; // Existing admin-session middleware, never client supplied.
async function market(
  env: BridgeEnv,
  source: string,
  cursor: number,
  mode: string,
  strategyId?: string,
) {
  if (source !== 'mt5' && source !== 'replay')
    throw new Error('Fonte inválida');
  if (
    !Number.isInteger(cursor) ||
    cursor < 0 ||
    (cursor > 420 && source === 'replay')
  )
    throw new Error('Cursor inválido');
  const strategy = new TrendPullbackConfirmation();
  const data =
    source === 'mt5' ? await new MT5MarketDataProvider(env).read() : null;
  if (source === 'mt5' && !data)
    throw new Error('Bridge ainda não recebeu dados do MT5.');
  if (data && feedStatus(data, env).status !== 'LIVE')
    throw new Error('Feed offline ou antigo');
  const candles = data
    ? (data.candles || []).filter(
        (c: any) =>
          c.symbol === config(env).symbol &&
          c.timestamp + 60 <= Date.now() / 1000,
      )
    : generateMockCandles().slice(0, cursor);
  const snapshot = snapshotOf(candles, data ? 'live' : 'replay');
  if (
    data &&
    Date.now() / 1000 - snapshot.asOf >
      scannerParameters.closedCandleMaxAgeSeconds
  )
    throw new Error(
      'Candles fechados estão antigos. Aguarde atualização do histórico.',
    );
  if (data) {
    snapshot.symbol = config(env).symbol;
    snapshot.tickSize = data.state.tickSize;
  }
  const analysis = strategyId || mode === 'REAL'
    ? scanMarket(snapshot).candidates.find(c=>c.definition.id === (strategyId || strategy.id))?.analysis
    : strategy.evaluate(snapshot);
  if (!analysis) throw new Error('Estratégia inexistente');
  return { analysis, snapshot, data, strategy, candles };
}
export async function onRequestPost({request,env}:{request:Request;env:BridgeEnv}) {
 let body:any, audit:any={};
 try {
  body=await request.json(); const c=config(env);
  if(body.action==='propose') {
   if(!['PAPER','REAL'].includes(body.mode))throw new Error('Modo inválido');
   const m=await market(env,body.source,body.cursor,body.mode,body.strategy),contract=instrumentValue(m.snapshot.symbol,body.mode,m.data?.state);
   audit={strategyId:m.analysis.strategy,version:m.analysis.version,setupId:m.analysis.setup?.id,marketAsOf:m.snapshot.asOf,requestedOrder:{symbol:m.snapshot.symbol,quantity:Number.isFinite(body.quantity)?body.quantity:null,entry:m.analysis.setup?.entry,stop:m.analysis.setup?.stop,target:m.analysis.setup?.targets[0]},conditions:m.analysis.conditions};
   const ctx=body.mode==='REAL'?await realContext(env):null,auth=ctx?.authorizations?.find((a:any)=>a.strategy_id===m.analysis.strategy&&a.version===m.analysis.version);
   if(body.mode==='REAL')assertReady(realReadiness(ctx,env));
   const p=makeProposal(body.mode==='REAL'?{...m.analysis,stage:auth?.stage || m.analysis.stage}:m.analysis,{mode:body.mode,source:body.source,symbol:m.snapshot.symbol,quantity:body.quantity,max:c.maxContracts,pointValue:contract.pointValue,currency:contract.currency,pointValueSource:contract.source,cursor:body.source==='mt5'?m.snapshot.asOf:body.cursor,asOf:m.snapshot.asOf,liveAuthorized:auth?.live_authorized===true});
   if(body.mode==='REAL')assertReady(realReadiness(ctx,env,p));
   return Response.json(await rpc(env,'trade_propose',{p_owner:owner,p_bridge:c.bridgeId,p_proposal:p}));
  }
  if(!['confirm','discard','prepare-real'].includes(body.action))throw new Error('Ação inválida');
  const rows=await rpc(env,'trade_operations_read',{p_owner:owner}),row=rows.find((r:any)=>r.id===body.id);
  if(!row)throw new Error('Proposta inexistente');
  const p:Proposal=row.payload;if(p.mode==='REAL')body.mode='REAL';
  audit={proposalId:p.id,strategyId:p.setup.strategy,version:p.setup.version,setupId:p.setup.id,marketAsOf:p.asOf,requestedOrder:{symbol:p.symbol,direction:p.direction,quantity:p.quantity,entry:p.entry,stop:p.sl,target:p.tp},riskBRL:p.riskBRL,riskPoints:p.riskPoints};
  let command=null;
  if(['confirm','prepare-real'].includes(body.action)&&row.state==='AGUARDANDO CONFIRMAÇÃO') {
   const m=await market(env,p.source,body.cursor,p.mode,p.setup.strategy);
   if(m.analysis.status!=='complete'||m.analysis.setup?.id!==p.setup.id||m.snapshot.asOf!==p.asOf)throw new Error('Análise mudou. Descarte e gere uma nova proposta.');
   if(p.mode==='REAL'){
    const ctx=await realContext(env);assertReady(realReadiness(ctx,env,p));
    command=await signCommand({...validateCommand({id:p.id,action:p.direction,symbol:p.symbol,volume:p.quantity,sl:p.sl,tp:p.tp,price:0,ticket:'0',expiresAt:p.expiresAt},env),referencePrice:p.entry,maxRiskBRL:ctx.policy.max_risk_brl,maxLossBRL:ctx.policy.max_daily_loss_brl,maxSlippagePoints:ctx.policy.max_slippage_points},env);
   }
  }
  if(body.action==='prepare-real') {
   if(p.mode!=='REAL'||!command)throw new Error('Proposta REAL pendente obrigatória');
   const nonce=crypto.randomUUID()+crypto.randomUUID(),ctx=await realContext(env);
   const prepared=await rpc(env,'trade_real_prepare',{p_owner:owner,p_id:p.id,p_hash:await nonceHash(nonce),p_command:command,p_snapshot:{...audit,setup:p.setup,feed:ctx.bridge.tick},p_max:c.maxContracts,p_account:c.accountHash,p_age:c.maxAgeMs,p_backend:c.execution});
   return Response.json({nonce,expiresAt:prepared.expiresAt,proposal:p});
  }
  if(p.mode==='REAL'&&body.action==='confirm') {
   if(body.confirmation!=='CONFIRMAR ORDEM REAL'||typeof body.nonce!=='string'||body.nonce.length>100)throw new Error('Segunda confirmação humana REAL obrigatória');
   if(!command){if(row.state!=='CONFIRMADA'||!row.command?.payload)throw new Error('Proposta REAL não confirmável');command=row.command.payload;}
   return Response.json(await new MT5BrokerExecutionProvider(env).approve(p,{command,nonce:body.nonce}));
  }
  if(p.mode==='PAPER'&&body.action==='confirm')return Response.json(await new PaperExecutionProvider(env).approve(p));
  return Response.json(await rpc(env,'trade_confirm',{p_owner:owner,p_id:p.id,p_action:body.action,p_command:null,p_max:c.maxContracts,p_account:c.accountHash,p_max_age:c.maxAgeMs}));
 }catch(e){
  if(body?.mode==='REAL'||body?.action==='prepare-real'||body?.confirmation)await rpc(env,'trade_real_audit',{p_bridge:config(env).bridgeId,p_payload:{...audit,proposalId:audit.proposalId||(typeof body.id==='string'?body.id.slice(0,36):null),action:String(body.action).slice(0,30),status:'BLOCKED',timestamp:new Date().toISOString()}}).catch(()=>{});
  return Response.json(e instanceof PersistenceError?persistenceFailure(e):{error:e instanceof Error?e.message:'Operação bloqueada'},{status:409});
 }
}
export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: BridgeEnv;
}) {
  try {
    const u = new URL(request.url),
      cursor = Number(u.searchParams.get('cursor') || 0),
      source = u.searchParams.get('source') || 'replay';
    const rows = await rpc(env, 'trade_operations_read', { p_owner: owner });
    const data = rows.some((r: any) => r.payload.source === 'mt5')
      ? await new MT5MarketDataProvider(env).read()
      : null;
    const candles =
      source === 'mt5'
        ? (data?.candles || []).filter(
            (c: any) => c.timestamp + 60 <= Date.now() / 1000,
          )
        : generateMockCandles().slice(0, Math.max(0, Math.min(420, cursor)));
    for (const row of rows) {
      if (
        row.state === 'DESCARTADA' &&
        row.payload.mode === 'PAPER' &&
        row.payload.source === source &&
        !row.hypothetical_execution?.exitTime
      ) {
        const hypothetical = paperExecution(
          row.payload,
          candles,
          row.hypothetical_execution,
        );
        if (hypothetical) {
          await rpc(env, 'trade_hypothetical_observe', {
            p_owner: owner,
            p_id: row.id,
            p_execution: hypothetical,
          });
          row.hypothetical_execution = hypothetical;
        }
      }
      if (row.state !== 'CONFIRMADA' || row.execution?.exitTime) continue;
      const p: Proposal = row.payload;
      let execution = row.execution;
      if (p.mode === 'REAL')
        execution = executionView(
          p,
          row.command,
          row.events,
          data?.state?.positions || [],
          !!data && feedStatus(data, env).status === 'LIVE',
          data?.state?.orders || [],
        );
      else if (p.source === source) {
        execution = new PaperExecutionProvider(env).observe(p, candles, row.execution) || row.execution;
      }
      if (execution) {
        await rpc(env, 'trade_operation_observe', {
          p_owner: owner,
          p_id: p.id,
          p_execution: execution,
          p_cursor:
            source === 'mt5'
              ? snapshotOf(candles, 'live').asOf
              : candles.length,
        });
        row.execution = execution;
        if (
          p.source === 'mt5' &&
          (!data || feedStatus(data, env).status !== 'LIVE') &&
          row.execution?.position
        ) {
          row.execution = {
            ...row.execution,
            feedLive: false,
            position: {
              ...row.execution.position,
              current: null,
              profit: null,
            },
          };
        }
      }
    }
    return Response.json(rows);
  } catch (e) {
    return Response.json(persistenceFailure(e), { status: 503 });
  }
}
