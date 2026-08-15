import AlunosManagerV2 from './AlunosManagerV2'

export default function AlunosPage() {
  return <div style={{position:'relative'}}>
    <a href="/api/admin/calendario" style={{position:'fixed',top:24,right:220,zIndex:60,padding:'11px 14px',borderRadius:11,border:'1px solid rgba(255,255,255,.1)',background:'#151a21',color:'#fff',textDecoration:'none',fontSize:11,fontWeight:900}}>Exportar calendário</a>
    <AlunosManagerV2 />
  </div>
}
