const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

function dataUrlToBlob(dataUrl){
 const match=String(dataUrl||'').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i)
 if(!match) throw new Error('Imagem inválida para normalização.')
 const mime=match[1].toLowerCase()==='image/jpg'?'image/jpeg':match[1].toLowerCase()
 const binary=atob(match[2]);const bytes=new Uint8Array(binary.length)
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i)
 return new Blob([bytes],{type:mime})
}

export async function onRequestPost({request,env}){
 try{
  if(!env.OPENAI_API_KEY)return json({ok:false,message:'Normalizador de catálogo ainda não configurado.'},503)
  const body=await request.json();const image=String(body?.image||'');const item=body?.item||{}
  if(image.length>8_000_000)return json({ok:false,message:'Imagem muito grande para normalização.'},413)
  const blob=dataUrlToBlob(image)
  const form=new FormData()
  form.append('model',env.CLOSET_IMAGE_MODEL||'gpt-image-1.5')
  form.append('image',blob,'garment.png')
  form.append('size','1024x1024')
  form.append('quality','high')
  form.append('background','transparent')
  form.append('output_format','png')
  form.append('input_fidelity','high')
  const desc=[item?.name,item?.subcategory,item?.category,item?.color,item?.pattern,item?.style].filter(Boolean).join(', ')
  const brand=item?.brand?`Marca detectada com confiança: ${item.brand}.`:''
  const label=item?.label_text?`Texto realmente legível na etiqueta/logo: "${item.label_text}".`:''
  form.append('prompt',`Crie uma versão de catálogo da MESMA peça observada nesta imagem para um guarda-roupa virtual. Esta é uma edição/reconstrução fiel, não uma troca por uma peça genérica.

FIDELIDADE OBRIGATÓRIA: preserve a cor real específica do tecido, inclusive nuances como off-white, creme, marfim, areia, bege, grafite etc.; não converta automaticamente tons claros para branco puro. Preserve gola, mangas, modelagem, comprimento, costuras, botões, bolsos, recortes, estampas, logos e outros detalhes visíveis. ${brand} ${label} Se houver uma marca ou texto visível confirmado acima, preserve esse detalhe visual o mais fielmente possível. Se algo não estiver legível na referência, NÃO invente texto, marca ou logo.

APRESENTAÇÃO: remova completamente pessoa, mãos, braços, pernas, cabide, móveis e cenário. Mostre somente a peça, frontal, centralizada, simétrica e naturalmente estendida como fotografia premium de e-commerce/flat lay. Corrija amassados, deformações por estar vestida e perspectiva, sem alterar o design da peça. Fundo totalmente transparente. Sem manequim, sem corpo, sem sombra humana, sem texto novo adicionado.

Dados do scanner: ${desc||'peça de vestuário'}.`)
  const response=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form})
  const data=await response.json()
  if(!response.ok)return json({ok:false,message:data?.error?.message||'Não consegui criar a versão de catálogo.'},502)
  const b64=data?.data?.[0]?.b64_json
  if(!b64)return json({ok:false,message:'O normalizador não retornou a imagem.'},502)
  return json({ok:true,image:`data:image/png;base64,${b64}`,model:env.CLOSET_IMAGE_MODEL||'gpt-image-1.5'})
 }catch(error){return json({ok:false,message:error?.message||'Falha ao normalizar a peça.'},500)}
}
