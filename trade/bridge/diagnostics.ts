import { PersistenceError, type BridgeEnv } from './config';
import { BatchValidationError } from './protocol';
export type ExchangeStage = 'authenticate'|'parse'|'config'|'validateBatch'|'probeOperations'|'trade_bridge_exchange'|'trade_bridge_exchange_v2'|'commandWire';
const knownMessages = new Set(['JSON obrigatório','Lote excede limite','Limites do bridge inválidos','Candles inválidos, fora de ordem ou misturados.']);
/** Allowlisted metadata only: never body, token, account, headers or raw RPC message. */
export function exchangeDiagnostic(stage:ExchangeStage,error:unknown,value:any,env:BridgeEnv){
 const identifier=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v)?v:null;
 const count=(v:unknown)=>Array.isArray(v)?v.length:null;
 const typed=error instanceof BatchValidationError, persistence=error instanceof PersistenceError;
 const message=typed||persistence?error.message:error instanceof Error&&knownMessages.has(error.message)?error.message:stage==='parse'?'JSON inválido':stage==='config'?'Configuração do bridge inválida':'Falha no transporte do bridge';
 return {httpStatus:stage==='authenticate'?401:400,stage,error:message,errorCode:typed?error.code:persistence?error.code:stage==='parse'?'BRIDGE_JSON_INVALID':stage==='config'?'BRIDGE_CONFIG_INVALID':'BRIDGE_TRANSPORT_ERROR',field:typed?error.field:null,bridgeId:identifier(value?.bridgeId),symbol:identifier(value?.symbol),protocolVersion:Number.isInteger(value?.state?.protocolVersion)?value.state.protocolVersion:null,batch:Number.isSafeInteger(value?.batch)?value.batch:null,ticks:count(value?.ticks),candles:count(value?.candles),events:count(value?.events),runtime:{urlPresent:!!env.TRADE_SUPABASE_URL,serviceKeyPresent:!!env.TRADE_SUPABASE_SERVICE_KEY,executionExplicitlyDisabled:env.TRADE_EXECUTION_ENABLED==='false'},rpcStatus:persistence?error.httpStatus??null:null,rpcCode:persistence?error.databaseCode??null:null};
}
