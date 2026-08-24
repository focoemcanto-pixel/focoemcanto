const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})

function dataUrlToBlob(dataUrl){
 const match=String(dataUrl||'').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i)
 if(!match)throw new Error('Referência do look inválida.')
 const mime=match[1].toLowerCase()==='image/jpg'?'image/jpeg':match[1].toLowerCase(),binary=atob(match[2]),bytes=new Uint8Array(binary.length)
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i)
 return new Blob([bytes],{type:mime})
}

const avatars={
 'm-1':{label:'Masculino · clássico',description:'adult male fashion model, medium athletic build, medium-brown skin, short dark hair, neutral elegant features'},
 'm-2':{label:'Masculino · slim',description:'adult male fashion model, slim build, dark-brown skin, short dark hair, neutral elegant features'},
 'm-3':{label:'Masculino · amplo',description:'adult male fashion model, broad average build, light-brown skin, short dark hair, neutral elegant features'},
 'f-1':{label:'Feminino · clássico',description:'adult female fashion model, medium build, medium-brown skin, dark hair, neutral elegant features'},
 'f-2':{label:'Feminino · slim',description:'adult female fashion model, slim build, dark-brown skin, dark hair, neutral elegant features'},
 'f-3':{label:'Feminino · curvas',description:'adult female fashion model, curvy build, light-brown skin, dark hair, neutral elegant features'}
}

export async function onRequestPost({request,env}){
 try{
  if(!env.OPENAI_API_KEY)return json({ok:false,message:'Visualizador vestido ainda não configurado.'},503)
  const body=await request.json(),image=String(body?.image||''),avatarId=String(body?.avatarId||'m-1'),occasion=String(body?.occasion||''),items=Array.isArray(body?.items)?body.items:[]
  if(image.length>8_000_000)return json({ok:false,message:'Referência do look muito grande.'},413)
  if(!items.length)return json({ok:false,message:'Nenhuma peça foi enviada para vestir.'},400)
  const avatar=avatars[avatarId]||avatars['m-1'],blob=dataUrlToBlob(image)
  const summary=items.slice(0,6).map((p,i)=>`${i+1}. ${p.name||p.category||'peça'}${p.meta?` — ${p.meta}`:''}`).join('\n')
  const form=new FormData();form.append('model',env.CLOSET_TRYON_MODEL||'gpt-image-2');form.append('image',blob,'look-reference.png');form.append('size','1024x1536');form.append('quality','high');form.append('output_format','png');form.append('input_fidelity','high')
  form.append('prompt',`Crie uma fotografia editorial realista de corpo inteiro para um aplicativo de guarda-roupa virtual. O modelo deve ser: ${avatar.description}.

A imagem de referência contém APENAS as peças reais selecionadas pelo usuário, organizadas como um quadro de catálogo. Vista o modelo com EXATAMENTE essas peças, respeitando cada cor, material aparente, gola, manga, corte, comprimento, estampa, logo e acessório. Não troque nenhuma peça por uma alternativa genérica e não adicione roupa que não esteja na referência. Preserve sobretudo diferenças de branco/off-white, tons de bege, oliva, preto, azul e detalhes pequenos.

Peças selecionadas:\n${summary}
${occasion?`Ocasião: ${occasion}.`:''}

REGRAS DE STYLING: faça sobreposições fisicamente naturais; parte de cima deve entrar/sair da calça somente de forma coerente com a peça; calçado deve aparecer completo; acessórios devem ser usados apenas se estiverem na referência. Não invente bolsa, chapéu, jaqueta, gravata ou joias.

APRESENTAÇÃO: pose fashion natural e discreta, corpo inteiro dos pés à cabeça, câmera frontal levemente editorial, iluminação premium suave, fundo de estúdio quente e minimalista em bege/off-white, sem texto, sem moldura, sem colagem. O objetivo é mostrar ao usuário COMO O LOOK REAL DELE FICARIA VESTIDO em um manequim humano padrão, não criar um novo look.`)
  const response=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form}),data=await response.json()
  if(!response.ok)throw new Error(data?.error?.message||'Não consegui vestir o look no modelo.')
  const b64=data?.data?.[0]?.b64_json;if(!b64)throw new Error('O visualizador não retornou uma imagem.')
  return json({ok:true,image:`data:image/png;base64,${b64}`,avatar:{id:avatarId,label:avatar.label},model:env.CLOSET_TRYON_MODEL||'gpt-image-2'})
 }catch(error){return json({ok:false,message:error?.message||'Falha ao visualizar o look vestido.'},500)}
}
