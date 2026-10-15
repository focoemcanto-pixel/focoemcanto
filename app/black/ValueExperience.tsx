import { blackConfig as config, currency, offerTotals, valueItems } from './black-config';
import { type ReactNode } from 'react';
import c from './value-experience.module.css';
const money = (cents: number) => currency(cents / 100);
export default function ValueExperience({ cta, notice }: { cta: ReactNode; notice: ReactNode }) {
  return <section id="oferta" className={c.value} data-pin-scene="value" data-scene="value" aria-labelledby="value-title">
    <div className={c.stage} data-pin-stage data-value-stage>
      <div className={c.construction} data-value-construction>
        <header><p className={c.label}>06 / O VALOR DE CADA PARTE</p><h2 id="value-title">Separados, já é muito.<br/><em>Juntos, é Black.</em></h2></header>
        <div className={c.valueGrid}><ol className={c.items}>{valueItems.map((item,index) => {
          const product = config.products.find(p => p.id === item.product)!;
          return <li key={item.product} data-value-item><span className={c.index}>0{index+1}</span>{product.image && <img src={product.image.srcSet.split(' ')[0]} width={product.image.width} height={product.image.height} alt={product.image.alt} loading="lazy" decoding="async"/>}<div><h3>{item.label}</h3><p>{item.access}</p>{item.calculation && <small>{money(item.calculation.monthlyCents)}/mês × {item.calculation.months}</small>}</div><strong>{money(item.cents)}</strong></li>;
        })}</ol><div className={c.subtotal}><span>VALOR SEPARADO</span><p aria-hidden="true" data-value-subtotal>{money(offerTotals.regularCents)}</p><p className={c.sr}>Total dos cinco produtos separadamente: {money(offerTotals.regularCents)}.</p><span>FORMAÇÃO + PRÁTICA + FERRAMENTAS + MATERIAIS</span><p className={c.next}>Tudo o que construímos.<br/>Em uma única oportunidade. <span aria-hidden="true">↓</span></p></div></div>
      </div>
      <div className={c.revelation} data-value-revelation>
        <div className={c.priceLight} aria-hidden="true"/>
        <p className={c.label}>BLACK FOCO {config.year}</p><h2 className={c.price}><span>R$</span> {config.payment.cashPrice}<span className={c.sr}>,00</span></h2>
        <p className={c.slogan}>{config.slogan[0]}<br/>{config.slogan[1]}</p>
        <ul className={c.unlocks}>{valueItems.map(item => <li key={item.product}><span>{item.product === 'harmonia' ? 'VITALÍCIO' : item.product === 'biblioteca' ? 'INCLUÍDOS' : '12 MESES'}</span><strong>{item.label}</strong></li>)}</ul>
        <div className={c.anchor}><p>VALOR SEPARADO <s>{money(offerTotals.regularCents)}</s></p><p>VOCÊ ECONOMIZA <strong>{money(offerTotals.savingsCents)}</strong><span>{offerTotals.discountPercentage.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</span></p></div>
        <div className={c.action}>{cta}{notice}<p>INSCRIÇÕES AINDA NÃO ABERTAS. CONDIÇÕES DE PAGAMENTO EM BREVE.</p></div>
      </div>
    </div>
  </section>;
}
