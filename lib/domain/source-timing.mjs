// Per-request stage timing for SERVICE reads: durations and counts only, never data, claims or identifiers.
export function sourceTiming(){
 const started=Date.now(),stages={},counts={};
 return {
  async measure(stage,fn){const t=Date.now();try{return await fn();}finally{stages[stage]=(stages[stage]||0)+(Date.now()-t);counts[stage]=(counts[stage]||0)+1;}},
  snapshot(){return {total_ms:Date.now()-started,stages_ms:{...stages},counts:{...counts}};}
 };
}
