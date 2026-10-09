#property strict
#property version "2.08"
#property description "Foco Trade XP/MT5 bridge. Execution disabled by default."
input string ApiOrigin="https://focoemcanto.com";
input string BridgeToken="";
input string BridgeId="xp-mt5-primary";
input string TradeSymbol="WINV26";
input bool EnableExecution=false;
input int MaxContracts=1;
// Initial provisioning: immutable HARD CAPS, not operational policy. Zero locks execution.
// Normal app policy changes use min(policy, hard cap); remote input never raises a cap.
input double MaxRiskBRL=0;
input double MaxLoss24hBRL=0;
input double MaxSlippagePoints=0;
input int MaxPositions=1;
input string ExpectedAccountFingerprint="";
input ulong MagicNumber=706032601;
input int PollSeconds=2;
input int HistoryBars=1500;
input int TickRecoverySeconds=300;
input int MaxTickBatch=1000;
input int HttpTimeoutMs=5000;
input int MaxDeviationPoints=10;
// One bridge instance per terminal AND FILE_COMMON namespace. Never delete ledger.
int lockHandle=INVALID_HANDLE;
string prefix,session,eventSession,accountHash,pending="",events="";
long batch=0,lastMsc=0;
datetime lastBar=0;
int sameMscCount=0;
string commands[];
string seenEvents="";
string brokerRefs="";
ulong eventSequence=0;
bool historyReady=false,protectionFault=false;
long historyAsOfMsc=0; double loss24hBRL=0;
long tickGapFromMsc=0,tickGapToMsc=0,tickGapAtMsc=0; // last backlog skipped (broker-wall ms), reported in state
int lastExchangeHttpStatus=0;long lastExchangeAckAt=0;
// Transport failures with no HTTP response (MT5 WebRequest status outside 100..599, e.g. 1003): counted and
// reported in the next batch. The same durable batch is always retried; nothing is converted into success.
int transportFailures=0,lastTransportStatus=0;long lastTransportFailureAt=0;string lastGateText="";
int consecutiveFailures=0,lastNetworkError=0,lastLatencyMs=0;long lastRecoveryAt=0;
long policyVersion=0,policyValidUntil=0,realArmedAt=0,realExpiresAt=0;
string policyHash="",realSessionId="0";bool remoteArmed=false;
double policyRisk=0,policyLoss=0,policySlip=0,policyNotional=0;
int policyContracts=0,policyPositions=0,policyPositionContracts=0,policyOrdersSession=0,policyOrdersDay=0,policySessionMinutes=0;
// A POLICY2 snapshot is memory-only and expires. Restart/reconnect never restores an armed permit.
bool ReceivePolicy(string line){
 string p[];if(StringSplit(line,'|',p)!=23 || p[0]!="POLICY2")return false;
 string canonical=p[0];for(int i=1;i<22;i++)canonical+="|"+p[i];
 if(StringLen(p[22])!=64 || Hmac(canonical,BridgeToken)!=p[22])return false;
 long now=(long)TimeGMT()*1000,version=StringToInteger(p[1]),issued=StringToInteger(p[20]),expires=StringToInteger(p[21]);
 if(version<1 || version<policyVersion || StringLen(p[2])!=32 || (version==policyVersion && policyHash!="" && p[2]!=policyHash) || p[3]!=accountHash || p[4]!=session || p[5]!=TradeSymbol || issued>now+2000 || expires<=now || expires-issued>32000 || expires<=issued)return false;
 for(int i=6;i<=15;i++)if(StringToDouble(p[i])<=0 || !MathIsValidNumber(StringToDouble(p[i])))return false;
 for(int i=9;i<=11;i++)if(StringToDouble(p[i])!=MathFloor(StringToDouble(p[i])))return false;
 for(int i=13;i<=15;i++)if(StringToDouble(p[i])!=MathFloor(StringToDouble(p[i])))return false;
 bool active=p[19]=="1";
 long started=StringToInteger(p[17]),ends=StringToInteger(p[18]);
 if(p[19]!="0" && !active)return false;
 if(active && (StringLen(p[16])!=36 || started>now+2000 || ends<=now || ends<=started || ends-started>StringToInteger(p[15])*60000))return false;
 policyVersion=version;policyHash=p[2];policyValidUntil=expires;
 policyRisk=StringToDouble(p[6]);policyLoss=StringToDouble(p[7]);policySlip=StringToDouble(p[8]);
 policyContracts=(int)StringToInteger(p[9]);policyPositions=(int)StringToInteger(p[10]);policyPositionContracts=(int)StringToInteger(p[11]);policyNotional=StringToDouble(p[12]);
 policyOrdersSession=(int)StringToInteger(p[13]);policyOrdersDay=(int)StringToInteger(p[14]);policySessionMinutes=(int)StringToInteger(p[15]);
 realSessionId=p[16];realArmedAt=started;realExpiresAt=ends;remoteArmed=active;
 return true;
}
bool PolicyAllows(string &p[]){
 long now=(long)TimeGMT()*1000;
 return ArraySize(p)==19 && p[14]=="P2" && StringToInteger(p[15])==policyVersion && p[16]==policyHash && p[17]==realSessionId && remoteArmed && consecutiveFailures==0 && now<policyValidUntil && now<realExpiresAt && realArmedAt<=now && realExpiresAt-realArmedAt<=policySessionMinutes*60000;
}
string TransportJson(){return "{\"failures\":"+(string)transportFailures+",\"consecutiveFailures\":"+(string)consecutiveFailures+",\"lastStatus\":"+(string)lastTransportStatus+",\"lastNetworkError\":"+(string)lastNetworkError+",\"lastFailureAt\":"+(string)lastTransportFailureAt+",\"lastRecoveryAt\":"+(string)lastRecoveryAt+",\"latencyMs\":"+(string)lastLatencyMs+",\"terminalBuild\":"+(string)TerminalInfoInteger(TERMINAL_BUILD)+"}";}

