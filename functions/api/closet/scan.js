const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

const itemSchema={
 type:'object',additionalProperties:false,
 required:['name','category','color','subcategory','pattern','style','brand','label_text','confidence','visibility','reconstructable','box'],
 properties:{
  name:{type:'string'},category:{type:'string',enum:['Blusas','Calças','Vestidos','Calçados','Bolsas','Acessórios']},color:{type:'string'},subcategory:{type:'string'},pattern:{type:'string'},style:{type:'string'},brand:{type:'string'},label_text:{type:'string'},confidence:{type:'number'},visibility:{type:'number'},reconstructable:{type:'boolean'},
  box:{type:'object',additionalProperties:false,required:['x','y','width','height'],properties:{x:{type:'number'},y:{type:'number'},width:{type:'number'},height:{type:'number'}}}
 }
}
const scanSchema={type:'object',additionalProperties:false,required:['valid','reason','items'],properties:{valid:{type:'boolean'},reason:{type:'string'},items:{type:'array',maxItems:8,items:itemSchema}}}
const refineSchema={type:'object',additionalProperties:false,required:['present','name','color','subcategory','pattern','style','brand','label_text','confidence','visibility','reconstructable'],properties:{present:{type:'boolean'},name:{type:'string'},color:{type:'string'},subcategory:{type:'string'},pattern:{type:'string'},style:{type:'string'},brand:{type:'string'},label_text:{type:'string'},confidence:{type:'number'},visibility:{type:'number'},reconstructable:{type:'boolean'}}}

function outputText(data){return data.output_text||data.output?.flatMap(i=>i.content||[]).find(i=>i.type==='output_text')?.text||''}
async function askVision(env,payload){
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload)})
 const data=await response.json();if(!response.ok)throw new Error(data?.error?.message||'Falha na análise visual.');const text=outputText(data);if(!text)throw new Error('A análise visual não retornou dados.');return {parsed:JSON.parse(text),model:data.model}
}

function keepItem(item){
 if(!item||item.confidence<.68||item.reconstructable!==true)return false
 const visibility=Number(item.visibility||0)
 if(item.category==='Bolsas')return visibility>=.70
 if(item.category==='Acessórios')return visibility>=.62&&item.confidence>=.74
 return visibility>=.52
}

