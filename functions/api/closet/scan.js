const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

const itemSchema={
 type:'object',additionalProperties:false,
 required:['name','category','color','subcategory','pattern','style','brand','label_text','confidence','visibility','reconstructable','box'],
 properties:{
  name:{type:'string'},category:{type:'string',enum:['Blusas','Calças','Vestidos','Calçados','Bolsas','Acessórios']},color:{type:'string'},subcategory:{type:'string'},pattern:{type:'string'},style:{type:'string'},brand:{type:'string'},label_text:{type:'string'},confidence:{type:'number'},visibility:{type:'number'},reconstructable:{type:'boolean'},
  box:{type:'object',additionalProperties:false,required:['x','y','width','height'],properties:{x:{type:'number'},y:{type:'number'},width:{type:'number'},height:{type:'number'}}}
 }
}
const scanSchema={type:'object',additionalProperties:false,required:['valid','reason','items'],properties:{valid:{type:'boolean'},reason:{type:'string'},items:{type:'array',maxItems:10,items:itemSchema}}}
const refineSchema={type:'object',additionalProperties:false,required:['present','name','color','subcategory','pattern','style','brand','label_text','confidence','visibility','reconstructable'],properties:{present:{type:'boolean'},name:{type:'string'},color:{type:'string'},subcategory:{type:'string'},pattern:{type:'string'},style:{type:'string'},brand:{type:'string'},label_text:{type:'string'},confidence:{type:'number'},visibility:{type:'number'},reconstructable:{type:'boolean'}}}

function outputText(data){return data.output_text||data.output?.flatMap(i=>i.content||[]).find(i=>i.type==='output_text')?.text||''}
async function askVision(env,payload){
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload)})
 const data=await response.json();if(!response.ok)throw new Error(data?.error?.message||'Falha na análise visual.');const text=outputText(data);if(!text)throw new Error('A análise visual não retornou dados.');return {parsed:JSON.parse(text),model:data.model}
}

function normalizedText(item){return `${item?.name||''} ${item?.subcategory||''}`.toLowerCase()}
function isSmallWearable(item){return /rel[oó]gio|pulseira|bracelet|[oó]culos|cinto|gravata|colar|brinco|anel|len[cç]o|cachecol/.test(normalizedText(item))}
function keepItem(item){
 if(!item||item.confidence<.66||item.reconstructable!==true)return false
 const visibility=Number(item.visibility||0),confidence=Number(item.confidence||0)
 if(item.category==='Bolsas')return visibility>=.70
 if(item.category==='Calçados')return visibility>=.42&&confidence>=.68
 if(item.category==='Acessórios'){
  if(isSmallWearable(item))return visibility>=.38&&confidence>=.70
  return visibility>=.56&&confidence>=.72
 }
 return visibility>=.50
}

