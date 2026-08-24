const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

const itemSchema={
 type:'object',additionalProperties:false,
 required:['name','category','color','subcategory','pattern','style','brand','label_text','confidence','box'],
 properties:{
  name:{type:'string'},category:{type:'string',enum:['Blusas','Calças','Vestidos','Calçados','Bolsas','Acessórios']},color:{type:'string'},subcategory:{type:'string'},pattern:{type:'string'},style:{type:'string'},brand:{type:'string'},label_text:{type:'string'},confidence:{type:'number'},
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

export async function onRequestPost({request,env}){
 try{
  if(!env.OPENAI_API_KEY)return json({ok:false,message:'Scanner ainda não configurado.'},503)
  const body=await request.json(),image=String(body?.image||'')
  if(!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image))return json({ok:false,message:'Imagem inválida.'},400)
  if(image.length>8_000_000)return json({ok:false,message:'Imagem muito grande. Tente novamente.'},413)
  const model=env.CLOSET_VISION_MODEL||'gpt-5.6-luna'

  const first=await askVision(env,{model,instructions:`Você é o scanner visual de um guarda-roupa virtual. Detecte TODAS as peças de moda utilizáveis visíveis, inclusive quando vestidas. Não trate pessoa, celular, capacete, móveis ou objetos domésticos como peça. Para cada item, dê uma caixa apertada em coordenadas 0..1000. Nomes curtos em português do Brasil. Diferencie tons com cuidado: branco puro, off-white, creme, marfim, areia, bege claro, cinza claro etc. Procure marca/logo/etiqueta apenas quando realmente legível; se não conseguir ler, use string vazia. Nunca invente marca ou texto. confidence mínimo útil 0.65.`,input:[{role:'user',content:[{type:'input_text',text:'Primeira passagem: detecte e localize todas as peças. Faça uma classificação inicial, sabendo que cada peça passará por uma segunda leitura dedicada.'},{type:'input_image',image_url:image,detail:'high'}]}],text:{format:{type:'json_schema',name:'closet_multi_scan',strict:true,schema:scanSchema}}})
  let items=Array.isArray(first.parsed.items)?first.parsed.items.filter(i=>i.confidence>=.65):[]
  if(!items.length)return json({ok:true,scan:{valid:false,reason:first.parsed.reason||'Não encontrei peças válidas.',items:[]},model:first.model})

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
