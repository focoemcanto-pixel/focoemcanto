(()=>{
  if(!location.pathname.startsWith('/admin/whatsapp'))return

  const TEMPLATE_TITLES=[
    'Enquete da próxima aula',
    'Plantão vocal — grupo aberto',
    'Tema escolhido — esquenta da aula',
    'Lembrete da aula',
    'Pré-live',
    'Link da aula ao vivo',
    'Pós-live — grupo aberto',
    'Replay disponível',
    'Desafio Vocal da Semana',
  ]

  const $=id=>document.getElementById(id)
  const addDays=(base,n)=>{const d=new Date(base+'T12:00:00');d.setDate(d.getDate()+n);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`

  function restructurePanel(){
    const panel=document.querySelector('.layout aside.panel')
    const button=$('generateBtn')
    if(!panel||!button||panel.dataset.weekWorkflow==='1')return
    panel.dataset.weekWorkflow='1'

    const heading=panel.querySelector('h2')
    const description=heading?.nextElementSibling
    if(heading)heading.textContent='Criar programação-base'
    if(description)description.textContent='Use este bloco apenas para criar a primeira semana. Depois, duplique a programação e altere somente o tema e os conteúdos variáveis.'

    const wednesday=$('wednesday')
    const theme=$('theme')
    const live=$('liveLink')
    const replay=$('replayLink')
    const wednesdayLabel=wednesday?.closest('label')
    const themeLabel=theme?.closest('label')
    const liveLabel=live?.closest('label')
    const replayLabel=replay?.closest('label')

    const themeTitle=themeLabel?.querySelector('span')
    const dateTitle=wednesdayLabel?.querySelector('span')
    if(themeTitle)themeTitle.textContent='Tema da primeira semana'
    if(dateTitle)dateTitle.textContent='Data da Quarta Vocal'
    if(liveLabel)liveLabel.style.display='none'
    if(replayLabel)replayLabel.style.display='none'

    button.textContent='Criar programação da semana'

    const note=document.createElement('div')
    note.style.cssText='margin:14px 0 4px;padding:14px;border-radius:16px;border:1px solid rgba(168,85,247,.24);background:rgba(168,85,247,.08);font-size:13px;line-height:1.55;color:rgba(255,255,255,.72)'
    note.innerHTML='<strong style="color:#d8b4fe">Fluxo recomendado</strong><br>1. Crie a semana-base uma vez.<br>2. Nas próximas semanas, use <b>Duplicar semana</b>.<br>3. Atualize o tema no bloco superior de configuração.<br>4. Adicione os links quando estiverem disponíveis.'
    button.insertAdjacentElement('afterend',note)

    button.onclick=createBaseWeek
  }

  function templates(wed,theme){
    const challengeUrl='https://escola.focoemcanto.com/aluno/central/desafio-semanal'
    return [
      {offset:-3,time:'19:00',title:'Enquete da próxima aula',type:'POLL',themeDependent:true,message:'',poll:{question:'Qual desses temas você mais gostaria de ver na próxima Quarta Vocal?',options:['Afinação','Extensão vocal','Segunda voz','Respiração','Segurança para cantar'],multiSelect:false}},
      {offset:-2,time:'19:00',title:'Plantão vocal — grupo aberto',themeDependent:false,message:'💬 Nosso Plantão Vocal está aberto!\n\nAté as 21h, envie sua principal dúvida sobre canto, técnica vocal, afinação, extensão, respiração ou segunda voz.\n\nVou acompanhar as mensagens e selecionar algumas perguntas para a Quarta Vocal. 🎤'},
      {offset:-1,time:'20:00',title:'Tema escolhido — esquenta da aula',themeDependent:true,message:`🔥 Amanhã temos Quarta Vocal!\n\nO tema desta semana será: *${theme}*\n\nSe esse assunto trava sua evolução, já se organize para estar comigo amanhã, às 20h. Será uma aula prática e direta. 🎙️`},
      {offset:0,time:'10:00',title:'Lembrete da aula',themeDependent:true,message:`🚨 É hoje!\n\nNossa Quarta Vocal acontece hoje, às 20h.\n\nTema: *${theme}*\n\nColoque o alarme e venha preparado para aplicar o conteúdo na sua voz. 🎤🔥`},
      {offset:0,time:'19:30',title:'Pré-live',themeDependent:true,message:`🎙️ Falta pouco!\n\nDaqui a 30 minutos começamos a Quarta Vocal sobre *${theme}*.\n\nSepare seu fone, sua água e um lugar tranquilo para acompanhar.`},
      {offset:0,time:'20:00',title:'Link da aula ao vivo',themeDependent:false,message:'🔴 COMEÇAMOS AGORA!\n\nA Quarta Vocal já está ao vivo.\n\n👉 [LINK DA LIVE]\n\nEntre agora para acompanhar desde o início. 🎤'},
      {offset:0,time:'21:05',title:'Pós-live — grupo aberto',themeDependent:true,message:`💬 Grupo aberto!\n\nO que mais chamou sua atenção na aula de hoje sobre *${theme}*?\n\nConte qual ponto você pretende aplicar primeiro na sua voz.`},
      {offset:1,time:'10:00',title:'Replay disponível',themeDependent:false,message:'📚 O replay da Quarta Vocal já está disponível!\n\n👉 [LINK DO REPLAY]\n\nAssista anotando os pontos que você precisa aplicar durante a semana.'},
      {offset:2,time:'19:00',title:'Desafio Vocal da Semana',themeDependent:true,message:`🎯 Seu Desafio Vocal da Semana está liberado!\n\nAgora é hora de transformar a aula sobre *${theme}* em prática.\n\n👉 ${challengeUrl}\n\nFaça o exercício no seu ritmo e marque a conclusão dentro da Escola Foco em Canto.`},
    ].map(row=>({
      id:uid(),date:addDays(wed,row.offset),time:row.time,title:row.title,message:row.message,
      status:'PENDENTE',sentAt:null,error:null,source:'weekly-template',templateKey:row.title,
      themeDependent:row.themeDependent,weekTheme:theme,createdAt:new Date().toISOString(),
      ...(row.poll?{type:'POLL',poll:row.poll}:{})
    }))
  }

  function createBaseWeek(){
    const theme=$('theme')?.value.trim()||'Afinação e segurança vocal'
    const wed=$('wednesday')?.value
    if(!wed)return window.showNotice?.('Informe a data da Quarta Vocal.',false)

    const start=addDays(wed,-2),end=addDays(wed,4)
    const all=window.load?.()||[]
    const existing=all.filter(item=>item.date>=start&&item.date<=end)
    if(existing.length){
      const proceed=confirm(`Já existem ${existing.length} disparos nesta semana.\n\nA programação-base substituirá apenas os modelos pendentes e preservará disparos manuais e mensagens já enviadas. Continuar?`)
      if(!proceed)return
    }

    const preserved=all.filter(item=>{
      const inWeek=item.date>=start&&item.date<=end
      const isTemplate=item.source==='weekly-template'||TEMPLATE_TITLES.includes(item.title)
      return !(inWeek&&isTemplate&&item.status!=='ENVIADO')
    })
    const created=templates(wed,theme)
    window.save?.([...preserved,...created])

    try{
      const key='foco_whatsapp_week_settings_v1'
      const settings=JSON.parse(localStorage.getItem(key)||'{}')
      const monday=addDays(wed,-2)
      settings[monday]={...(settings[monday]||{}),theme,updatedAt:new Date().toISOString()}
      localStorage.setItem(key,JSON.stringify(settings))
    }catch{}

    window.showNotice?.('Programação-base criada. Nas próximas semanas, use “Duplicar semana”.')
  }

  function emphasizeDuplication(){
    const duplicate=document.getElementById('duplicateWeek')
    if(duplicate){
      duplicate.textContent='⧉ Duplicar para próxima semana'
      duplicate.title='Copia toda a programação, preservando horários, enquetes, imagens e estrutura.'
    }
    const settings=document.getElementById('weekSettings')
    const sub=settings?.querySelector('.foco-planner-sub')
    if(sub)sub.textContent='Depois de duplicar, altere aqui o tema e os links. Somente os disparos dependentes do tema precisam mudar.'
  }

  function init(){
    restructurePanel()
    emphasizeDuplication()
    setTimeout(()=>{restructurePanel();emphasizeDuplication()},500)
  }
  setTimeout(init,180)
})()