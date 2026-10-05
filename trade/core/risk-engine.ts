export type InstrumentSpecification = {
  symbol: string;
  tickSize: number;
  pointValue: number;
  minContracts: number;
  contractStep: number;
  maxContracts: number;
};

export type RiskPolicy = {
  capitalBase: number;
  riskPerTradePercent?: number;
  riskPerTradeBRL?: number;
  dailyLossLimitPercent?: number;
  dailyLossLimitBRL?: number;
  maxOpenRiskBRL?: number;
  maxContracts?: number;
};

export type RiskState = {
  realizedPnLToday: number;
  openRiskBRL: number;
  currentDrawdownBRL?: number;
};

export type PositionSizingInput = {
  entry: number;
  stop: number;
  instrument: InstrumentSpecification;
  policy: RiskPolicy;
  state?: RiskState;
};

export type PositionSizingResult = {
  allowed: boolean;
  reason?: 'INVALID_RISK_INPUT'|'DAILY_LOSS_LIMIT'|'OPEN_RISK_LIMIT'|'NO_TRADE_RISK_LIMIT';
  riskBudgetBRL: number;
  stopPoints: number;
  riskPerContractBRL: number;
  contracts: number;
  actualRiskBRL: number;
  initialRBRL: number;
};

function finitePositive(n:number|undefined): n is number { return Number.isFinite(n) && (n as number)>0; }
function floorStep(value:number, step:number){ return Math.floor((value+1e-12)/step)*step; }

export function riskBudget(policy:RiskPolicy):number {
  const byPercent=finitePositive(policy.riskPerTradePercent) ? policy.capitalBase*policy.riskPerTradePercent/100 : Number.POSITIVE_INFINITY;
  const byCash=finitePositive(policy.riskPerTradeBRL) ? policy.riskPerTradeBRL : Number.POSITIVE_INFINITY;
  const budget=Math.min(byPercent,byCash);
  return Number.isFinite(budget) ? budget : 0;
}

export function dailyLossLimit(policy:RiskPolicy):number {
  const byPercent=finitePositive(policy.dailyLossLimitPercent) ? policy.capitalBase*policy.dailyLossLimitPercent/100 : Number.POSITIVE_INFINITY;
  const byCash=finitePositive(policy.dailyLossLimitBRL) ? policy.dailyLossLimitBRL : Number.POSITIVE_INFINITY;
  return Math.min(byPercent,byCash);
}

export function sizePosition(input:PositionSizingInput):PositionSizingResult {
  const {entry,stop,instrument,policy}=input, state=input.state || {realizedPnLToday:0,openRiskBRL:0};
  const budget=riskBudget(policy), stopPoints=Math.abs(entry-stop), riskPerContractBRL=stopPoints*instrument.pointValue;
  const invalid=![entry,stop,instrument.tickSize,instrument.pointValue,instrument.minContracts,instrument.contractStep,instrument.maxContracts,policy.capitalBase].every(finitePositive) || !finitePositive(budget) || !finitePositive(stopPoints) || !finitePositive(riskPerContractBRL);
  const base={riskBudgetBRL:budget,stopPoints,riskPerContractBRL,contracts:0,actualRiskBRL:0,initialRBRL:budget};
  if(invalid)return {allowed:false,reason:'INVALID_RISK_INPUT',...base};
  const lossLimit=dailyLossLimit(policy);
  if(Number.isFinite(lossLimit) && state.realizedPnLToday<=-lossLimit)return {allowed:false,reason:'DAILY_LOSS_LIMIT',...base};
  const remainingOpen=finitePositive(policy.maxOpenRiskBRL) ? Math.max(0,policy.maxOpenRiskBRL-state.openRiskBRL) : Number.POSITIVE_INFINITY;
  if(remainingOpen<=0)return {allowed:false,reason:'OPEN_RISK_LIMIT',...base};
  const effectiveBudget=Math.min(budget,remainingOpen);
  const configuredMax=finitePositive(policy.maxContracts) ? policy.maxContracts : Number.POSITIVE_INFINITY;
  const maxContracts=Math.min(instrument.maxContracts,configuredMax);
  const raw=Math.min(effectiveBudget/riskPerContractBRL,maxContracts);
  const contracts=floorStep(raw,instrument.contractStep);
  if(contracts<instrument.minContracts)return {allowed:false,reason:'NO_TRADE_RISK_LIMIT',...base};
  return {allowed:true,riskBudgetBRL:budget,stopPoints,riskPerContractBRL,contracts,actualRiskBRL:contracts*riskPerContractBRL,initialRBRL:contracts*riskPerContractBRL};
}

export function remainingPositionRiskBRL(direction:'long'|'short', entry:number, stop:number, contracts:number, pointValue:number):number {
  if(![entry,stop,contracts,pointValue].every(Number.isFinite) || contracts<=0 || pointValue<=0)return 0;
  const adverse=direction==='long' ? Math.max(0,entry-stop) : Math.max(0,stop-entry);
  return adverse*contracts*pointValue;
}

export const WIN_SPEC:InstrumentSpecification={symbol:'WIN',tickSize:5,pointValue:0.2,minContracts:1,contractStep:1,maxContracts:100};
