import {realContext,realReadiness} from '../../../trade/bridge/real';
import {persistenceFailure,type BridgeEnv} from '../../../trade/bridge/config';
/** Existing FocoOS admin middleware, never exports fingerprint, policy secrets or tokens. */
export async function onRequestGet({env}:{env:BridgeEnv}) {
 try{return Response.json({paper:'OPERACIONAL',real:realReadiness(await realContext(env),env)});}
 catch(e){return Response.json({paper:'VERIFICAR PERSISTÊNCIA',real:{status:'REAL DESARMADO',canExecute:false,pipeline:'IMPLEMENTADO',gates:[{key:'persistence',ok:false,label:'Persistência / política REAL',reason:persistenceFailure(e).error}]},...persistenceFailure(e)},{status:503});}
}
