'use client';
import {usePathname} from 'next/navigation';
import styles from './closetShell.module.css';

type NavItem={href:string;label:string;match:(p:string)=>boolean;icon:React.ReactNode};
const icon=(d:string)=><svg viewBox="0 0 24 24" aria-hidden="true"><path d={d}/></svg>;
const items:NavItem[]=[
 {href:'/closet',label:'Início',match:p=>p==='/closet'||p==='/closet/',icon:icon('M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5z M9 21v-7h6v7')},
 {href:'/closet/look',label:'Stylist',match:p=>p.startsWith('/closet/look'),icon:icon('M12 3v18 M5 8c2.5 0 4-1.8 4-4 M19 8c-2.5 0-4-1.8-4-4 M5 16c2.5 0 4 1.8 4 4 M19 16c-2.5 0-4 1.8-4 4')},
 {href:'/closet/wardrobe',label:'Closet',match:p=>p.startsWith('/closet/wardrobe')||p.startsWith('/closet/add')||p.startsWith('/closet/looks'),icon:icon('M5 4h14v17H5z M9 4V2h6v2 M12 8v9 M9 11h.01 M15 11h.01')},
 {href:'/closet/travel',label:'Viagem',match:p=>p.startsWith('/closet/travel')||p.startsWith('/closet/planner'),icon:icon('M4 7h16l-1 13H5z M9 7V4a3 3 0 0 1 6 0v3 M9 12h6')},
 {href:'/closet/marketplace',label:'Loja',match:p=>p.startsWith('/closet/marketplace')||p.startsWith('/closet/orders')||p.startsWith('/closet/protection'),icon:icon('M4 8h16l-1 12H5z M8 8a4 4 0 0 1 8 0')}
];
export default function ClosetShellNav(){
 const pathname=usePathname();
 if(pathname.startsWith('/closet/seller'))return null;
 const nav=<>{items.map(i=>{const active=i.match(pathname);return <a key={i.href} href={i.href} className={`${styles.navItem} ${active?styles.navItemActive:''}`}>{i.icon}<span>{i.label}</span></a>})}</>;
 if(pathname==='/closet'||pathname==='/closet/')return <><style>{'main > section > nav{display:none!important}'}</style><section className={styles.homeQuick} aria-label="Atalhos do Closet"><div className={styles.quickGrid}><a href="/closet/orders" className={styles.quickCard}><small>COMPRAS</small><strong>Meus pedidos</strong><span>Rastreio, devoluções e Proteção Closet</span></a><a href="/closet/insights" className={styles.quickCard}><small>INTELIGÊNCIA</small><strong>Meu uso</strong><span>Rotação, combinações e peças pouco usadas</span></a><a href="/closet/seller" className={styles.quickCard}><small>PARA LOJAS</small><strong>Vender no Closet</strong><span>Produtos, pedidos e reputação</span></a></div></section><nav className={styles.mobileNav} aria-label="Navegação principal">{nav}</nav><aside className={styles.desktopRail}><div className={styles.brand}>C</div><div className={styles.railItems}>{items.map(i=>{const active=i.match(pathname);return <a key={i.href} href={i.href} className={`${styles.railItem} ${active?styles.railActive:''}`}>{i.icon}<span>{i.label}</span></a>})}</div><div className={styles.railSpacer}/><a className={styles.sellerLink} href="/closet/seller">Seller</a></aside></>;
 return <><nav className={styles.mobileNav} aria-label="Navegação principal">{nav}</nav><aside className={styles.desktopRail}><div className={styles.brand}>C</div><div className={styles.railItems}>{items.map(i=>{const active=i.match(pathname);return <a key={i.href} href={i.href} className={`${styles.railItem} ${active?styles.railActive:''}`}>{i.icon}<span>{i.label}</span></a>})}</div><div className={styles.railSpacer}/><a className={styles.sellerLink} href="/closet/seller">Seller</a></aside></>;
}
