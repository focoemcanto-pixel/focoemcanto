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
  form.append('quality','medium')
  form.append('background','transparent')
  form.append('output_format','png')
  form.append('input_fidelity','high')
  const desc=[item?.name,item?.subcategory,item?.category,item?.color,item?.pattern,item?.style].filter(Boolean).join(', ')
  form.append('prompt',`Transforme a peça de roupa desta imagem em um asset de catálogo para um guarda-roupa virtual. Preserve com máxima fidelidade a MESMA peça observada: cor real, gola, mangas, modelagem, comprimento, costuras, botões, bolsos, estampas, logos e detalhes visíveis. Não troque o produto por uma peça genérica e não invente elementos que não estejam visíveis. Remova completamente pessoa, mãos, braços, pernas, cabide, móveis e cenário. Apresente somente a peça isolada, vista frontalmente, centralizada, simétrica e naturalmente estendida como fotografia de e-commerce/flat lay, corrigindo apenas amassados, deformações causadas por estar vestida e perspectiva da foto. Fundo totalmente transparente. Sem manequim, sem corpo, sem sombra de pessoa, sem texto adicionado. Item identificado pelo scanner: ${desc||'peça de vestuário'}.`)
  const response=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form})
  const data=await response.json()
  if(!response.ok)return json({ok:false,message:data?.error?.message||'Não consegui criar a versão de catálogo.'},502)
  const b64=data?.data?.[0]?.b64_json
  if(!b64)return json({ok:false,message:'O normalizador não retornou a imagem.'},502)
  return json({ok:true,image:`data:image/png;base64,${b64}`,model:env.CLOSET_IMAGE_MODEL||'gpt-image-1.5'})
 }catch(error){return json({ok:false,message:error?.message||'Falha ao normalizar a peça.'},500)}
}
