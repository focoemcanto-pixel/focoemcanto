import { type ReactNode } from 'react';
import { blackConfig as config } from './black-config';
import p from './prelaunch.module.css';

// PRE-LAUNCH replacement for the offer reveal: what it is, when it opens, how to be first.
// No price, installments or checkout before the opening (the form asks the visitor's own estimate).
export default function PrelaunchSection({ cta, closed }: { cta: ReactNode; closed: boolean }) {
  return <section id="lista" className={p.launch} aria-labelledby="launch-title">
    <div className={p.launchGlow} aria-hidden="true" />
    <p className={p.label}>06 / A ABERTURA</p>
    <div className={p.date} aria-hidden="true"><span>08</span><i>.</i><span>11</span></div>
    <h2 id="launch-title" className={p.launchTitle}>A BLACK FOCO {config.year} abre em <em>{config.launch.opensAtLong}.</em></h2>
    <p className={p.launchLead}>Uma grande oportunidade que reúne tudo o que construímos na Foco em Canto. Quem está na Lista Prioritária recebe primeiro os avisos da abertura.</p>
    <ol className={p.steps}>
      {[['Entre na lista', 'Nome, e-mail e WhatsApp.'], ['Responda 5 perguntas', 'Rápidas, uma por vez.'], ['Entre no grupo oficial', 'Os avisos da abertura chegam por lá.']].map(([title, text], i) =>
        <li key={title}><span>0{i + 1}</span><b>{title}</b><small>{text}</small></li>)}
    </ol>
    <div className={p.launchAction} data-list-inline>{closed ? <p className={p.note} role="status">As inscrições da Lista Prioritária estão encerradas.</p> : cta}</div>
  </section>;
}
