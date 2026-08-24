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
 if(!item||item.reconstructable!==true)return false
 const confidence=Number(item.confidence||0),visibility=Number(item.visibility||0)
 if(['Blusas','Calças','Vestidos'].includes(item.category))return confidence>=.64&&visibility>=.38
 if(item.category==='Calçados')return confidence>=.68&&visibility>=.55
 if(item.category==='Bolsas')return confidence>=.72&&visibility>=.68
 if(item.category==='Acessórios')return confidence>=.74&&visibility>=.68
 return confidence>=.68&&visibility>=.55
}

export async function onRequestPost({request,env}){
 try{
  if(!env.OPENAI_API_KEY)return json({ok:false,message:'Scanner ainda não configurado.'},503)
  const body=await request.json(),image=String(body?.image||'')
  if(!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image))return json({ok:false,message:'Imagem inválida.'},400)
  if(image.length>8_000_000)return json({ok:false,message:'Imagem muito grande. Tente novamente.'},413)
  const model=env.CLOSET_VISION_MODEL||'gpt-5.6-luna'

  const first=await askVision(env,{model,instructions:`Você é o scanner visual de um guarda-roupa virtual. Sua função é encontrar as peças REAIS que compõem o look da pessoa e selecionar somente as que podem virar assets confiáveis do closet.

FAÇA UMA VARREDURA ESTRUTURADA DO LOOK, nesta ordem: (1) parte de cima; (2) parte de baixo; (3) vestido/macacão se houver; (4) calçados; (5) acessórios pessoais realmente visíveis, como óculos, relógio, cinto, joias e boné; (6) bolsa somente se o corpo da bolsa estiver suficientemente visível. Não pare depois de encontrar a primeira roupa. Parte de cima e parte de baixo são itens independentes e devem ser retornados separadamente quando ambos estiverem visíveis.

IMPORTANTE PARA FOTOS VESTIDAS: uma calça NÃO precisa aparecer 100% até a barra para ser utilizável. Se cintura/quadril e uma porção significativa das pernas estiverem visíveis, com cor, corte e silhueta suficientemente claros para reconstrução fiel, marque reconstructable=true. O mesmo vale para uma blusa parcialmente coberta por mãos ou celular quando a modelagem principal continua compreensível. Já uma mochila mostrada apenas pelas alças ou quase toda escondida atrás do corpo NÃO deve entrar. Óculos claramente visíveis no rosto podem entrar como acessório, mesmo sendo pequenos.

IGNORE SEMPRE: pessoa/corpo, celular, capacete de moto, mochila quase toda escondida, objetos carregados que não são moda, móveis, comida, cenário e outros objetos domésticos. Capacete nunca é peça de closet neste produto.

VISIBILIDADE: estime visibility de 0 a 1 = quanto da peça e de sua estrutura visual estão utilizáveis. reconstructable=true significa que dá para criar uma versão de catálogo fiel sem inventar design importante; não significa que 100% da peça precisa estar no quadro. Para roupas básicas de silhueta previsível, uma boa visão frontal/parcial pode ser suficiente. Para bolsas e acessórios complexos, seja mais rigoroso.

Para cada item, dê uma caixa apertada em coordenadas 0..1000. Diferencie tons com cuidado: branco puro, off-white, creme, marfim, areia, bege claro, cinza claro etc. Procure marca/logo/etiqueta apenas quando realmente legível; se não conseguir ler, use string vazia. Nunca invente marca ou texto.`,input:[{role:'user',content:[{type:'input_text',text:'Primeira passagem: percorra o look inteiro e liste cada peça utilizável separadamente. Não omita a parte de baixo só porque a foto termina antes dos pés. Não inclua itens ocultos ou objetos como capacete/celular.'},{type:'input_image',image_url:image,detail:'high'}]}],text:{format:{type:'json_schema',name:'closet_multi_scan',strict:true,schema:scanSchema}}})

  let items=Array.isArray(first.parsed.items)?first.parsed.items.filter(keepItem):[]
  items=items.sort((a,b)=>{
   const priority=x=>x.category==='Blusas'?5:x.category==='Calças'?5:x.category==='Vestidos'?5:x.category==='Calçados'?4:x.category==='Acessórios'?3:2
   return priority(b)-priority(a)||(b.visibility||0)-(a.visibility||0)||(b.confidence||0)-(a.confidence||0)
  }).slice(0,6)

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
