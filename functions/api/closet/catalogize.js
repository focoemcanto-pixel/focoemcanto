const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

function dataUrlToBlob(dataUrl){
 const match=String(dataUrl||'').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i)
 if(!match)throw new Error('Imagem inválida para normalização.')
 const mime=match[1].toLowerCase()==='image/jpg'?'image/jpeg':match[1].toLowerCase(),binary=atob(match[2]),bytes=new Uint8Array(binary.length)
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i)
 return new Blob([bytes],{type:mime})
}
function outputText(data){return data.output_text||data.output?.flatMap(i=>i.content||[]).find(i=>i.type==='output_text')?.text||''}
const verifySchema={type:'object',additionalProperties:false,required:['faithful','score','issues','retry_instruction'],properties:{faithful:{type:'boolean'},score:{type:'number'},issues:{type:'array',items:{type:'string'},maxItems:8},retry_instruction:{type:'string'}}}

async function generate(env,blob,item,retryInstruction=''){
 const form=new FormData();form.append('model',env.CLOSET_IMAGE_MODEL||'gpt-image-1.5');form.append('image',blob,'garment.png');form.append('size','1024x1024');form.append('quality','high');form.append('background','transparent');form.append('output_format','png');form.append('input_fidelity','high')
 const desc=[item?.name,item?.subcategory,item?.category,item?.color,item?.pattern,item?.style].filter(Boolean).join(', '),brand=item?.brand?`Marca detectada com confiança: ${item.brand}.`:'',label=item?.label_text?`Texto realmente legível na etiqueta/logo: "${item.label_text}".`:''
 const isAccessory=item?.category==='Acessórios'
 const separation=isAccessory
  ?`ALVO ÚNICO: gere SOMENTE o acessório descrito nos dados do scanner. Remova completamente camisa, blusa, vestido, corpo e qualquer outra peça usada junto. Se for gravata, produza apenas a gravata isolada; se for óculos, apenas os óculos; se for relógio, apenas o relógio. Não incorpore tecido ou partes da roupa de fundo ao acessório.`
  :`SEPARAÇÃO OBRIGATÓRIA: esta imagem pode mostrar acessórios ou outras camadas sobre a peça-alvo. Eles NÃO fazem parte do produto. Remova gravata, gravata-borboleta, lenço, cachecol, colar, cinto, suspensório, relógio, óculos e outras peças independentes que estejam sobre/ao lado da peça-alvo. Exemplo: para uma camisa usada com gravata, gere a CAMISA SOZINHA, sem gravata. Preserve apenas elementos intrínsecos da própria peça, como botões, bolsos, gola, punhos, estampas e logos pertencentes a ela.`
 form.append('prompt',`Crie uma versão de catálogo da MESMA peça observada nesta imagem para um guarda-roupa virtual. Esta é uma edição/reconstrução fiel, não uma troca por uma peça genérica.

${separation}

FIDELIDADE OBRIGATÓRIA: preserve a cor real específica do tecido, inclusive nuances como off-white, creme, marfim, areia, bege, grafite etc.; não converta automaticamente tons claros para branco puro. Preserve gola, mangas, modelagem, comprimento, costuras, botões, bolsos, recortes, estampas, logos e outros detalhes visíveis QUE PERTENÇAM À PEÇA-ALVO. ${brand} ${label} Se houver uma marca ou texto visível confirmado acima, preserve esse detalhe visual o mais fielmente possível. Se algo não estiver legível na referência, NÃO invente texto, marca ou logo.

APRESENTAÇÃO: remova completamente pessoa, mãos, braços, pernas, cabide, móveis e cenário. Mostre somente a peça-alvo, frontal, centralizada, simétrica e naturalmente estendida como fotografia premium de e-commerce/flat lay. Corrija amassados, deformações por estar vestida e perspectiva, sem alterar o design. Fundo totalmente transparente. Sem manequim, sem corpo, sem sombra humana, sem texto novo adicionado.

Dados do scanner: ${desc||'peça de vestuário'}.${retryInstruction?`\n\nCORREÇÃO OBRIGATÓRIA APÓS AUDITORIA: ${retryInstruction}`:''}`)
 const response=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form}),data=await response.json()
 if(!response.ok)throw new Error(data?.error?.message||'Não consegui criar a versão de catálogo.');const b64=data?.data?.[0]?.b64_json;if(!b64)throw new Error('O normalizador não retornou a imagem.');return `data:image/png;base64,${b64}`
}

async function verify(env,original,catalog,item){
 const model=env.CLOSET_VISION_MODEL||'gpt-5.6-luna'
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions:`Compare a referência da peça com o asset de catálogo. Avalie fidelidade do PRODUTO, não pose/amassados. Verifique sobretudo mudança de categoria/modelagem, cor, gola, mangas, comprimento, bolsos, estampa e detalhes distintivos. Também confirme SEPARAÇÃO: acessórios ou outras peças independentes presentes na referência não podem ter sido fundidos à peça-alvo. Para camisa com gravata, a camisa catalogada deve estar sem gravata; para gravata, o catálogo deve conter somente a gravata. score 0..1. faithful=true se a peça continua sendo claramente o mesmo produto e está corretamente isolada. Produza retry_instruction somente para divergência material.`,input:[{role:'user',content:[{type:'input_text',text:`Metadados refinados: ${JSON.stringify(item)}. Imagem 1 = referência. Imagem 2 = catálogo.`},{type:'input_image',image_url:original,detail:'high'},{type:'input_image',image_url:catalog,detail:'low'}]}],text:{format:{type:'json_schema',name:'closet_catalog_verify',strict:true,schema:verifySchema}}})})
 const data=await response.json();if(!response.ok)throw new Error(data?.error?.message||'Falha na conferência do asset.');const text=outputText(data);if(!text)throw new Error('Conferência sem resultado.');return JSON.parse(text)
}

function severeAudit(audit){
 const score=Number(audit?.score||0)
 if(score<.78)return true
 const text=[...(audit?.issues||[]),audit?.retry_instruction||''].join(' ').toLowerCase()
 return /outra peça|categoria errada|tipo errado|cor muito diferente|cor incorreta|manga errada|gola errada|estampa errada|logo inventado|gravata.*camisa|acessório.*fundido|não isolad/.test(text)
}

export async function onRequestPost({request,env}){
 try{
  if(!env.OPENAI_API_KEY)return json({ok:false,message:'Normalizador de catálogo ainda não configurado.'},503)
  const body=await request.json(),image=String(body?.image||''),item=body?.item||{}
  if(image.length>8_000_000)return json({ok:false,message:'Imagem muito grande para normalização.'},413)
  const blob=dataUrlToBlob(image)
  let catalog=await generate(env,blob,item),audit=null,retried=false
  try{
   audit=await verify(env,image,catalog,item)
   if(severeAudit(audit)){
    retried=true
    catalog=await generate(env,blob,item,audit.retry_instruction||`Corrija estas divergências materiais: ${(audit.issues||[]).join('; ')}`)
   }
  }catch{/* auditoria é proteção adicional; não descarta um asset de alta qualidade se ela falhar */}
  return json({ok:true,image:catalog,model:env.CLOSET_IMAGE_MODEL||'gpt-image-1.5',verified:Boolean(audit?.faithful),fidelity_score:audit?.score??null,issues:audit?.issues||[],retried})
 }catch(error){return json({ok:false,message:error?.message||'Falha ao normalizar a peça.'},500)}
}
