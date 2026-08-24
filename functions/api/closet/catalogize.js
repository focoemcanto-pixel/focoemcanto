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
 form.append('prompt',`Crie uma versão de catálogo da MESMA peça observada nesta imagem para um guarda-roupa virtual. Esta é uma edição/reconstrução fiel, não uma troca por uma peça genérica.

FIDELIDADE OBRIGATÓRIA: preserve a cor real específica do tecido, inclusive nuances como off-white, creme, marfim, areia, bege, grafite etc.; não converta automaticamente tons claros para branco puro. Preserve gola, mangas, modelagem, comprimento, costuras, botões, bolsos, recortes, estampas, logos e outros detalhes visíveis. ${brand} ${label} Se houver uma marca ou texto visível confirmado acima, preserve esse detalhe visual o mais fielmente possível. Se algo não estiver legível na referência, NÃO invente texto, marca ou logo.

APRESENTAÇÃO: remova completamente pessoa, mãos, braços, pernas, cabide, móveis e cenário. Mostre somente a peça, frontal, centralizada, simétrica e naturalmente estendida como fotografia premium de e-commerce/flat lay. Corrija amassados, deformações por estar vestida e perspectiva, sem alterar o design da peça. Fundo totalmente transparente. Sem manequim, sem corpo, sem sombra humana, sem texto novo adicionado.

Dados do scanner: ${desc||'peça de vestuário'}.${retryInstruction?`\n\nCORREÇÃO OBRIGATÓRIA APÓS AUDITORIA: ${retryInstruction}`:''}`)
 const response=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form}),data=await response.json()
 if(!response.ok)throw new Error(data?.error?.message||'Não consegui criar a versão de catálogo.');const b64=data?.data?.[0]?.b64_json;if(!b64)throw new Error('O normalizador não retornou a imagem.');return `data:image/png;base64,${b64}`
}

async function verify(env,original,catalog,item){
 const model=env.CLOSET_VISION_MODEL||'gpt-5.6-luna'
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions:`Compare a fotografia original recortada da peça com o asset de catálogo gerado. Avalie fidelidade do PRODUTO, não pose/amassados. Verifique principalmente: nuance de cor, tipo/modelagem, gola, mangas, comprimento, recortes, bolsos, estampa, logo/etiqueta e detalhes distintivos. A versão de catálogo pode estar reta e desamassada, mas não pode virar outra peça. score de 0 a 1. faithful=true apenas se score >= 0.86 e não houver alteração material. Produza retry_instruction curta e objetiva apenas se precisar corrigir.`,input:[{role:'user',content:[{type:'input_text',text:`Metadados refinados: ${JSON.stringify(item)}. Imagem 1 = referência original. Imagem 2 = asset gerado.`},{type:'input_image',image_url:original,detail:'high'},{type:'input_image',image_url:catalog,detail:'high'}]}],text:{format:{type:'json_schema',name:'closet_catalog_verify',strict:true,schema:verifySchema}}})})
 const data=await response.json();if(!response.ok)throw new Error(data?.error?.message||'Falha na conferência do asset.');const text=outputText(data);if(!text)throw new Error('Conferência sem resultado.');return JSON.parse(text)
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
   if(!audit.faithful||Number(audit.score)<.86){retried=true;catalog=await generate(env,blob,item,audit.retry_instruction||`Corrija estas divergências: ${(audit.issues||[]).join('; ')}`);audit=await verify(env,image,catalog,item)}
  }catch{/* se a auditoria falhar, preserva o asset gerado em vez de perder o cadastro */}
  return json({ok:true,image:catalog,model:env.CLOSET_IMAGE_MODEL||'gpt-image-1.5',verified:Boolean(audit?.faithful),fidelity_score:audit?.score??null,issues:audit?.issues||[],retried})
 }catch(error){return json({ok:false,message:error?.message||'Falha ao normalizar a peça.'},500)}
}