export async function onRequestPost({request,env}){
 try{
  if(!env.OPENAI_API_KEY)return json({ok:false,message:'Scanner ainda não configurado.'},503)
  const body=await request.json(),image=String(body?.image||'')
  if(!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image))return json({ok:false,message:'Imagem inválida.'},400)
  if(image.length>8_000_000)return json({ok:false,message:'Imagem muito grande. Tente novamente.'},413)
  const model=env.CLOSET_VISION_MODEL||'gpt-5.6-luna'

  const first=await askVision(env,{model,instructions:`Você é o scanner visual de um guarda-roupa virtual. Sua tarefa é detectar APENAS peças que EXISTEM VISUALMENTE na fotografia, sem completar mentalmente o look.

SUJEITO PRINCIPAL: se houver mais de uma pessoa, trabalhe SOMENTE com a pessoa principal — normalmente a maior, mais central, em primeiro plano e em foco. Ignore totalmente roupas e acessórios de pessoas secundárias.

REGRA ABSOLUTA ANTI-ALUCINAÇÃO: nunca crie uma peça porque ela seria provável, poderia estar escondida ou combinaria com o look. Se não há pixels concretos visíveis do item, NÃO retorne.

NÃO PARE NAS PEÇAS GRANDES. Faça uma inspeção corporal COMPLETA e deliberada antes de responder. Percorra obrigatoriamente, nesta ordem:
1. CABEÇA/ROSTO: óculos, chapéu/boné e acessórios realmente visíveis.
2. PESCOÇO: gravata, lenço, cachecol, colar.
3. TRONCO: camisa, camiseta, blusa, suéter, jaqueta, vestido e camadas realmente visíveis.
4. PULSO ESQUERDO E DIREITO: relógio e pulseiras. Itens pequenos podem ocupar poucos pixels; ainda assim devem ser retornados quando sua existência e tipo estiverem claros.
5. CINTURA/QUADRIL: cinto e peças independentes.
6. PERNAS: calça, saia ou short.
7. PÉS: procure explicitamente os DOIS pés e os calçados. Se pelo menos um calçado estiver bem visível e o par for claramente o mesmo, retorne Calçados. Calçados são essenciais para montar o look e não devem ser esquecidos apenas por ficarem na borda inferior da foto.
8. BOLSAS: somente quando o corpo principal da bolsa estiver suficientemente exposto; alças isoladas não bastam.

SEPARAÇÃO DE ITENS: cada elemento independente vira uma peça separada. Gravata, cinto, óculos, relógio, pulseira, joias, lenço, suspensório etc. são Acessórios e NÃO fazem parte da camisa/calça. Camisa + cinto + relógio + óculos + calça + tênis devem resultar em seis itens se todos estiverem realmente visíveis e reconstruíveis.

VISIBILIDADE PARA ITENS PEQUENOS: não aplique o mesmo critério visual de uma camisa a um relógio ou pulseira. Para acessórios pequenos, visibility representa quanto do PRÓPRIO acessório está observável, não quanto da imagem ele ocupa. Um relógio totalmente visível no pulso pode ter visibility alta mesmo sendo pequeno na fotografia.

CALÇADOS: dê atenção especial à parte inferior. Tênis/sapatos claramente visíveis devem ser detectados mesmo quando distantes do rosto ou menores que as roupas. Use caixa que cubra o par, ou o calçado principal visível se o outro estiver parcialmente oculto.

IGNORE SEMPRE: corpo/pessoa, celular, capacete de moto, cenário, móveis e objetos domésticos. Mochila/bolsa quase toda escondida deve ser descartada.

Para cada item estime visibility 0..1 e reconstructable. Dê caixa apertada 0..1000 cobrindo pixels do item. Diferencie nuances de cor. Marca/etiqueta só se realmente legível. Nunca invente texto. Antes de concluir, faça uma checagem final perguntando internamente: 'esqueci calçado, cinto, óculos, relógio ou pulseira visível?'`,input:[{role:'user',content:[{type:'input_text',text:'Faça a varredura completa da PESSOA PRINCIPAL. Não encerre após camisa e calça. Confirme explicitamente rosto, pescoço, ambos os pulsos, cintura e pés. Retorne cada item independente que realmente existe, incluindo tênis, relógio, pulseira, óculos e cinto quando visíveis.'},{type:'input_image',image_url:image,detail:'high'}]}],text:{format:{type:'json_schema',name:'closet_multi_scan',strict:true,schema:scanSchema}}})

  let candidates=Array.isArray(first.parsed.items)?first.parsed.items.filter(keepItem):[]
  candidates=candidates.sort((a,b)=>{
   const text=normalizedText(a),textB=normalizedText(b)
   const priority=x=>{
    const t=normalizedText(x)
    if(x.category==='Calçados')return 4
    if(['Blusas','Calças','Vestidos'].includes(x.category))return 3
    if(x.category==='Acessórios'&&/rel[oó]gio|pulseira|[oó]culos|cinto|gravata/.test(t))return 2
    return 1
   }
   return priority(b)-priority(a)||(b.visibility||0)-(a.visibility||0)||(b.confidence||0)-(a.confidence||0)
  }).slice(0,8)
  if(!candidates.length)return json({ok:true,scan:{valid:false,reason:first.parsed.reason||'Não encontrei peças suficientemente visíveis para cadastrar.',items:[]},model:first.model})

  const refined=[]
  for(let idx=0;idx<candidates.length;idx++){
   const item=candidates[idx],b=item.box
   try{
    const second=await askVision(env,{model,instructions:`Você é o verificador final de UMA peça candidata de um closet virtual. Confirme se ela realmente está PRESENTE, VISÍVEL e pertence à PESSOA PRINCIPAL. present=false se pertence a pessoa ao fundo, foi inferida, está escondida ou não há pixels suficientes.

Para acessórios pequenos e calçados, NÃO reprove apenas porque ocupam pequena área da fotografia. Avalie quanto do PRÓPRIO objeto está visível. Um relógio, pulseira, óculos ou cinto claramente reconhecível pode ser reconstruível mesmo sendo pequeno. Um tênis claramente visível no pé deve ser mantido.

Itens independentes permanecem separados: gravata, cinto, relógio, pulseira, óculos, colar, lenço e outros acessórios não fazem parte da roupa de fundo. Não valide duplicações do mesmo objeto.

Se present=true, refine cor, subtipo/modelagem, padrão, estilo e marca/etiqueta quando realmente legível. reconstructable=true apenas se puder gerar versão de catálogo sem inventar características principais.`,input:[{role:'user',content:[{type:'input_text',text:`Candidata ${idx+1}: ${JSON.stringify({name:item.name,category:item.category,color:item.color,subcategory:item.subcategory,box:b})}. Confirme a existência na pessoa principal. Dê atenção especial se for calçado, relógio, pulseira, óculos ou cinto: tamanho pequeno na foto não é motivo para descartar.`},{type:'input_image',image_url:image,detail:'high'}]}],text:{format:{type:'json_schema',name:'closet_item_refine',strict:true,schema:refineSchema}}})
    const checked={...item,...second.parsed,box:item.box,category:item.category}
    if(checked.present===true&&keepItem(checked))refined.push(checked)
   }catch{if(keepItem(item))refined.push(item)}
  }

  const unique=[]
  for(const item of refined){
   const duplicate=unique.some(x=>x.category===item.category&&Math.abs(x.box.x-item.box.x)<55&&Math.abs(x.box.y-item.box.y)<55&&Math.abs(x.box.width-item.box.width)<80&&Math.abs(x.box.height-item.box.height)<80&&normalizedText(x)===normalizedText(item))
   if(!duplicate)unique.push(item)
  }
  return json({ok:true,scan:{valid:unique.length>0,reason:unique.length?'':'As candidatas não passaram pela confirmação visual.',items:unique},model:first.model,precision_passes:2})
 }catch(error){return json({ok:false,message:error?.message||'Falha ao analisar a foto.'},500)}
}
