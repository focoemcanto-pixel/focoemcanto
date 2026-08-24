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
const refineSchema={type:'object',additionalProperties:false,required:['name','color','subcategory','pattern','style','brand','label_text','confidence'],properties:{name:{type:'string'},color:{type:'string'},subcategory:{type:'string'},pattern:{type:'string'},style:{type:'string'},brand:{type:'string'},label_text:{type:'string'},confidence:{type:'number'}}}

function outputText(data){return data.output_text||data.output?.flatMap(i=>i.content||[]).find(i=>i.type==='output_text')?.text||''}
async function askVision(env,payload){
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload)})
 const data=await response.json();if(!response.ok)throw new Error(data?.error?.message||'Falha na análise visual.');const text=outputText(data);if(!text)throw new Error('A análise visual não retornou dados.');return {parsed:JSON.parse(text),model:data.model}
}

function keepItem(item){
 if(!item||item.confidence<.68||item.reconstructable!==true)return false
 const visibility=Number(item.visibility||0)
 if(item.category==='Bolsas')return visibility>=.62
 if(item.category==='Acessórios')return visibility>=.72&&item.confidence>=.76
 return visibility>=.55
}

export async function onRequestPost({request,env}){
 try{
  if(!env.OPENAI_API_KEY)return json({ok:false,message:'Scanner ainda não configurado.'},503)
  const body=await request.json(),image=String(body?.image||'')
  if(!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image))return json({ok:false,message:'Imagem inválida.'},400)
  if(image.length>8_000_000)return json({ok:false,message:'Imagem muito grande. Tente novamente.'},413)
  const model=env.CLOSET_VISION_MODEL||'gpt-5.6-luna'

  const first=await askVision(env,{model,instructions:`Você é o scanner visual de um guarda-roupa virtual. Sua função NÃO é listar tudo que existe na foto; é selecionar apenas itens que realmente podem virar uma peça confiável do closet.

INCLUA: roupas vestidas ou isoladas, calçados suficientemente visíveis, bolsas suficientemente visíveis e acessórios pessoais de moda claramente identificáveis (óculos, relógio, cinto, joias, boné etc.).

IGNORE SEMPRE: pessoa/corpo, celular, capacete de moto, objetos carregados que não são moda, móveis, comida, cenário e outros objetos domésticos.

VISIBILIDADE É O CRITÉRIO PRINCIPAL. Para cada item estime visibility de 0 a 1 = quanto da própria peça está realmente visível e compreensível. Só marque reconstructable=true quando houver informação visual suficiente para reconstruir a peça sem inventar partes importantes. Uma mochila quase toda escondida atrás do corpo, aparecendo só pelas alças, deve ser IGNORADA e reconstructable=false. Uma calça visível da cintura até a barra pode entrar. Um sapato cortado fora do quadro não entra. Um relógio claramente visível no pulso pode entrar. Capacete nunca entra, mesmo muito visível.

Não confunda objetos próximos com acessórios. Não crie item para algo parcialmente oculto só porque você sabe que provavelmente existe ali.

Para cada item válido, dê uma caixa apertada em coordenadas 0..1000. Diferencie tons com cuidado: branco puro, off-white, creme, marfim, areia, bege claro, cinza claro etc. Procure marca/logo/etiqueta apenas quando realmente legível; se não conseguir ler, use string vazia. Nunca invente marca ou texto.`,input:[{role:'user',content:[{type:'input_text',text:'Primeira passagem: identifique apenas peças realmente utilizáveis no guarda-roupa. Priorize fidelidade, não quantidade. Itens ocultos, ambíguos ou insuficientemente visíveis devem ser descartados.'},{type:'input_image',image_url:image,detail:'high'}]}],text:{format:{type:'json_schema',name:'closet_multi_scan',strict:true,schema:scanSchema}}})

  let items=Array.isArray(first.parsed.items)?first.parsed.items.filter(keepItem):[]
  items=items.sort((a,b)=>{
   const priority=x=>['Blusas','Calças','Vestidos','Calçados'].includes(x.category)?2:1
   return priority(b)-priority(a)||(b.visibility||0)-(a.visibility||0)||(b.confidence||0)-(a.confidence||0)
  }).slice(0,5)

  if(!items.length)return json({ok:true,scan:{valid:false,reason:first.parsed.reason||'Não encontrei peças suficientemente visíveis para cadastrar.',items:[]},model:first.model})

  const refined=[]
  for(let idx=0;idx<items.length;idx++){
   const item=items[idx],b=item.box
   try{
    const second=await askVision(env,{model,instructions:`Você é um perito de catalogação de vestuário. Esta é a SEGUNDA PASSAGEM de precisão sobre uma única peça já localizada. Reavalie especialmente COR REAL, subtipo/modelagem, padrão, estilo e leitura de marca/etiqueta. Considere balanço de branco e iluminação: não chame off-white/creme/marfim de branco só porque o tecido é muito claro. Para texto pequeno, só retorne marca ou label_text quando as letras forem realmente sustentadas pela imagem; caso contrário use string vazia. Preserve a interpretação da peça, não invente detalhes invisíveis.`,input:[{role:'user',content:[{type:'input_text',text:`Refine somente a peça ${idx+1}. Caixa normalizada: x=${b.x}, y=${b.y}, width=${b.width}, height=${b.height}. Leitura inicial: ${JSON.stringify({name:item.name,color:item.color,subcategory:item.subcategory,pattern:item.pattern,style:item.style,brand:item.brand,label_text:item.label_text})}. Inspecione com atenção a região delimitada e corrija os metadados se necessário.`},{type:'input_image',image_url:image,detail:'high'}]}],text:{format:{type:'json_schema',name:'closet_item_refine',strict:true,schema:refineSchema}}})
    refined.push({...item,...second.parsed,box:item.box,category:item.category})
   }catch{refined.push(item)}
  }
  return json({ok:true,scan:{valid:refined.length>0,reason:'',items:refined},model:first.model,precision_passes:2})
 }catch(error){return json({ok:false,message:error?.message||'Falha ao analisar a foto.'},500)}
}
