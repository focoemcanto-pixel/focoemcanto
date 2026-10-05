/** Reference contract for the EA's FILE_COMMON upgrade, tested without a broker. */
export function upgradePendingTransport(
  p: any,
  current: {
    bridgeId: string;
    symbol: string;
    accountHash: string;
    state: any;
  },
) {
  if (
    !p ||
    p.bridgeId !== current.bridgeId ||
    p.symbol !== current.symbol ||
    p.accountHash !== current.accountHash
  )
    throw new Error('PENDING_IDENTITY_MISMATCH');
  if (p.state?.protocolVersion === 2)
    return { changed: false, pending: structuredClone(p) };
  if (p.state?.protocolVersion !== undefined && p.state?.protocolVersion !== 1)
    throw new Error('PENDING_PROTOCOL_UNSUPPORTED');
  if (
    current.state.protocolVersion !== 2 ||
    current.state.executionAllowed !== false ||
    !Number.isFinite(current.state.tickSize) ||
    current.state.tickSize <= 0
  )
    throw new Error('PENDING_RECOVERY_NOT_READY');
  // Keep the original lease/batch ID, tick watermark, candles and event IDs.
  // Back up original bytes before replacement in MQL5; ledger/refs/seen are untouched.
  return {
    changed: true,
    pending: { ...structuredClone(p), state: structuredClone(current.state) },
  };
}

/** Disarmed restart keeps the transport lease; transactions use a separate fresh namespace. */
export function resumeDisarmedSession(pending:any,current:{bridgeId:string;symbol:string;accountHash:string},stored:string,newSession:string,executionEnabled:boolean){
 if(executionEnabled)return newSession;
 let session=stored;
 if(pending){
  if(pending.bridgeId!==current.bridgeId||pending.symbol!==current.symbol||pending.accountHash!==current.accountHash)throw new Error('PENDING_IDENTITY_MISMATCH');
  if(![undefined,1,2].includes(pending.state?.protocolVersion))throw new Error('PENDING_PROTOCOL_UNSUPPORTED');
  session=pending.session;
 }
 if(session&&!/^[a-f0-9]{32}$/.test(session))throw new Error('PENDING_SESSION_INVALID');
 return session||newSession;
}
