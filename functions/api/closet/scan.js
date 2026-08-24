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
 if(item.category==='Acessórios')return visibility>=.74&&item.confidence>=.78
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

REGRA ABSOLUTA ANTI-ALUCINAÇÃO: nunca crie uma peça porque ela seria provável, porque poderia estar por baixo de outra roupa ou porque combina com o look. Uma camiseta escondida sob um suéter NÃO existe para este cadastro. Se você não consegue apontar pixels visíveis pertencentes à peça, NÃO retorne o item.

FAÇA UMA VARREDURA SISTEMÁTICA da pessoa: cabeça/rosto (óculos e acessórios apenas se claros), tronco (camada externa realmente visível), cintura/quadril, pernas (calça/saia/short), pés (calçados somente se aparecem). Detecte parte de cima e parte de baixo separadamente quando ambas estiverem visíveis. Uma calça pode ser aceita mesmo com a barra fora do quadro se cintura, quadril, duas pernas e modelagem estiverem suficientemente visíveis para reconstrução fiel.

INCLUA: roupas realmente visíveis, calçados suficientemente visíveis, bolsas suficientemente expostas e acessórios de moda claramente identificáveis.
IGNORE SEMPRE: corpo/pessoa, celular, capacete de moto, cenário, móveis e objetos domésticos. Mochila/bolsa quase toda escondida, aparecendo só alças ou pequeno fragmento, deve ser descartada.

Para cada item estime visibility 0..1 e reconstructable. Dê caixa apertada 0..1000 cobrindo apenas pixels da peça. Diferencie nuances de cor. Marca/etiqueta só se realmente legível. Nunca invente texto.`,input:[{role:'user',content:[{type:'input_text',text:'Detecte somente peças fisicamente visíveis nesta foto. Antes de retornar cada item, confirme mentalmente: consigo apontar uma região concreta da imagem que mostra esta peça? Se não, descarte. Não infira camadas ocultas.'},{type:'input_image',image_url:image,detail:'high'}]}],text:{format:{type:'json_schema',name:'closet_multi_scan',strict:true,schema:scanSchema}}})

  let candidates=Array.isArray(first.parsed.items)?first.parsed.items.filter(keepItem):[]
  candidates=candidates.sort((a,b)=>{
   const priority=x=>['Blusas','Calças','Vestidos','Calçados'].includes(x.category)?2:1
   return priority(b)-priority(a)||(b.visibility||0)-(a.visibility||0)||(b.confidence||0)-(a.confidence||0)
  }).slice(0,5)
  if(!candidates.length)return json({ok:true,scan:{valid:false,reason:first.parsed.reason||'Não encontrei peças suficientemente visíveis para cadastrar.',items:[]},model:first.model})

  const refined=[]
  for(let idx=0;idx<candidates.length;idx++){
   const item=candidates[idx],b=item.box
   try{
    const second=await askVision(env,{model,instructions:`Você é o verificador final de UMA peça candidata de um closet virtual. Primeiro responda se a peça candidata realmente está PRESENTE e VISÍVEL dentro/ao redor da caixa indicada. present=false se a candidata foi inferida, estiver escondida por outra roupa, for apenas uma hipótese ou não houver pixels suficientes dela. NÃO valide uma camiseta supostamente sob um suéter. NÃO valide mochila se só alças aparecem. Capacete nunca é item de closet.

Se present=true, refine cor real, subtipo/modelagem, padrão, estilo, marca/etiqueta. Considere iluminação e balanço de branco. reconstructable=true apenas se puder criar versão de catálogo sem inventar características principais.`,input:[{role:'user',content:[{type:'input_text',text:`Candidata ${idx+1}: ${JSON.stringify({name:item.name,category:item.category,color:item.color,box:b})}. Verifique visualmente a EXISTÊNCIA desta peça na foto antes de refinar. Se a região corresponder a outra roupa, pele, cenário, capacete ou peça oculta/inferida, use present=false.`},{type:'input_image',image_url:image,detail:'high'}]}],text:{format:{type:'json_schema',name:'closet_item_refine',strict:true,schema:refineSchema}}})
    const checked={...item,...second.parsed,box:item.box,category:item.category}
    if(checked.present===true&&keepItem(checked))refined.push(checked)
   }catch{if(keepItem(item))refined.push(item)}
  }

  const unique=[]
  for(const item of refined){
   const duplicate=unique.some(x=>x.category===item.category&&Math.abs(x.box.x-item.box.x)<70&&Math.abs(x.box.y-item.box.y)<70)
   if(!duplicate)unique.push(item)
  }
  return json({ok:true,scan:{valid:unique.length>0,reason:unique.length?'':'As candidatas não passaram pela confirmação visual.',items:unique},model:first.model,precision_passes:2})
 }catch(error){return json({ok:false,message:error?.message||'Falha ao analisar a foto.'},500)}
}