string Q(string s) { StringReplace(s,"\\","\\\\"); StringReplace(s,"\"","\\\""); StringReplace(s,"\r","\\r"); StringReplace(s,"\n","\\n"); return "\""+s+"\""; }
string N(double n) { return DoubleToString(n,8); }
string B(bool b) { return b?"true":"false"; }
string Hash(string s) { uchar data[],key[],out[]; int n=StringToCharArray(s,data,0,WHOLE_ARRAY,CP_UTF8); ArrayResize(data,n-1); if(CryptEncode(CRYPT_HASH_SHA256,data,key,out)<=0)return ""; string h=""; for(int i=0;i<ArraySize(out);i++)h+=StringFormat("%02x",out[i]); return h; }
string Hmac(string message,string secret){
 uchar key[],data[],unused[],digest[];int n=StringToCharArray(secret,key,0,WHOLE_ARRAY,CP_UTF8);ArrayResize(key,n-1);
 if(ArraySize(key)>64){if(CryptEncode(CRYPT_HASH_SHA256,key,unused,digest)<=0)return "";ArrayCopy(key,digest);ArrayResize(key,ArraySize(digest));}
 uchar inner[],outer[];ArrayResize(inner,64);ArrayResize(outer,64);
 for(int i=0;i<64;i++){uchar k=i<ArraySize(key)?key[i]:0;inner[i]=(uchar)(k^0x36);outer[i]=(uchar)(k^0x5c);}
 n=StringToCharArray(message,data,0,WHOLE_ARRAY,CP_UTF8);ArrayResize(data,n-1);ArrayCopy(inner,data,64);
 if(CryptEncode(CRYPT_HASH_SHA256,inner,unused,digest)<=0)return "";ArrayCopy(outer,digest,64);
 if(CryptEncode(CRYPT_HASH_SHA256,outer,unused,digest)<=0)return "";
 string result="";for(int i=0;i<ArraySize(digest);i++)result+=StringFormat("%02x",digest[i]);return result;
}
bool SessionOpen(){
 MqlDateTime t;TimeToStruct(TimeTradeServer(),t);int seconds=t.hour*3600+t.min*60+t.sec;
 for(uint i=0;i<20;i++){datetime start,end;if(!SymbolInfoSessionTrade(TradeSymbol,(ENUM_DAY_OF_WEEK)t.day_of_week,i,start,end))break;
 int a=(int)((long)start%86400),b=(int)((long)end%86400);if(a==b || (a<b && seconds>=a && seconds<b) || (a>b && (seconds>=a || seconds<b)))return true;}
 return false;
}
void HistoryHealth(){
 historyReady=HistorySelect(TimeCurrent()-86400,TimeCurrent());historyAsOfMsc=(long)TimeGMT()*1000;loss24hBRL=0;if(!historyReady)return;
 for(int i=0;i<HistoryDealsTotal();i++){ulong ticket=HistoryDealGetTicket(i);long type=HistoryDealGetInteger(ticket,DEAL_TYPE);if(type!=DEAL_TYPE_BUY && type!=DEAL_TYPE_SELL)continue;
 double net=HistoryDealGetDouble(ticket,DEAL_PROFIT)+HistoryDealGetDouble(ticket,DEAL_COMMISSION)+HistoryDealGetDouble(ticket,DEAL_SWAP)+HistoryDealGetDouble(ticket,DEAL_FEE);loss24hBRL+=MathMax(0,-net);}
}
void ProtectionHealth(){
 bool fault=false;for(int i=0;i<PositionsTotal();i++)if(PositionGetTicket(i)>0 && (ulong)PositionGetInteger(POSITION_MAGIC)==MagicNumber && (PositionGetDouble(POSITION_SL)<=0 || PositionGetDouble(POSITION_TP)<=0))fault=true;
 if(fault && !protectionFault)Print("ALERT: Foco Trade position lacks SL/TP; inspect MT5 manually. New entries blocked.");protectionFault=fault;
}
bool Save(string filename,string body) { int f=FileOpen(filename+".tmp",FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON,0,CP_UTF8); if(f==INVALID_HANDLE)return false; uint n=FileWriteString(f,body); FileFlush(f); FileClose(f); if(n==0 && body!="")return false; return FileMove(filename+".tmp",FILE_COMMON,filename,FILE_COMMON|FILE_REWRITE); }
string Load(string filename) { int f=FileOpen(filename,FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON,0,CP_UTF8); if(f==INVALID_HANDLE)return ""; string s=""; while(!FileIsEnding(f)){string line=FileReadString(f); s+=line; if(!FileIsEnding(f))s+="\n";} FileClose(f); return s; }
// Minimal structural JSON reader for our durable transport envelope; no order execution.
int JsonEnd(string j,int start){
 bool quoted=false,escaped=false;int depth=0;
 for(int i=start;i<StringLen(j);i++){
  ushort ch=StringGetCharacter(j,i);
  if(quoted){if(escaped)escaped=false;else if(ch==92)escaped=true;else if(ch==34){quoted=false;if(depth==0)return i+1;}continue;}
  if(ch==34){quoted=true;continue;}if(ch==123 || ch==91)depth++;
  else if(ch==125 || ch==93){if(depth==0)return i;depth--;if(depth==0)return i+1;}
  else if(ch==44 && depth==0)return i;
 }return quoted || depth!=0?-1:StringLen(j);
}
int JsonSkip(string j,int pos){while(pos<StringLen(j)){ushort c=StringGetCharacter(j,pos);if(c!=32 && c!=9 && c!=10 && c!=13)break;pos++;}return pos;}
bool JsonMember(string j,string name,int &a,int &b){
 int pos=JsonSkip(j,0);if(pos>=StringLen(j) || StringGetCharacter(j,pos)!=123)return false;pos++;
 while(pos<StringLen(j)){
  pos=JsonSkip(j,pos);if(pos>=StringLen(j) || StringGetCharacter(j,pos)!=34)return false;
  int end=JsonEnd(j,pos);if(end<0)return false;string key=StringSubstr(j,pos+1,end-pos-2);
  pos=JsonSkip(j,end);if(pos>=StringLen(j) || StringGetCharacter(j,pos)!=58)return false;
  a=JsonSkip(j,pos+1);b=JsonEnd(j,a);if(b<0)return false;
  if(key==name)return true;pos=JsonSkip(j,b);if(pos>=StringLen(j) || StringGetCharacter(j,pos)!=44)return false;pos++;
 }return false;
}
string JsonField(string j,string name){int a,b;if(!JsonMember(j,name,a,b))return "";string v=StringSubstr(j,a,b-a);StringTrimRight(v);if(StringLen(v)>=2 && StringGetCharacter(v,0)==34)return StringSubstr(v,1,StringLen(v)-2);return v;}
bool RecoverLegacyPending(){
 if(pending=="")return true;int a,b;if(!JsonMember(pending,"state",a,b)){Print("PENDING_STATE_INVALID: transport quarantined; evidence preserved");return false;}
 string oldState=StringSubstr(pending,a,b-a),version=JsonField(oldState,"protocolVersion");
 if(version=="2")return true;
 if(version!="" && version!="1"){Print("PENDING_PROTOCOL_UNSUPPORTED: transport quarantined");return false;}
 if(JsonField(pending,"bridgeId")!=BridgeId || JsonField(pending,"symbol")!=TradeSymbol || JsonField(pending,"accountHash")!=accountHash){Print("PENDING_IDENTITY_MISMATCH: preserve files and review identity; no order sent");return false;}
 if(EnableExecution || SymbolInfoDouble(TradeSymbol,SYMBOL_TRADE_TICK_SIZE)<=0){Print("PENDING_RECOVERY_NOT_READY: requires execution disabled and symbol metadata");return false;}
 string backup=prefix+"pending_upgrade_"+Hash(pending)+".txt";
 if(Load(backup)=="" && !Save(backup,pending)){Print("Cannot preserve legacy pending; recovery blocked");return false;}
 string upgraded=StringSubstr(pending,0,a)+StateJson()+StringSubstr(pending,b);
 if(!Save(prefix+"pending.txt",upgraded)){Print("Cannot persist upgraded pending; original backup preserved");return false;}
 pending=upgraded;
 // No cursor rewind, no new batch/session, no ledger/refs/seen/events deletion.
 Print("Legacy pending transport upgraded to protocol 2; batch/events/watermark preserved; execution locked");return true;
}
string ResponseShape(string reply){
 if(reply=="")return "BRIDGE_RESPONSE_EMPTY";
 if(StringFind(reply,"OK\n")==0)return "BRIDGE_RESPONSE_OK";
 if(StringFind(reply,"{")==0)return "BRIDGE_RESPONSE_JSON_UNKNOWN";
 if(StringFind(reply,"<")>=0)return "BRIDGE_RESPONSE_HTML";
 return "BRIDGE_RESPONSE_TEXT";
}
string BackendErrorCode(string reply){
 string code=JsonField(reply,"errorCode");
 // Only known, non-secret codes are logged. Never print the response body.
 string allowed="|BRIDGE_UNAUTHORIZED|BRIDGE_JSON_INVALID|BRIDGE_CONFIG_INVALID|BRIDGE_TRANSPORT_ERROR|BRIDGE_IDENTITY_INVALID|BRIDGE_ID_MISMATCH|BRIDGE_SYMBOL_MISMATCH|BRIDGE_SESSION_INVALID|BRIDGE_BATCH_INVALID|BRIDGE_ACCOUNT_MISMATCH|BRIDGE_BATCH_SIZE|BRIDGE_TICK_INVALID|BRIDGE_CANDLES_INVALID|BRIDGE_CANDLE_UNCLOSED_OR_SYMBOL|BRIDGE_STATE_INVALID|BRIDGE_POSITION_ORDER_INVALID|BRIDGE_TICK_SIZE_INVALID|BRIDGE_EVENT_INVALID|CONFIGURATION_MISSING|SCHEMA_MISSING|ACCESS_DENIED|PERSISTENCE_UNAVAILABLE|BRIDGE_SESSION_LEASE_CONFLICT|";
 return code!="" && StringFind(allowed,"|"+code+"|")>=0?code:ResponseShape(reply);
}
string Tag(string id) { StringReplace(id,"-",""); return "FT"+StringSubstr(id,0,24); }
string CommandIdFor(string tag) { for(int i=0;i<ArraySize(commands);i++){string p[]; if((StringSplit(commands[i],'|',p)==10 || ArraySize(p)==15) && Tag(p[1])==tag)return p[1];}return ""; }
bool QueueEvent(string id,string kind,string commandId,string fields="") {
 if(StringFind(seenEvents,"|"+id+"|")>=0)return true;
 string e="{\"id\":"+Q(id)+",\"kind\":"+Q(kind)+",\"commandId\":"+Q(commandId)+fields+"}";
 if(events!="")events+=","; events+=e;
 if(!Save(prefix+"events.txt",events)){ Print("Event journal unavailable: execution disabled"); ExpertRemove(); return false; }
 seenEvents+="|"+id+"|"; if(!Save(prefix+"seen.txt",seenEvents)){ExpertRemove();return false;}return true;
}
void ResultEvent(string id,string kind,uint retcode,ulong order,ulong deal) {
 if(order>0){brokerRefs+="|"+(string)order+"="+id+"|";if(!Save(prefix+"refs.txt",brokerRefs)){ExpertRemove();return;}}
 QueueEvent("result_"+id+"_"+kind,kind,id,",\"retcode\":"+(string)retcode+",\"order\":"+Q((string)order)+",\"deal\":"+Q((string)deal));
}
string PositionsJson() {
 string j="["; bool first=true;
 for(int i=0;i<PositionsTotal();i++){ulong t=PositionGetTicket(i); if(t==0)continue;
 if(!first)j+=","; first=false;
 j+="{\"ticket\":"+Q((string)t)+",\"symbol\":"+Q(PositionGetString(POSITION_SYMBOL))+",\"identifier\":"+Q((string)PositionGetInteger(POSITION_IDENTIFIER))+",\"current\":"+N(PositionGetDouble(POSITION_PRICE_CURRENT))+",\"profit\":"+N(PositionGetDouble(POSITION_PROFIT))+",\"magic\":"+Q((string)PositionGetInteger(POSITION_MAGIC))+",\"type\":"+(string)PositionGetInteger(POSITION_TYPE)+",\"volume\":"+N(PositionGetDouble(POSITION_VOLUME))+",\"price\":"+N(PositionGetDouble(POSITION_PRICE_OPEN))+",\"sl\":"+N(PositionGetDouble(POSITION_SL))+",\"tp\":"+N(PositionGetDouble(POSITION_TP))+"}";
 } return j+"]";
}
string OrdersJson() {
 string j="["; bool first=true;
 for(int i=0;i<OrdersTotal();i++){ulong t=OrderGetTicket(i); if(t==0)continue;
 if(!first)j+=",";first=false;
 j+="{\"ticket\":"+Q((string)t)+",\"symbol\":"+Q(OrderGetString(ORDER_SYMBOL))+",\"magic\":"+Q((string)OrderGetInteger(ORDER_MAGIC))+",\"comment\":"+Q(OrderGetString(ORDER_COMMENT))+",\"type\":"+(string)OrderGetInteger(ORDER_TYPE)+",\"volume\":"+N(OrderGetDouble(ORDER_VOLUME_CURRENT))+",\"price\":"+N(OrderGetDouble(ORDER_PRICE_OPEN))+",\"sl\":"+N(OrderGetDouble(ORDER_SL))+",\"tp\":"+N(OrderGetDouble(ORDER_TP))+"}";
 }return j+"]";
}
bool ExecutionAllowed(){return EnableExecution && TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) && MQLInfoInteger(MQL_TRADE_ALLOWED) && AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) && AccountInfoInteger(ACCOUNT_TRADE_EXPERT);}
// Every component of the local execution gate, so "EnableExecution=true" is never mistaken for an armed EA.
string GateJson(){return "{\"input\":"+B(EnableExecution)+",\"terminalAlgoTrading\":"+B((bool)TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))+",\"eaAlgoTrading\":"+B((bool)MQLInfoInteger(MQL_TRADE_ALLOWED))+",\"accountTradeAllowed\":"+B((bool)AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))+",\"accountExpertAllowed\":"+B((bool)AccountInfoInteger(ACCOUNT_TRADE_EXPERT))+",\"allowed\":"+B(ExecutionAllowed())+"}";}
string GateText(){
 if(ExecutionAllowed())return "ARMED";
 string r="";
 if(!EnableExecution)r+=" EnableExecution=false;";
 if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))r+=" botao Algo Trading do terminal desligado;";
 if(!MQLInfoInteger(MQL_TRADE_ALLOWED))r+=" 'Permitir Algo Trading' desmarcado nas propriedades do EA;";
 if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))r+=" conta sem permissao de negociacao;";
 if(!AccountInfoInteger(ACCOUNT_TRADE_EXPERT))r+=" corretora nao permite Expert Advisor nesta conta;";
 // MQL5 StringTrim* modify in place and return a count, so trim explicitly.
 if(StringLen(r)>1)r=StringSubstr(r,1,StringLen(r)-2);
 return "LOCKED ("+r+")";
}
string StateJson(){HistoryHealth();ProtectionHealth();return "{\"marketClock\":{\"basis\":\"broker-wall\",\"serverNowSeconds\":"+(string)(long)TimeTradeServer()+",\"utcNowSeconds\":"+(string)(long)TimeGMT()+",\"utcOffsetSeconds\":"+(string)((long)TimeTradeServer()-(long)TimeGMT())+"},\"protocolVersion\":2,\"eaVersion\":\"2.08\",\"policyProtocol\":1,\"policyReceipt\":{\"version\":"+(string)policyVersion+",\"hash\":"+Q(policyHash)+",\"validUntil\":"+(string)policyValidUntil+"},\"localLimitsSemantics\":\"HARD_CAPS\",\"executionGate\":"+GateJson()+",\"transport\":"+TransportJson()+",\"tickGap\":{\"fromMsc\":"+(string)tickGapFromMsc+",\"toMsc\":"+(string)tickGapToMsc+",\"atMsc\":"+(string)tickGapAtMsc+"},\"lastExchangeHttpStatus\":"+(string)lastExchangeHttpStatus+",\"lastExchangeAckAt\":"+(string)lastExchangeAckAt+",\"magic\":"+Q((string)MagicNumber)+",\"localAccountAuthorized\":"+B(ExpectedAccountFingerprint!="" && ExpectedAccountFingerprint==accountHash)+",\"localLimits\":{\"maxContracts\":"+(string)MaxContracts+",\"maxPositions\":"+(string)MaxPositions+",\"maxRiskBRL\":"+N(MaxRiskBRL)+",\"maxLossBRL\":"+N(MaxLoss24hBRL)+",\"maxSlippagePoints\":"+N(MaxSlippagePoints)+",\"maxDeviationPoints\":"+(string)MaxDeviationPoints+"},\"volumeMax\":"+N(SymbolInfoDouble(TradeSymbol,SYMBOL_VOLUME_MAX))+",\"point\":"+N(SymbolInfoDouble(TradeSymbol,SYMBOL_POINT))+",\"stopsLevel\":"+(string)SymbolInfoInteger(TradeSymbol,SYMBOL_TRADE_STOPS_LEVEL)+",\"freezeLevel\":"+(string)SymbolInfoInteger(TradeSymbol,SYMBOL_TRADE_FREEZE_LEVEL)+",\"expirationTime\":"+(string)SymbolInfoInteger(TradeSymbol,SYMBOL_EXPIRATION_TIME)+",\"tradeMode\":"+(string)SymbolInfoInteger(TradeSymbol,SYMBOL_TRADE_MODE)+",\"sessionOpen\":"+B(SessionOpen())+",\"historyReady\":"+B(historyReady)+",\"historyAsOfMsc\":"+(string)historyAsOfMsc+",\"loss24hBRL\":"+N(loss24hBRL)+",\"protectionFault\":"+B(protectionFault)+",\"connected\":"+B((bool)TerminalInfoInteger(TERMINAL_CONNECTED))+",\"executionAllowed\":"+B(ExecutionAllowed())+",\"currency\":"+Q(AccountInfoString(ACCOUNT_CURRENCY))+",\"tickValue\":"+N(SymbolInfoDouble(TradeSymbol,SYMBOL_TRADE_TICK_VALUE))+",\"tickSize\":"+N(SymbolInfoDouble(TradeSymbol,SYMBOL_TRADE_TICK_SIZE))+",\"volumeMin\":"+N(SymbolInfoDouble(TradeSymbol,SYMBOL_VOLUME_MIN))+",\"volumeStep\":"+N(SymbolInfoDouble(TradeSymbol,SYMBOL_VOLUME_STEP))+",\"accountTradeMode\":"+(string)AccountInfoInteger(ACCOUNT_TRADE_MODE)+",\"marginMode\":"+(string)AccountInfoInteger(ACCOUNT_MARGIN_MODE)+",\"balance\":"+N(AccountInfoDouble(ACCOUNT_BALANCE))+",\"equity\":"+N(AccountInfoDouble(ACCOUNT_EQUITY))+",\"freeMargin\":"+N(AccountInfoDouble(ACCOUNT_MARGIN_FREE))+",\"positions\":"+PositionsJson()+",\"orders\":"+OrdersJson()+"}";}
string CandlesJson(){MqlRates rates[];int count;datetime closed=iTime(TradeSymbol,PERIOD_M1,1);
 if(lastBar==0)count=CopyRates(TradeSymbol,PERIOD_M1,1,HistoryBars,rates);else count=CopyRates(TradeSymbol,PERIOD_M1,lastBar,closed,rates);
 if(count>0)lastBar=rates[count-1].time;string j="[";
 for(int i=0;i<count;i++){if(i>0)j+=",";j+="{\"symbol\":"+Q(TradeSymbol)+",\"timestamp\":"+(string)(long)rates[i].time+",\"timeframe\":\"1m\",\"open\":"+N(rates[i].open)+",\"high\":"+N(rates[i].high)+",\"low\":"+N(rates[i].low)+",\"close\":"+N(rates[i].close)+",\"volume\":"+N((double)rates[i].real_volume)+"}";}return j+"]";}