export async function onRequestPost({request,env}){
 try{
  if(!env.OPENAI_API_KEY)return json({ok:false,message:'Scanner ainda não configurado.'},503)
  const body=await request.json(),image=String(body?.image||'')
  if(!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image))return json({ok:false,message:'Imagem inválida.'},400)
  if(image.length>8_000_000)return json({ok:false,message:'Imagem muito grande. Tente novamente.'},413)
  const model=env.CLOSET_VISION_MODEL||'gpt-5.6-luna'

  const first=await askVision(env,{model,instructions:`Você é o scanner visual de um guarda-roupa virtual. Sua tarefa é detectar APENAS peças que EXISTEM VISUALMENTE na fotografia, não completar mentalmente um look.

SUJEITO PRINCIPAL: se houver mais de uma pessoa, trabalhe SOMENTE com a pessoa principal da foto — normalmente a pessoa em primeiro plano, maior, mais central e em foco. Ignore completamente roupas e acessórios de pessoas secundárias ao fundo. Não misture peças de indivíduos diferentes no mesmo closet.

REGRA ABSOLUTA ANTI-ALUCINAÇÃO: nunca crie uma peça porque ela seria provável, porque poderia estar por baixo de outra roupa ou porque combina com o look. Uma camiseta escondida sob um suéter NÃO existe para este cadastro. Se você não consegue apontar pixels visíveis pertencentes à peça, NÃO retorne o item.

SEPARAÇÃO DE CAMADAS E ACESSÓRIOS: cada item independente deve virar uma peça separada, mesmo quando está sobre outra roupa. Gravata, gravata-borboleta, lenço, cachecol, cinto, suspensório, óculos, relógio, joias e boné são Acessórios e NÃO fazem parte da camisa/blusa/calça. Uma camisa com gravata deve produzir pelo menos dois itens: a camisa sem considerar a gravata como parte dela + a gravata como item Acessórios. O mesmo vale para jaqueta sobre camisa quando as duas camadas estiverem realmente visíveis e reconstruíveis. Não duplique o mesmo acessório em formatos diferentes.

FAÇA UMA VARREDURA SISTEMÁTICA da pessoa principal: cabeça/rosto (óculos e acessórios), pescoço (gravata, lenço, colar), tronco (camadas realmente visíveis), pulsos/mãos (relógio, pulseira), cintura/quadril (cinto), pernas (calça/saia/short), pés (calçados somente se aparecem). Detecte parte de cima e parte de baixo separadamente quando ambas estiverem visíveis. Uma calça pode ser aceita mesmo com a barra fora do quadro se cintura, quadril, duas pernas e modelagem estiverem suficientemente visíveis para reconstrução fiel.

INCLUA: roupas realmente visíveis, calçados suficientemente visíveis, bolsas suficientemente expostas e acessórios de moda claramente identificáveis.
IGNORE SEMPRE: corpo/pessoa, celular, capacete de moto, cenário, móveis e objetos domésticos. Mochila/bolsa quase toda escondida, aparecendo só alças ou pequeno fragmento, deve ser descartada.

Para cada item estime visibility 0..1 e reconstructable. Dê caixa apertada 0..1000 cobrindo apenas pixels da peça. Para acessórios sobre roupas, a caixa pode sobrepor a caixa da roupa, mas o item deve ser semanticamente separado. Diferencie nuances de cor. Marca/etiqueta só se realmente legível. Nunca invente texto.`,input:[{role:'user',content:[{type:'input_text',text:'Detecte somente peças fisicamente visíveis da PESSOA PRINCIPAL. Separe itens independentes: por exemplo, camisa branca e gravata verde são duas peças diferentes; a gravata deve ser Acessórios e não pode ser incorporada à camisa. Antes de retornar cada item, confirme que há pixels concretos dele na imagem.'},{type:'input_image',image_url:image,detail:'high'}]}],text:{format:{type:'json_schema',name:'closet_multi_scan',strict:true,schema:scanSchema}}})

  let candidates=Array.isArray(first.parsed.items)?first.parsed.items.filter(keepItem):[]
  candidates=candidates.sort((a,b)=>{
   const priority=x=>['Blusas','Calças','Vestidos','Calçados'].includes(x.category)?2:1
   return priority(b)-priority(a)||(b.visibility||0)-(a.visibility||0)||(b.confidence||0)-(a.confidence||0)
  }).slice(0,6)
  if(!candidates.length)return json({ok:true,scan:{valid:false,reason:first.parsed.reason||'Não encontrei peças suficientemente visíveis para cadastrar.',items:[]},model:first.model})

  const refined=[]
  for(let idx=0;idx<candidates.length;idx++){
   const item=candidates[idx],b=item.box
   try{
    const second=await askVision(env,{model,instructions:`Você é o verificador final de UMA peça candidata de um closet virtual. Primeiro responda se a peça candidata realmente está PRESENTE e VISÍVEL dentro/ao redor da caixa indicada e pertence à PESSOA PRINCIPAL. present=false se pertence a outra pessoa ao fundo, foi inferida, estiver escondida por outra roupa, for apenas uma hipótese ou não houver pixels suficientes dela.

Itens independentes devem permanecer separados: uma gravata visível sobre uma camisa é uma peça Acessórios própria; ao verificar a camisa, não trate a gravata como parte do design da camisa. O mesmo vale para lenço, cachecol, cinto, suspensório, relógio, óculos e joias. Não valide duas candidatas que sejam apenas duplicações visuais do mesmo item.

Se present=true, refine cor real, subtipo/modelagem, padrão, estilo, marca/etiqueta. Considere iluminação e balanço de branco. reconstructable=true apenas se puder criar versão de catálogo sem inventar características principais.`,input:[{role:'user',content:[{type:'input_text',text:`Candidata ${idx+1}: ${JSON.stringify({name:item.name,category:item.category,color:item.color,box:b})}. Confirme que ela pertence à pessoa principal e existe como item independente. Se for parte de outra pessoa, duplicação ou peça oculta/inferida, use present=false.`},{type:'input_image',image_url:image,detail:'high'}]}],text:{format:{type:'json_schema',name:'closet_item_refine',strict:true,schema:refineSchema}}})
    const checked={...item,...second.parsed,box:item.box,category:item.category}
    if(checked.present===true&&keepItem(checked))refined.push(checked)
   }catch{if(keepItem(item))refined.push(item)}
  }

  const unique=[]
  for(const item of refined){
   const duplicate=unique.some(x=>x.category===item.category&&Math.abs(x.box.x-item.box.x)<55&&Math.abs(x.box.y-item.box.y)<55&&Math.abs(x.box.width-item.box.width)<80&&Math.abs(x.box.height-item.box.height)<80)
   if(!duplicate)unique.push(item)
  }
  return json({ok:true,scan:{valid:unique.length>0,reason:unique.length?'':'As candidatas não passaram pela confirmação visual.',items:unique},model:first.model,precision_passes:2})
 }catch(error){return json({ok:false,message:error?.message||'Falha ao analisar a foto.'},500)}
}
