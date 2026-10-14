'use client';
import { useRef, useState } from 'react';
import { blackConfig as config, currency, checkoutHref, type BlackCover } from './black-config';
import s from './black.module.css';
import scroll from './black-scroll.module.css';
import { useBlackScroll } from './use-black-scroll';

function CourseCover({ cover, className, sizes = "(max-width: 760px) 170px, 280px" }: { cover: BlackCover; className?: string; sizes?: string }) {
  return <img className={className} src={cover.src} srcSet={cover.srcSet} sizes={sizes} width={cover.width} height={cover.height} alt={cover.alt} loading="lazy" decoding="async" />;
}

export default function BlackExperience() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState(false);
  const [total, setTotal] = useState(0);
  const checkout = checkoutHref();
  const pricesReady = config.products.every(p => p.regularPrice !== null);
  const regularTotal = config.products.reduce((sum,p) => sum + (p.regularPrice || 0),0);
  const navigateUniverse = useBlackScroll(root, { productCount: config.products.length, regularTotal, onActive: setActive, onTotal: setTotal });
  const cta = (final = false) => checkout ? <a className={s.cta} href={checkout}>{config.cta}<span aria-hidden="true">↗</span></a> : <button className={s.cta} onClick={() => {setNotice(true);if(!final) document.getElementById('oferta')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}}>{final ? 'OFERTA EM BREVE' : config.pendingCta}<span aria-hidden="true">↗</span></button>;
  return <main ref={root} className={`${s.black} ${scroll.engine}`}>
    <div data-viewport-probe aria-hidden="true"/>
    <a className={s.skip} href="#universo">Pular abertura</a>
    <div className={s.progress} aria-hidden="true" />
    <header className={s.header}><a href="#inicio" aria-label="BLACK FOCO 2026 — início">BLACK<span>FOCO</span><sup>26</sup></a><nav aria-label="Navegação da campanha"><a href="#universo">O universo</a><a href="#oferta">A oferta</a><a href="#faq">FAQ</a></nav><a className={s.headerCta} href="#oferta">EXPLORAR <span>↗</span></a></header>
    <section id="inicio" className={s.intro} data-scene="intro" data-pin-scene="intro">
      <div className={s.introStage} data-pin-stage data-intro-stage>
        <div className={s.orbit} data-hero-orbit aria-hidden="true"><i/><i/><i/><b/></div>
        <div className={s.heroIdentity} data-hero-identity>
        <p className={s.eyebrow}>FOCO EM CANTO APRESENTA <span>•</span> EDIÇÃO {config.year}</p>
        <h1 className={s.heroTitle} data-hero-title aria-label={`${config.campaignName} ${config.year}`}><span>BLACK</span><span>FOCO<span className={s.titleDot}>.</span></span><span className={s.heroYear}>{config.year}</span></h1>
        </div>
        <div className={s.heroSlogan} data-hero-slogan aria-label={config.slogan.join(' ')}><p className={s.sloganBuilt} data-slogan-built>{config.slogan[0].slice(0, config.slogan[0].lastIndexOf(' '))}<br/><strong>{config.slogan[0].slice(config.slogan[0].lastIndexOf(' ') + 1)}</strong></p><p className={s.sloganOpportunity} data-slogan-opportunity>{config.slogan[1].slice(0, config.slogan[1].lastIndexOf(' '))}<br/><strong>{config.slogan[1].slice(config.slogan[1].lastIndexOf(' ') + 1)}</strong></p></div>
        <div className={s.heroBottom} data-hero-bottom><p>FOCO EM CANTO<br/><strong>Uma história que nos trouxe até aqui.</strong></p><a href="#manifesto" className={s.scrollCue}>ROLE PARA ENTRAR <span>↓</span></a><p className={s.edition}>VÁRIOS PRODUTOS.<br/>UM NOVO UNIVERSO.</p></div>
        <span className={s.vertical}>VOZ · HARMONIA · CONHECIMENTO</span>
      </div>
    </section>
    <section id="manifesto" className={s.manifesto} data-reveal>
      <p className={s.eyebrow}>01 / UMA NOVA PERSPECTIVA</p>
      <h2><span>{config.manifesto[0]}</span><br/>{config.manifesto[1]}</h2>
      <div className={s.manifestoFoot}><span className={s.tinyOrb} aria-hidden="true"/><p>Uma voz abre possibilidades.<br/>Um universo inteiro transforma o caminho.</p></div>
    </section>
    <section id="universo" className={s.universe} data-scene="universe" data-pin-scene="universe">
      <div className={s.universeStage} data-pin-stage data-universe-stage>
        <div className={s.sectionTop} data-universe-top><p className={s.eyebrow}>02 / O UNIVERSO FOCO EM CANTO</p><span aria-label={`Produto ${active+1} de ${config.products.length}`}>0{active+1} / 0{config.products.length}</span></div>
        <div className={s.universeHeading} data-universe-heading><h2>Seu talento.<br/><em>Sem fronteiras.</em></h2><p>Explore as partes.<br/>Imagine o todo.</p></div>
        <div className={s.world} data-world>
          <div className={s.worldRings} aria-hidden="true"/>
          {config.products.map((p,i) => <button key={p.id} type="button" onClick={() => navigateUniverse(i)} className={`${s.planet} ${p.image?s.planetWithCover:''} ${i===active?s.planetActive:''}`} data-universe-cover style={{'--i':i} as React.CSSProperties} aria-label={`Ver ${p.name}`} aria-pressed={i===active} tabIndex={i===active?0:-1}>
            <span>0{i+1} / {p.theme}</span>
            {p.image ? <><span className={s.coverFrame}><CourseCover cover={p.image} className={s.coverImage}/></span><strong className={s.coverCaption}>{p.name}</strong></> : <><strong>{p.name}</strong><span className={s.planetMark} aria-hidden="true">+</span></>}
          </button>)}
        </div>
        <div className={s.productInfo} data-product-info aria-live="polite" aria-atomic="true"><span>{config.products[active].theme}</span><h3>{config.products[active].title}</h3><p>{config.products[active].description}</p></div>
        <nav className={s.universeRail} data-universe-rail aria-label="Produtos">{config.products.map((p,i)=><button key={p.id} type="button" onClick={() => navigateUniverse(i)} className={i===active?s.railActive:''} aria-current={i===active?'step':undefined}>{p.name}</button>)}</nav>
      </div>
      <div className={scroll.universeFallback} data-universe-fallback>
        <p className={s.eyebrow}>02 / O UNIVERSO FOCO EM CANTO</p>
        <div className={s.universeHeading}><h2>Seu talento.<br/><em>Sem fronteiras.</em></h2></div>
        <div className={scroll.fallbackGrid}>{config.products.map((p,i)=><article key={p.id} className={scroll.fallbackProduct}>
          <span>0{i+1} / 0{config.products.length} — {p.name}</span>
          {p.image ? <CourseCover cover={p.image} className={scroll.fallbackCover} sizes="(max-width: 760px) 80vw, 280px"/> : <div className={scroll.fallbackBonus} aria-hidden="true">+</div>}
          <span>{p.theme}</span><h3>{p.title}</h3><p>{p.description}</p>
        </article>)}</div>
      </div>
    </section>
    <section className={s.portrait} data-reveal><img src="/images/black/marcos-mono.webp" width="1024" height="1536" alt="Marcos Cruz cantando ao vivo, em fotografia preto e branco" loading="lazy"/><div className={s.portraitCopy}><p className={s.eyebrow}>A MÚSICA É O PONTO DE PARTIDA.</p><h2>O próximo<br/>capítulo<br/>é <em>seu.</em></h2><p>Voz. Harmonia. Prática. Continuidade.<br/>Diferentes caminhos, uma mesma paixão.</p><span>MARCOS CRUZ / FOCO EM CANTO</span></div></section>
    <section className={s.fusion} data-scene="fusion" data-pin-scene="fusion"><div className={s.fusionStage} data-pin-stage data-fusion-stage><p className={s.eyebrow}>03 / TUDO SE ENCONTRA</p><div className={s.fusionField} aria-hidden="true">{config.products.map((p,i)=><span key={p.id} className={p.image?s.fusionProduct:undefined} style={{'--i':i} as React.CSSProperties}>{p.image ? <CourseCover cover={p.image} className={s.fusionCover} sizes="(max-width: 760px) 72px, 110px"/> : p.name}</span>)}<div className={s.fusionCore} data-fusion-core/></div><h2 className={s.fusionSlogan} aria-label={config.slogan.join(' ')}><span>{config.slogan[0].slice(0, config.slogan[0].lastIndexOf(' '))}</span><strong>{config.slogan[0].slice(config.slogan[0].lastIndexOf(' ') + 1)}</strong><span>{config.slogan[1].slice(0, config.slogan[1].lastIndexOf(' '))}</span><strong>{config.slogan[1].slice(config.slogan[1].lastIndexOf(' ') + 1)}</strong></h2><p className={s.fusionBrand}>BLACK FOCO <span>2026</span></p></div></section>
    <section id="inclui" className={s.included}><div className={s.includedHeading} data-reveal><p className={s.eyebrow}>04 / PARTE DE UM MESMO TODO</p><h2>Um encontro de<br/><em>possibilidades.</em></h2><p>Os produtos previstos para esta edição.<br/>A seleção e as condições finais serão reveladas em breve.</p></div><div className={s.productList}>{config.products.map((p,i)=><article key={p.id} data-reveal className={p.image?s.productWithCover:undefined}>{p.image ? <CourseCover cover={p.image} className={s.listCover} sizes="64px"/> : <span>0{i+1}</span>}<div><h3>{p.name}</h3><p>{p.detail}</p></div><span className={s.listTheme}>{p.theme}</span></article>)}</div></section>
    <section id="oferta" className={s.offer} data-scene="value"><div className={s.offerInner}><div><p className={s.eyebrow}>05 / A PRÓXIMA GRANDE CONEXÃO</p><h2>Um universo.<br/><em>Uma única<br/>oportunidade.</em></h2><p>O encontro do ecossistema Foco em Canto está sendo preparado.</p><div className={s.valueRows}>{config.products.map(p=><div key={p.id}><span>{p.name}</span><span>{p.regularPrice===null?'A revelar':currency(p.regularPrice)}</span></div>)}</div>{pricesReady && <p className={s.regularTotal}>VALOR TOTAL <s>{currency(total)}</s></p>}</div><div className={s.pricePanel}><span className={s.eyebrow}>BLACK FOCO {config.year}</span><div className={s.priceOrb} aria-hidden="true"/><p>{config.blackPrice===null?'O próximo nível começa aqui.':'UMA ÚNICA OFERTA'}</p><strong className={config.blackPrice===null?s.soon:s.price}>{config.blackPrice===null?<>A GRANDE<br/>REVELAÇÃO<br/><em>EM BREVE.</em></>:currency(config.blackPrice)}</strong>{cta(true)}<p className={s.status}>{config.blackPrice === null ? 'PREÇOS E CONDIÇÕES AINDA SERÃO ANUNCIADOS.' : 'CONSULTE AS CONDIÇÕES E OS PRAZOS NO CHECKOUT OFICIAL.'}</p>{notice&&<p role="status" className={s.notice}>{config.pendingMessage}</p>}</div></div></section>
    <section className={s.access}><p className={s.eyebrow}>06 / DO PRIMEIRO CLIQUE AO PRÓXIMO PASSO</p><h2>Simples para entrar.<br/><em>Imenso para explorar.</em></h2><div>{[['Conheça a oferta','Veja os produtos, os prazos e todas as condições quando a campanha for revelada.'],['Compre com segurança','A compra será feita pelo checkout oficial da Kiwify, assim que estiver disponível.'],['Entre no universo','As instruções de acesso às plataformas serão apresentadas na oferta e após a aprovação da compra.']].map(([title,text],i)=><article key={title}><span>0{i+1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section id="faq" className={s.faq}><div><p className={s.eyebrow}>07 / ANTES DO PRÓXIMO PASSO</p><h2>Vamos<br/><em>esclarecer.</em></h2></div><div>{config.faqs.map(f=><details key={f.question}><summary>{f.question}<span aria-hidden="true">+</span></summary><p>{f.answer}</p></details>)}</div></section>
    <section className={s.finale}><img src="/images/black/marcos-voz.webp" width="1440" height="960" alt="Marcos Cruz em apresentação musical" loading="lazy"/><div><p className={s.eyebrow}>VÁRIOS PRODUTOS. UM ECOSSISTEMA.</p><h2>O SEU<br/>PRÓXIMO<br/><em>FOCO.</em></h2>{cta()}<p>BLACK FOCO / {config.year}</p></div></section>
    <footer className={s.footer}><a href="/" aria-label="Foco em Canto página inicial"><img src="/images/black/foco-logo.webp" width="110" height="110" alt="Foco em Canto"/></a><p>© {config.year} Foco em Canto.<br/>Uma nova possibilidade para a sua música.</p><nav aria-label="Links legais"><a href="/privacy/">Privacidade</a><a href="/terms/">Termos de uso</a></nav><a href="#inicio">VOLTAR AO INÍCIO ↑</a></footer>
  </main>;
}