string TicksJson(){MqlTick ticks[];MqlTick latest;if(!SymbolInfoTick(TradeSymbol,latest))return "[]";
 if(lastMsc==0)lastMsc=MathMax(0,latest.time_msc-(long)TickRecoverySeconds*1000);
 // v2.06: a persisted cursor older than the recovery window (MT5/Mac closed for hours) is NOT replayed
 // tick by tick, which kept the feed hours behind. The gap is reported explicitly in state.tickGap and
 // streaming resumes at the recovery window; M1 candles keep the history. No tick is invented.
 if(latest.time_msc-lastMsc>(long)TickRecoverySeconds*1000){
 tickGapFromMsc=lastMsc;tickGapToMsc=latest.time_msc-(long)TickRecoverySeconds*1000;tickGapAtMsc=(long)TimeGMT()*1000;
 Print("TICK_BACKLOG_SKIPPED: ",tickGapFromMsc," -> ",tickGapToMsc," (",(tickGapToMsc-tickGapFromMsc)/1000,"s)");
 lastMsc=tickGapToMsc;sameMscCount=0;
 }
 int count=CopyTicksRange(TradeSymbol,ticks,COPY_TICKS_ALL,(ulong)lastMsc,(ulong)latest.time_msc);
 string j="[";int emitted=0,skipped=0;long original=lastMsc;int originalCount=sameMscCount;
 for(int i=0;i<count && emitted<MaxTickBatch;i++){
 if(ticks[i].time_msc==original && skipped<originalCount){skipped++;continue;}
 if(emitted>0)j+=",";emitted++;
 j+="{\"symbol\":"+Q(TradeSymbol)+",\"timeMsc\":"+(string)ticks[i].time_msc+",\"bid\":"+N(ticks[i].bid)+",\"ask\":"+N(ticks[i].ask)+",\"last\":"+N(ticks[i].last)+",\"volume\":"+N(ticks[i].volume_real)+",\"flags\":"+(string)ticks[i].flags+"}";
 if(ticks[i].time_msc!=lastMsc){lastMsc=ticks[i].time_msc;sameMscCount=1;}else sameMscCount++;
 }return j+"]";}
