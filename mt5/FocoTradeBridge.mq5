#property strict
#property version "1.00"
#property description "Foco Trade XP/MT5 bridge. Execution disabled by default."
input string ApiOrigin="https://focoemcanto.com";
input string BridgeToken="";
input string BridgeId="xp-mt5-primary";
input string TradeSymbol="WINV26";
input bool EnableExecution=false;
input int MaxContracts=1;
input ulong MagicNumber=706032601;
input int PollSeconds=2;
input int HistoryBars=1500;
input int TickRecoverySeconds=300;
input int MaxTickBatch=1000;
input int HttpTimeoutMs=5000;
input int MaxDeviationPoints=10;
// One bridge instance per terminal AND FILE_COMMON namespace. Never delete ledger.
int lockHandle=INVALID_HANDLE;
string prefix,session,accountHash,pending="",events="";
long batch=0,lastMsc=0;
datetime lastBar=0;
int sameMscCount=0;
string commands[];
string seenEvents="";
string brokerRefs="";
ulong eventSequence=0;
string Q(string s) { StringReplace(s,"\\","\\\\"); StringReplace(s,"\"","\\\""); StringReplace(s,"\r","\\r"); StringReplace(s,"\n","\\n"); return "\""+s+"\""; }
string N(double n) { return DoubleToString(n,8); }
string B(bool b) { return b?"true":"false"; }
string Hash(string s) { uchar data[],key[],out[]; int n=StringToCharArray(s,data,0,WHOLE_ARRAY,CP_UTF8); ArrayResize(data,n-1); if(CryptEncode(CRYPT_HASH_SHA256,data,key,out)<=0)return ""; string h=""; for(int i=0;i<ArraySize(out);i++)h+=StringFormat("%02x",out[i]); return h; }
bool Save(string filename,string body) { int f=FileOpen(filename+".tmp",FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON,0,CP_UTF8); if(f==INVALID_HANDLE)return false; uint n=FileWriteString(f,body); FileFlush(f); FileClose(f); if(n==0 && body!="")return false; return FileMove(filename+".tmp",FILE_COMMON,filename,FILE_COMMON|FILE_REWRITE); }
string Load(string filename) { int f=FileOpen(filename,FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON,0,CP_UTF8); if(f==INVALID_HANDLE)return ""; string s=""; while(!FileIsEnding(f)){string line=FileReadString(f); s+=line; if(!FileIsEnding(f))s+="\n";} FileClose(f); return s; }
string Tag(string id) { StringReplace(id,"-",""); return "FT"+StringSubstr(id,0,24); }
string CommandIdFor(string tag) { for(int i=0;i<ArraySize(commands);i++){string p[]; if(StringSplit(commands[i],'|',p)==10 && Tag(p[1])==tag)return p[1];}return ""; }
void QueueEvent(string id,string kind,string commandId,string fields="") {
 if(StringFind(seenEvents,"|"+id+"|")>=0)return;
 string e="{\"id\":"+Q(id)+",\"kind\":"+Q(kind)+",\"commandId\":"+Q(commandId)+fields+"}";
 if(events!="")events+=","; events+=e;
 if(!Save(prefix+"events.txt",events)){ Print("Event journal unavailable: execution disabled"); ExpertRemove(); return; }
 seenEvents+="|"+id+"|"; Save(prefix+"seen.txt",seenEvents);
}
void ResultEvent(string id,string kind,uint retcode,ulong order,ulong deal) {
 if(order>0){brokerRefs+="|"+(string)order+"="+id+"|";if(!Save(prefix+"refs.txt",brokerRefs)){ExpertRemove();return;}}
 QueueEvent("result_"+id+"_"+kind,kind,id,",\"retcode\":"+(string)retcode+",\"order\":"+Q((string)order)+",\"deal\":"+Q((string)deal));
}
string PositionsJson() {
 string j="["; bool first=true;
 for(int i=0;i<PositionsTotal();i++){ulong t=PositionGetTicket(i); if(t==0)continue;
 if(!first)j+=","; first=false;
 j+="{\"ticket\":"+Q((string)t)+",\"symbol\":"+Q(PositionGetString(POSITION_SYMBOL))+",\"magic\":"+Q((string)PositionGetInteger(POSITION_MAGIC))+",\"type\":"+(string)PositionGetInteger(POSITION_TYPE)+",\"volume\":"+N(PositionGetDouble(POSITION_VOLUME))+",\"price\":"+N(PositionGetDouble(POSITION_PRICE_OPEN))+",\"sl\":"+N(PositionGetDouble(POSITION_SL))+",\"tp\":"+N(PositionGetDouble(POSITION_TP))+"}";
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
string StateJson(){return "{\"connected\":"+B((bool)TerminalInfoInteger(TERMINAL_CONNECTED))+",\"executionAllowed\":"+B(ExecutionAllowed())+",\"tickSize\":"+N(SymbolInfoDouble(TradeSymbol,SYMBOL_TRADE_TICK_SIZE))+",\"volumeMin\":"+N(SymbolInfoDouble(TradeSymbol,SYMBOL_VOLUME_MIN))+",\"volumeStep\":"+N(SymbolInfoDouble(TradeSymbol,SYMBOL_VOLUME_STEP))+",\"marginMode\":"+(string)AccountInfoInteger(ACCOUNT_MARGIN_MODE)+",\"balance\":"+N(AccountInfoDouble(ACCOUNT_BALANCE))+",\"equity\":"+N(AccountInfoDouble(ACCOUNT_EQUITY))+",\"freeMargin\":"+N(AccountInfoDouble(ACCOUNT_MARGIN_FREE))+",\"positions\":"+PositionsJson()+",\"orders\":"+OrdersJson()+"}";}
string CandlesJson(){MqlRates rates[];int count;datetime closed=iTime(TradeSymbol,PERIOD_M1,1);
 if(lastBar==0)count=CopyRates(TradeSymbol,PERIOD_M1,1,HistoryBars,rates);else count=CopyRates(TradeSymbol,PERIOD_M1,lastBar,closed,rates);
 if(count>0)lastBar=rates[count-1].time;string j="[";
 for(int i=0;i<count;i++){if(i>0)j+=",";j+="{\"symbol\":"+Q(TradeSymbol)+",\"timestamp\":"+(string)(long)rates[i].time+",\"timeframe\":\"1m\",\"open\":"+N(rates[i].open)+",\"high\":"+N(rates[i].high)+",\"low\":"+N(rates[i].low)+",\"close\":"+N(rates[i].close)+",\"volume\":"+N((double)rates[i].real_volume)+"}";}return j+"]";}
string TicksJson(){MqlTick ticks[];MqlTick latest;if(!SymbolInfoTick(TradeSymbol,latest))return "[]";
 if(lastMsc==0)lastMsc=MathMax(0,latest.time_msc-(long)TickRecoverySeconds*1000);
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
 for(int i=0;i<HistoryDealsTotal();i++){ulong ticket=HistoryDealGetTicket(i); if((ulong)HistoryDealGetInteger(ticket,DEAL_MAGIC)!=MagicNumber || HistoryDealGetString(ticket,DEAL_SYMBOL)!=TradeSymbol)continue;
 string id=CommandIdFor(HistoryDealGetString(ticket,DEAL_COMMENT));
 if(id==""){string marker="|"+(string)HistoryDealGetInteger(ticket,DEAL_ORDER)+"=";int pos=StringFind(brokerRefs,marker);if(pos>=0)id=StringSubstr(brokerRefs,pos+StringLen(marker),36);}
 if(id=="")continue;
 // Broker deal IDs deduplicate reconciliation and transaction callbacks in Postgres.
 QueueEvent("deal_"+(string)ticket,"observed",id,",\"deal\":"+Q((string)ticket)+",\"order\":"+Q((string)HistoryDealGetInteger(ticket,DEAL_ORDER))+",\"price\":"+N(HistoryDealGetDouble(ticket,DEAL_PRICE))+",\"volume\":"+N(HistoryDealGetDouble(ticket,DEAL_VOLUME))+",\"profit\":"+N(HistoryDealGetDouble(ticket,DEAL_PROFIT))+",\"commission\":"+N(HistoryDealGetDouble(ticket,DEAL_COMMISSION))+",\"timeMsc\":"+(string)HistoryDealGetInteger(ticket,DEAL_TIME_MSC));
 // Limit transport event size; next heartbeat resumes through durable broker history.
 if(StringLen(events)>50000)break;
 }
 for(int i=0;i<ArraySize(commands);i++){string p[];if(StringSplit(commands[i],'|',p)!=10)continue;ulong ticket=(ulong)StringToInteger(p[8]);bool confirmed=false;
 if(p[2]=="SLTP" && PositionSelectByTicket(ticket)) confirmed=MathAbs(PositionGetDouble(POSITION_SL)-StringToDouble(p[5]))<0.001 && MathAbs(PositionGetDouble(POSITION_TP)-StringToDouble(p[6]))<0.001;
 if(p[2]=="MODIFY" && OrderSelect(ticket))confirmed=MathAbs(OrderGetDouble(ORDER_PRICE_OPEN)-StringToDouble(p[7]))<0.001 && MathAbs(OrderGetDouble(ORDER_SL)-StringToDouble(p[5]))<0.001 && MathAbs(OrderGetDouble(ORDER_TP)-StringToDouble(p[6]))<0.001;
 if(p[2]=="CANCEL" && HistoryOrderSelect(ticket))confirmed=HistoryOrderGetInteger(ticket,ORDER_STATE)==ORDER_STATE_CANCELED;
 if(confirmed)QueueEvent("confirm_"+p[1],"observed",p[1],",\"ticket\":"+Q((string)ticket));
 }
}
void Execute(string line){
 string p[];if(StringSplit(line,'|',p)!=10 || p[0]!="CMD")return;
 string id=p[1],action=p[2]; for(int i=0;i<ArraySize(commands);i++)if(StringFind(commands[i],"CMD|"+id+"|")==0)return;
 // Durable intent BEFORE OrderSend. Never replay intent after restart.
 int n=ArraySize(commands);ArrayResize(commands,n+1);commands[n]=line;
 string ledger="";for(int i=0;i<ArraySize(commands);i++)ledger+=commands[i]+"\n";
 if(!Save(prefix+"ledger.txt",ledger)){Print("Cannot persist command intent; no order sent");ExpertRemove();return;}
 if(!ExecutionAllowed() || p[3]!=TradeSymbol || StringToInteger(p[9])<(long)TimeGMT()*1000 || StringToInteger(p[9])>(long)TimeGMT()*1000+32000){ResultEvent(id,"rejected",0,0,0);return;}
 double volume=StringToDouble(p[4]),sl=StringToDouble(p[5]),tp=StringToDouble(p[6]),price=StringToDouble(p[7]);ulong ticket=(ulong)StringToInteger(p[8]);
 MqlTick tick;if(!SymbolInfoTick(TradeSymbol,tick) || (long)TimeGMT()*1000-tick.time_msc>15000){ResultEvent(id,"rejected",0,0,0);return;}
 if(volume<0 || volume>MaxContracts || (action=="BUY" || action=="SELL" || action=="CLOSE") && (volume<1 || MathFloor(volume)!=volume)){ResultEvent(id,"rejected",0,0,0);return;}
 MqlTradeRequest req={};MqlTradeResult res={};MqlTradeCheckResult check={};
 req.magic=MagicNumber;req.symbol=TradeSymbol;req.comment=Tag(id);req.volume=volume;req.sl=sl;req.tp=tp;req.deviation=MaxDeviationPoints;
 long filling=SymbolInfoInteger(TradeSymbol,SYMBOL_FILLING_MODE);req.type_filling=(filling&SYMBOL_FILLING_FOK)!=0?ORDER_FILLING_FOK:ORDER_FILLING_IOC;
 if(action=="BUY" || action=="SELL"){
 double exposure=0;
 for(int i=0;i<PositionsTotal();i++){if(PositionGetTicket(i)>0 && PositionGetString(POSITION_SYMBOL)==TradeSymbol){exposure+=PositionGetDouble(POSITION_VOLUME);if((ulong)PositionGetInteger(POSITION_MAGIC)!=MagicNumber){ResultEvent(id,"rejected",0,0,0);return;}}}
 for(int i=0;i<OrdersTotal();i++){if(OrderGetTicket(i)>0 && OrderGetString(ORDER_SYMBOL)==TradeSymbol)exposure+=OrderGetDouble(ORDER_VOLUME_CURRENT);}
 if(exposure+volume>MaxContracts || sl<=0 || tp<=0){ResultEvent(id,"rejected",0,0,0);return;}
 req.action=TRADE_ACTION_DEAL;req.type=action=="BUY"?ORDER_TYPE_BUY:ORDER_TYPE_SELL;req.price=action=="BUY"?tick.ask:tick.bid;
 if(action=="BUY" && (sl>=req.price || tp<=req.price) || action=="SELL" && (sl<=req.price || tp>=req.price)){ResultEvent(id,"rejected",0,0,0);return;}
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
 if(!OrderCheck(req,check)){ResultEvent(id,"rejected",check.retcode,0,0);return;}
 bool accepted=OrderSend(req,res);
 bool possible=accepted && (res.retcode==TRADE_RETCODE_DONE || res.retcode==TRADE_RETCODE_DONE_PARTIAL || res.retcode==TRADE_RETCODE_PLACED);
 // TIMEOUT/CONNECTION are unknown, not proof of rejection or execution.
 if(res.retcode==TRADE_RETCODE_TIMEOUT || res.retcode==TRADE_RETCODE_CONNECTION){QueueEvent("unknown_"+id,"unknown",id,",\"retcode\":"+(string)res.retcode);return;}
 ResultEvent(id,possible?"submitted":"rejected",res.retcode,res.order,res.deal);
}
int OnInit(){
 if(StringFind(ApiOrigin,"https://")!=0 || StringLen(BridgeToken)<32 || PollSeconds<1 || HistoryBars<1 || HistoryBars>2000 || MaxTickBatch<1 || MaxTickBatch>1000 || MaxContracts<1 || _Symbol!=TradeSymbol)return INIT_PARAMETERS_INCORRECT;
 if(!SymbolSelect(TradeSymbol,true))return INIT_FAILED;
 prefix="FocoTrade_"+Hash(BridgeId+"_"+(string)AccountInfoInteger(ACCOUNT_LOGIN))+"_";
 lockHandle=FileOpen(prefix+"lock.bin",FILE_READ|FILE_WRITE|FILE_BIN|FILE_COMMON);if(lockHandle==INVALID_HANDLE){Print("Another Foco Trade EA owns this bridge");return INIT_FAILED;}
 accountHash=Hash((string)AccountInfoInteger(ACCOUNT_LOGIN)+"@"+AccountInfoString(ACCOUNT_SERVER));
 session=StringSubstr(Hash((string)TimeLocal()+"_"+(string)GetMicrosecondCount()),0,32);
 string ledger=Load(prefix+"ledger.txt");if(ledger!="")StringSplit(ledger,'\n',commands);
 brokerRefs=Load(prefix+"refs.txt");seenEvents=Load(prefix+"seen.txt");events=Load(prefix+"events.txt");pending=Load(prefix+"pending.txt");
 string cursor=Load(prefix+"cursor.txt"),parts[];if(StringSplit(cursor,'|',parts)==3){lastMsc=StringToInteger(parts[0]);sameMscCount=(int)StringToInteger(parts[1]);batch=StringToInteger(parts[2]);}
 Print("Foco Trade account fingerprint: ",accountHash,"; execution enabled: ",EnableExecution);
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
 if(pending==""){
 Reconcile();string ticks=TicksJson();string remainingEvents;string batchEvents=TakeEvents(remainingEvents);
 pending="{\"bridgeId\":"+Q(BridgeId)+",\"symbol\":"+Q(TradeSymbol)+",\"session\":"+Q(session)+",\"batch\":"+(string)batch+",\"accountHash\":"+Q(accountHash)+",\"ticks\":"+ticks+",\"candles\":"+CandlesJson()+",\"state\":"+StateJson()+",\"events\":["+batchEvents+"]}";
 if(!Save(prefix+"pending.txt",pending)){Print("Cannot persist outbound batch");ExpertRemove();return;}
 // Persist watermark only once the complete retryable batch exists.
 if(!Save(prefix+"cursor.txt",(string)lastMsc+"|"+(string)sameMscCount+"|"+(string)(batch+1))){ExpertRemove();return;}
 batch++;events=remainingEvents;Save(prefix+"events.txt",events);
 }
 char body[],response[];StringToCharArray(pending,body,0,WHOLE_ARRAY,CP_UTF8);ArrayResize(body,ArraySize(body)-1);string headers;
 int status=WebRequest("POST",ApiOrigin+"/api/trade/bridge/exchange","Authorization: Bearer "+BridgeToken+"\r\nContent-Type: application/json\r\n",HttpTimeoutMs,body,response,headers);
 if(status!=200){Print("Foco Trade exchange HTTP ",status,"; error ",GetLastError(),". Retrying same durable batch.");return;}
 string reply=CharArrayToString(response,0,WHOLE_ARRAY,CP_UTF8);
 if(StringFind(reply,"OK\n")!=0){Print("Invalid bridge response; retaining batch");return;}
 pending="";FileDelete(prefix+"pending.txt",FILE_COMMON);
 string lines[];StringSplit(reply,'\n',lines);for(int i=0;i<ArraySize(lines);i++)if(StringFind(lines[i],"CMD|")==0)Execute(lines[i]);
 Comment("Foco Trade\n",TradeSymbol," / XP-MT5\nHTTP 200\nExecution gate: ",EnableExecution?"ARMED":"LOCKED","\nLast tick ms: ",lastMsc);
}
void OnTradeTransaction(const MqlTradeTransaction &trans,const MqlTradeRequest &request,const MqlTradeResult &result){
 // No network in callback. Durable event + next-heartbeat history reconciliation.
 if(trans.symbol!=TradeSymbol && request.symbol!=TradeSymbol)return;
 string id=CommandIdFor(request.comment);
 QueueEvent("tx_"+session+"_"+(string)(eventSequence++),"transaction",id,",\"type\":"+(string)trans.type+",\"order\":"+Q((string)trans.order)+",\"deal\":"+Q((string)trans.deal)+",\"position\":"+Q((string)trans.position)+",\"price\":"+N(trans.price)+",\"volume\":"+N(trans.volume)+",\"retcode\":"+(string)result.retcode);
}