void Reconcile(){
 if(!HistorySelect(TimeCurrent()-86400*7,TimeCurrent()))return;
 for(int i=0;i<HistoryOrdersTotal();i++){
 ulong orderTicket=HistoryOrderGetTicket(i);
 if((ulong)HistoryOrderGetInteger(orderTicket,ORDER_MAGIC)!=MagicNumber || HistoryOrderGetString(orderTicket,ORDER_SYMBOL)!=TradeSymbol)continue;
 string orderId=CommandIdFor(HistoryOrderGetString(orderTicket,ORDER_COMMENT));
 if(orderId==""){string marker="|"+(string)orderTicket+"=";int pos=StringFind(brokerRefs,marker);if(pos>=0)orderId=StringSubstr(brokerRefs,pos+StringLen(marker),36);}
 if(orderId=="")continue;
 long orderState=HistoryOrderGetInteger(orderTicket,ORDER_STATE);
 QueueEvent("order_"+(string)orderTicket+"_"+(string)orderState,"order-state",orderId,",\"order\":"+Q((string)orderTicket)+",\"orderState\":"+(string)orderState);
 }
 for(int i=0;i<HistoryDealsTotal();i++){ulong ticket=HistoryDealGetTicket(i); if(HistoryDealGetString(ticket,DEAL_SYMBOL)!=TradeSymbol)continue;
 string id=CommandIdFor(HistoryDealGetString(ticket,DEAL_COMMENT));
 if(id==""){string marker="|"+(string)HistoryDealGetInteger(ticket,DEAL_ORDER)+"=";int pos=StringFind(brokerRefs,marker);if(pos>=0)id=StringSubstr(brokerRefs,pos+StringLen(marker),36);}
 ulong positionId=(ulong)HistoryDealGetInteger(ticket,DEAL_POSITION_ID);
 string positionMarker="|pos"+(string)positionId+"=";
 if(id==""){int pos=StringFind(brokerRefs,positionMarker);if(pos>=0)id=StringSubstr(brokerRefs,pos+StringLen(positionMarker),36);}
 if(id=="")continue;
 if(HistoryDealGetInteger(ticket,DEAL_ENTRY)==DEAL_ENTRY_IN && StringFind(brokerRefs,positionMarker)<0){brokerRefs+=positionMarker+id;if(!Save(prefix+"refs.txt",brokerRefs)){ExpertRemove();return;}}
 // Broker deal IDs deduplicate reconciliation and transaction callbacks in Postgres.
 QueueEvent("deal_"+(string)ticket,"observed",id,",\"entry\":"+(string)HistoryDealGetInteger(ticket,DEAL_ENTRY)+",\"position\":"+Q((string)HistoryDealGetInteger(ticket,DEAL_POSITION_ID))+",\"deal\":"+Q((string)ticket)+",\"order\":"+Q((string)HistoryDealGetInteger(ticket,DEAL_ORDER))+",\"price\":"+N(HistoryDealGetDouble(ticket,DEAL_PRICE))+",\"volume\":"+N(HistoryDealGetDouble(ticket,DEAL_VOLUME))+",\"profit\":"+N(HistoryDealGetDouble(ticket,DEAL_PROFIT))+",\"commission\":"+N(HistoryDealGetDouble(ticket,DEAL_COMMISSION))+",\"swap\":"+N(HistoryDealGetDouble(ticket,DEAL_SWAP))+",\"fee\":"+N(HistoryDealGetDouble(ticket,DEAL_FEE))+",\"timeMsc\":"+(string)HistoryDealGetInteger(ticket,DEAL_TIME_MSC));
 // Limit transport event size; next heartbeat resumes through durable broker history.
 if(StringLen(events)>50000)break;
 }
 for(int i=0;i<ArraySize(commands);i++){string p[];if(StringSplit(commands[i],'|',p)!=10 && ArraySize(p)!=15 && ArraySize(p)!=19)continue;ulong ticket=(ulong)StringToInteger(p[8]);bool confirmed=false;
 if(p[2]=="SLTP" && PositionSelectByTicket(ticket)) confirmed=MathAbs(PositionGetDouble(POSITION_SL)-StringToDouble(p[5]))<0.001 && MathAbs(PositionGetDouble(POSITION_TP)-StringToDouble(p[6]))<0.001;
 if(p[2]=="MODIFY" && OrderSelect(ticket))confirmed=MathAbs(OrderGetDouble(ORDER_PRICE_OPEN)-StringToDouble(p[7]))<0.001 && MathAbs(OrderGetDouble(ORDER_SL)-StringToDouble(p[5]))<0.001 && MathAbs(OrderGetDouble(ORDER_TP)-StringToDouble(p[6]))<0.001;
 if(p[2]=="CANCEL" && HistoryOrderSelect(ticket))confirmed=HistoryOrderGetInteger(ticket,ORDER_STATE)==ORDER_STATE_CANCELED;
 if(confirmed)QueueEvent("confirm_"+p[1],"observed",p[1],",\"ticket\":"+Q((string)ticket));
 }
}
void Execute(string line){
 string p[];int fields=StringSplit(line,'|',p);if(fields!=19 || p[0]!="CMD2" || StringLen(p[1])!=36 || StringLen(p[fields-1])!=64)return;
 string canonical=p[0];for(int i=1;i<fields-1;i++)canonical+="|"+p[i];if(Hmac(canonical,BridgeToken)!=p[fields-1]){Print("Invalid command signature; no order sent");return;}
 string id=p[1],action=p[2]; for(int i=0;i<ArraySize(commands);i++)if((StringFind(commands[i],"CMD2|"+id+"|")==0 || StringFind(commands[i],"CMD|"+id+"|")==0))return;
 // Durable intent BEFORE OrderSend. Never replay intent after restart.
 int n=ArraySize(commands);ArrayResize(commands,n+1);commands[n]=line;
 string ledger="";for(int i=0;i<ArraySize(commands);i++)ledger+=commands[i]+"\n";
 if(!Save(prefix+"ledger.txt",ledger)){Print("Cannot persist command intent; no order sent");ExpertRemove();return;}
 if(!PolicyAllows(p) || !ExecutionAllowed() || ExpectedAccountFingerprint=="" || ExpectedAccountFingerprint!=accountHash || MagicNumber!=706032601 || !SessionOpen() || p[3]!=TradeSymbol || StringToInteger(p[9])<(long)TimeGMT()*1000 || StringToInteger(p[9])>(long)TimeGMT()*1000+32000){ResultEvent(id,"rejected",0,0,0);return;}
 double volume=StringToDouble(p[4]),sl=StringToDouble(p[5]),tp=StringToDouble(p[6]),price=StringToDouble(p[7]);ulong ticket=(ulong)StringToInteger(p[8]);
 // Tick time is labelled with the broker server clock (XP: BRT wall time), so freshness is measured
 // against TimeTradeServer(), never TimeGMT(). Command expiry above stays on real UTC (TimeGMT).
 MqlTick tick;long serverNowMs=(long)TimeTradeServer()*1000;if(!SymbolInfoTick(TradeSymbol,tick) || (serverNowMs-tick.time_msc>15000 || tick.time_msc>serverNowMs+2000)){ResultEvent(id,"rejected",0,0,0);return;}
 if(volume<0 || volume>MathMin(MaxContracts,policyContracts) || ((action=="BUY" || action=="SELL" || action=="CLOSE") && (volume<1 || MathFloor(volume)!=volume))){ResultEvent(id,"rejected",0,0,0);return;}
 MqlTradeRequest req={};MqlTradeResult res={};MqlTradeCheckResult check={};
 double quotePoint=SymbolInfoDouble(TradeSymbol,SYMBOL_POINT);if(quotePoint<=0){ResultEvent(id,"rejected",0,0,0);return;}
 req.magic=MagicNumber;req.symbol=TradeSymbol;req.comment=Tag(id);req.volume=volume;req.sl=sl;req.tp=tp;req.deviation=(ulong)MathMin(MaxDeviationPoints,MathFloor(MathMin(MaxSlippagePoints,policySlip)/quotePoint));
 long filling=SymbolInfoInteger(TradeSymbol,SYMBOL_FILLING_MODE);req.type_filling=(filling&SYMBOL_FILLING_FOK)!=0?ORDER_FILLING_FOK:ORDER_FILLING_IOC;
 if(action=="BUY" || action=="SELL"){
 HistoryHealth();ProtectionHealth();
 if(!historyReady || protectionFault || PositionsTotal()!=0 || OrdersTotal()!=0 || MaxPositions<1 || MaxRiskBRL<=0 || MaxLoss24hBRL<=0 || MaxSlippagePoints<=0 || AccountInfoString(ACCOUNT_CURRENCY)!="BRL" || SymbolInfoInteger(TradeSymbol,SYMBOL_TRADE_MODE)!=SYMBOL_TRADE_MODE_FULL || SymbolInfoInteger(TradeSymbol,SYMBOL_EXPIRATION_TIME)<=TimeTradeServer()){ResultEvent(id,"rejected",0,0,0);return;}
 double minVol=SymbolInfoDouble(TradeSymbol,SYMBOL_VOLUME_MIN),step=SymbolInfoDouble(TradeSymbol,SYMBOL_VOLUME_STEP),maxVol=SymbolInfoDouble(TradeSymbol,SYMBOL_VOLUME_MAX);
 if(step<=0 || volume<minVol || volume>maxVol || MathAbs(volume/step-MathRound(volume/step))>1e-7){ResultEvent(id,"rejected",0,0,0);return;}
 double exposure=0;
 for(int i=0;i<PositionsTotal();i++){if(PositionGetTicket(i)>0 && PositionGetString(POSITION_SYMBOL)==TradeSymbol){exposure+=PositionGetDouble(POSITION_VOLUME);if((ulong)PositionGetInteger(POSITION_MAGIC)!=MagicNumber){ResultEvent(id,"rejected",0,0,0);return;}}}
 for(int i=0;i<OrdersTotal();i++){if(OrderGetTicket(i)>0 && OrderGetString(ORDER_SYMBOL)==TradeSymbol)exposure+=OrderGetDouble(ORDER_VOLUME_CURRENT);}
 if(exposure+volume>MathMin(MaxContracts,MathMin(policyContracts,policyPositionContracts)) || sl<=0 || tp<=0){ResultEvent(id,"rejected",0,0,0);return;}
 req.action=TRADE_ACTION_DEAL;req.type=action=="BUY"?ORDER_TYPE_BUY:ORDER_TYPE_SELL;req.price=action=="BUY"?tick.ask:tick.bid;
 if((action=="BUY" && (sl>=req.price || tp<=req.price)) || (action=="SELL" && (sl<=req.price || tp>=req.price))){ResultEvent(id,"rejected",0,0,0);return;}
 double tickSize=SymbolInfoDouble(TradeSymbol,SYMBOL_TRADE_TICK_SIZE),distance=(double)SymbolInfoInteger(TradeSymbol,SYMBOL_TRADE_STOPS_LEVEL)*SymbolInfoDouble(TradeSymbol,SYMBOL_POINT),riskProfit;
 double remoteRisk=StringToDouble(p[11]),remoteLoss=StringToDouble(p[12]),remoteSlip=StringToDouble(p[13]);
 if(tickSize<=0 || remoteRisk>policyRisk || remoteLoss>policyLoss || remoteSlip>policySlip || policyPositions<1 || req.price*SymbolInfoDouble(TradeSymbol,SYMBOL_TRADE_TICK_VALUE)/tickSize*volume>policyNotional){ResultEvent(id,"rejected",0,0,0);return;}
 // Conservative durable intent counts (including failed attempts), never reset by restart/reconnect.
 int countSession=0,countDay=0;MqlDateTime today;TimeToStruct(TimeTradeServer(),today);today.hour=0;today.min=0;today.sec=0;
 long dayStart=((long)StructToTime(today)-((long)TimeTradeServer()-(long)TimeGMT()))*1000;
 for(int j=0;j<ArraySize(commands);j++){string row[];if(StringSplit(commands[j],'|',row)!=19 || (row[2]!="BUY" && row[2]!="SELL"))continue;
 if(row[17]==realSessionId)countSession++;if(StringToInteger(row[9])>=dayStart)countDay++;}
 if(countSession>policyOrdersSession || countDay>policyOrdersDay){ResultEvent(id,"rejected",0,0,0);return;}
 if(tickSize<=0 || remoteRisk<=0 || remoteLoss<=0 || remoteSlip<=0 || MathAbs(sl/tickSize-MathRound(sl/tickSize))>1e-7 || MathAbs(tp/tickSize-MathRound(tp/tickSize))>1e-7 || MathAbs(req.price-sl)<distance || MathAbs(tp-req.price)<distance || MathAbs(req.price-StringToDouble(p[10]))>MathMin(MaxSlippagePoints,remoteSlip) || !OrderCalcProfit(req.type,TradeSymbol,volume,req.price,sl,riskProfit) || riskProfit>=0 || MathAbs(riskProfit)>MathMin(MaxRiskBRL,remoteRisk) || loss24hBRL+MathAbs(riskProfit)>=MathMin(MaxLoss24hBRL,remoteLoss)){ResultEvent(id,"rejected",0,0,0);return;}
 }else if(action=="CLOSE" || action=="SLTP"){
 if(!PositionSelectByTicket(ticket) || PositionGetString(POSITION_SYMBOL)!=TradeSymbol || (ulong)PositionGetInteger(POSITION_MAGIC)!=MagicNumber || volume>PositionGetDouble(POSITION_VOLUME)){ResultEvent(id,"rejected",0,0,0);return;}
 req.position=ticket;
 if(action=="SLTP")req.action=TRADE_ACTION_SLTP;
 else{req.action=TRADE_ACTION_DEAL;req.type=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?ORDER_TYPE_SELL:ORDER_TYPE_BUY;req.price=req.type==ORDER_TYPE_BUY?tick.ask:tick.bid;req.sl=0;req.tp=0;}
 }else if(action=="MODIFY" || action=="CANCEL"){
 if(!OrderSelect(ticket) || OrderGetString(ORDER_SYMBOL)!=TradeSymbol || (ulong)OrderGetInteger(ORDER_MAGIC)!=MagicNumber){ResultEvent(id,"rejected",0,0,0);return;}
 req.order=ticket;req.price=price;req.type_time=(ENUM_ORDER_TYPE_TIME)OrderGetInteger(ORDER_TYPE_TIME);req.expiration=(datetime)OrderGetInteger(ORDER_TIME_EXPIRATION);
 req.action=action=="CANCEL"?TRADE_ACTION_REMOVE:TRADE_ACTION_MODIFY;
 }else{ResultEvent(id,"rejected",0,0,0);return;}
 // OrderCheck success can return 0 (official MQL5 reference), unlike OrderSend.
 bool checked=OrderCheck(req,check);
 if(!QueueEvent("check_"+id,"order-check",id,",\"retcode\":"+(string)check.retcode+",\"ok\":"+B(checked)+",\"margin\":"+N(check.margin)))return;
 if(!checked || (check.retcode!=0 && check.retcode!=TRADE_RETCODE_DONE)){ResultEvent(id,"rejected",check.retcode,0,0);return;}
 if(!QueueEvent("sending_"+id,"sending",id))return;
 bool accepted=OrderSend(req,res);
 QueueEvent("send_"+id,"order-send",id,",\"retcode\":"+(string)res.retcode+",\"retcodeExternal\":"+(string)res.retcode_external+",\"accepted\":"+B(accepted)+",\"order\":"+Q((string)res.order)+",\"deal\":"+Q((string)res.deal));
 bool possible=accepted && (res.retcode==TRADE_RETCODE_DONE || res.retcode==TRADE_RETCODE_DONE_PARTIAL || res.retcode==TRADE_RETCODE_PLACED);
 // TIMEOUT/CONNECTION are unknown, not proof of rejection or execution.
 if(res.retcode==0 || res.retcode==TRADE_RETCODE_TIMEOUT || res.retcode==TRADE_RETCODE_CONNECTION){QueueEvent("unknown_"+id,"unknown",id,",\"retcode\":"+(string)res.retcode);return;}
 ResultEvent(id,possible?"submitted":"rejected",res.retcode,res.order,res.deal);
}
bool HexSession(string v){for(int i=0;i<StringLen(v);i++)if(StringFind("0123456789abcdef",StringSubstr(v,i,1))<0)return false;return true;}
int OnInit(){
 if(StringFind(ApiOrigin,"https://")!=0 || StringLen(BridgeToken)<32 || PollSeconds<1 || HistoryBars<1 || HistoryBars>2000 || MaxTickBatch<1 || MaxTickBatch>1000 || MaxContracts<1 || MagicNumber!=706032601 || _Symbol!=TradeSymbol)return INIT_PARAMETERS_INCORRECT;
 if(!SymbolSelect(TradeSymbol,true))return INIT_FAILED;
 prefix="FocoTrade_"+Hash(BridgeId+"_"+(string)AccountInfoInteger(ACCOUNT_LOGIN))+"_";
 lockHandle=FileOpen(prefix+"lock.bin",FILE_READ|FILE_WRITE|FILE_BIN|FILE_COMMON);if(lockHandle==INVALID_HANDLE){Print("Another Foco Trade EA owns this bridge");return INIT_FAILED;}
 accountHash=Hash((string)AccountInfoInteger(ACCOUNT_LOGIN)+"@"+AccountInfoString(ACCOUNT_SERVER));
 session=StringSubstr(Hash((string)TimeLocal()+"_"+(string)GetMicrosecondCount()),0,32);
 eventSession=session; // Event namespace remains fresh even when disarmed transport resumes.
 string ledger=Load(prefix+"ledger.txt");if(ledger!="")StringSplit(ledger,'\n',commands);
 brokerRefs=Load(prefix+"refs.txt");seenEvents=Load(prefix+"seen.txt");events=Load(prefix+"events.txt");pending=Load(prefix+"pending.txt");
 // Resume only a verified, disarmed transport identity. Do not rewrite pending or commands.
 if(!EnableExecution){
 string savedSession=Load(prefix+"transport_session.txt");
 if(pending!=""){
 if(JsonField(pending,"bridgeId")!=BridgeId || JsonField(pending,"symbol")!=TradeSymbol || JsonField(pending,"accountHash")!=accountHash){Print("PENDING_IDENTITY_MISMATCH: evidence preserved");return INIT_FAILED;}
 string version=JsonField(JsonField(pending,"state"),"protocolVersion");
 if(version!="" && version!="1" && version!="2"){Print("PENDING_PROTOCOL_UNSUPPORTED");return INIT_FAILED;}
 savedSession=JsonField(pending,"session");
 }
 if(savedSession!=""){
 if(StringLen(savedSession)!=32 || !HexSession(savedSession)){Print("PENDING_SESSION_INVALID: evidence preserved");return INIT_FAILED;}
 session=savedSession;
 }
 if(!Save(prefix+"transport_session.txt",session))return INIT_FAILED;
 }
 Print("Foco Trade transport session ",StringSubstr(session,0,12),"; durable pending batch ",pending==""?"none":JsonField(pending,"batch"));
 string cursor=Load(prefix+"cursor.txt"),parts[];if(StringSplit(cursor,'|',parts)==3){lastMsc=StringToInteger(parts[0]);sameMscCount=(int)StringToInteger(parts[1]);batch=StringToInteger(parts[2]);}
 // A persisted response is quarantined on restart, NEVER replayed into OrderSend.
 string interrupted=Load(prefix+"reply.txt");if(interrupted!=""){
 if(!Save(prefix+"reply_quarantine_"+Hash(interrupted)+".txt",interrupted))return INIT_FAILED;
 string lines[];StringSplit(interrupted,'\n',lines);for(int i=0;i<ArraySize(lines);i++)if(StringFind(lines[i],"CMD2|")==0 || StringFind(lines[i],"CMD|")==0){int n=ArraySize(commands);ArrayResize(commands,n+1);commands[n]=lines[i];}
 string durable="";for(int i=0;i<ArraySize(commands);i++)durable+=commands[i]+"\n";
 if(!Save(prefix+"ledger.txt",durable))return INIT_FAILED;FileDelete(prefix+"reply.txt",FILE_COMMON);
 }
 if(pending!="" && JsonField(JsonField(pending,"state"),"protocolVersion")!="2")Print("Legacy pending detected; safe transport upgrade scheduled");
 Print("Foco Trade v2.08; EnableExecution input: ",EnableExecution,"; execution gate: ",GateText());
 // Local terminal log only (never sent anywhere else): the exact value for ExpectedAccountFingerprint in
 // these inputs and TRADE_ACCOUNT_HASH in the backend. SHA-256 of login@server; not the login itself.
 Print("Foco Trade account fingerprint (ExpectedAccountFingerprint / TRADE_ACCOUNT_HASH): ",accountHash,"; ExpectedAccountFingerprint ",ExpectedAccountFingerprint==""?"EMPTY":(ExpectedAccountFingerprint==accountHash?"MATCHES":"MISMATCH"));
 lastGateText=GateText();
 EventSetTimer(PollSeconds);return INIT_SUCCEEDED;
}
void OnDeinit(const int reason){EventKillTimer();if(lockHandle!=INVALID_HANDLE)FileClose(lockHandle);}
void OnTick(){} // CopyTicksRange drains ALL ticks even while synchronous HTTP blocks.
string TakeEvents(string &remaining){
 remaining="";int start=0,count=1;
 while(true){int boundary=StringFind(events,"},{",start);if(boundary<0)return events;
 if(count==200){remaining=StringSubstr(events,boundary+2);return StringSubstr(events,0,boundary+1);}
 start=boundary+2;count++;}
}
void OnTimer(){
 if(!RecoverLegacyPending())return;
 if(pending==""){
 Reconcile();string ticks=TicksJson();string remainingEvents;string batchEvents=TakeEvents(remainingEvents);
 pending="{\"bridgeId\":"+Q(BridgeId)+",\"symbol\":"+Q(TradeSymbol)+",\"session\":"+Q(session)+",\"batch\":"+(string)batch+",\"accountHash\":"+Q(accountHash)+",\"ticks\":"+ticks+",\"candles\":"+CandlesJson()+",\"state\":"+StateJson()+",\"events\":["+batchEvents+"]}";
 if(!Save(prefix+"pending.txt",pending)){Print("Cannot persist outbound batch");ExpertRemove();return;}
 // Persist watermark only once the complete retryable batch exists.
 if(!Save(prefix+"cursor.txt",(string)lastMsc+"|"+(string)sameMscCount+"|"+(string)(batch+1))){ExpertRemove();return;}
 batch++;events=remainingEvents;Save(prefix+"events.txt",events);
 }
 char body[],response[];StringToCharArray(pending,body,0,WHOLE_ARRAY,CP_UTF8);ArrayResize(body,ArraySize(body)-1);string headers;
 ResetLastError();ulong requestStarted=GetTickCount64();
 int status=WebRequest("POST",ApiOrigin+"/api/trade/bridge/exchange","Authorization: Bearer "+BridgeToken+"\r\nContent-Type: application/json\r\nX-Foco-Transport: "+TransportJson()+"\r\n",HttpTimeoutMs,body,response,headers);
 int networkError=GetLastError();lastLatencyMs=(int)(GetTickCount64()-requestStarted);string reply=CharArrayToString(response,0,WHOLE_ARRAY,CP_UTF8);
 if(status<100 || status>599){transportFailures++;consecutiveFailures++;lastNetworkError=networkError;remoteArmed=false;lastTransportStatus=status;lastTransportFailureAt=(long)TimeGMT()*1000;Print("Foco Trade TRANSPORT_FAILURE: no HTTP response (MT5 status ",status,"; network error ",networkError,"; bytes ",ArraySize(response),"). Durable batch ",JsonField(pending,"batch")," kept; retrying the same batch.");lastExchangeHttpStatus=status;return;}
 if(status!=200){transportFailures++;consecutiveFailures++;lastNetworkError=networkError;remoteArmed=false;lastTransportStatus=status;lastTransportFailureAt=(long)TimeGMT()*1000;lastExchangeHttpStatus=status;Print("Foco Trade response shape: ",ResponseShape(reply),"; bytes: ",ArraySize(response),"; content type JSON: ",StringFind(headers,"application/json")>=0);Print("Foco Trade exchange HTTP ",status,": ",BackendErrorCode(reply),status<0?"; network error "+(string)networkError:"","; session ",StringSubstr(JsonField(pending,"session"),0,12),"; batch ",JsonField(pending,"batch"),". Retrying same durable batch.");return;}
 if(StringFind(reply,"OK\n")!=0){consecutiveFailures++;remoteArmed=false;Print("Invalid bridge response; retaining batch");return;}
 if(!Save(prefix+"reply.txt",reply)){Print("Cannot persist response; no order sent");return;}
 string lines[];StringSplit(reply,'\n',lines);bool policyOk=false;
 remoteArmed=false;
 for(int i=0;i<ArraySize(lines);i++)if(StringFind(lines[i],"POLICY2|")==0)policyOk=ReceivePolicy(lines[i]);
 // First recovery ACK never executes a command. Server must receive healthy telemetry and reconcile.
 bool recovered=consecutiveFailures>0;
 if(recovered){lastRecoveryAt=(long)TimeGMT()*1000;consecutiveFailures=0;remoteArmed=false;}
 for(int i=0;i<ArraySize(lines);i++)if(StringFind(lines[i],"CMD2|")==0){
 if(policyOk && !recovered)Execute(lines[i]);else{
 if(!Save(prefix+"reply_quarantine_"+Hash(reply)+".txt",reply)){ExpertRemove();return;}
 string skipped[];StringSplit(lines[i],'|',skipped);
 if(ArraySize(skipped)>1)QueueEvent("quarantine_"+skipped[1],"unknown",skipped[1],",\"reason\":\"POLICY_OR_TRANSPORT_RECOVERY\"");
 Print("Command quarantined: policy unavailable or transport recovery; no order sent");}}

 string gate=GateText();
 if(lastExchangeHttpStatus!=200 || gate!=lastGateText)Print("Foco Trade exchange HTTP 200 OK; execution gate: ",gate);
 lastGateText=gate;
 lastExchangeHttpStatus=200;lastExchangeAckAt=(long)TimeGMT()*1000;
 FileDelete(prefix+"reply.txt",FILE_COMMON);pending="";FileDelete(prefix+"pending.txt",FILE_COMMON);
 Comment("Foco Trade\n",TradeSymbol," / XP-MT5\nHTTP 200\nExecution gate: ",lastGateText,"\nLast tick ms: ",lastMsc);
}
void OnTradeTransaction(const MqlTradeTransaction &trans,const MqlTradeRequest &request,const MqlTradeResult &result){
 // No network in callback. Durable event + next-heartbeat history reconciliation.
 if(trans.symbol!=TradeSymbol && request.symbol!=TradeSymbol)return;
 string id=CommandIdFor(request.comment);
 QueueEvent("tx_"+eventSession+"_"+(string)(eventSequence++),"transaction",id,",\"type\":"+(string)trans.type+",\"order\":"+Q((string)trans.order)+",\"deal\":"+Q((string)trans.deal)+",\"position\":"+Q((string)trans.position)+",\"price\":"+N(trans.price)+",\"volume\":"+N(trans.volume)+",\"orderState\":"+(string)trans.order_state+",\"retcode\":"+(string)result.retcode);
}
