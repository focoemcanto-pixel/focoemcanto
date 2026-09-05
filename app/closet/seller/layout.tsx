'use client';
import {usePathname} from 'next/navigation';
import styles from './sellerShell.module.css';
const ico=(d:string)=><svg viewBox="0 0 24 24" aria-hidden="true"><path d={d}/></svg>;
const items=[
 ['/closet/seller','Painel','M4 5h6v6H4z M14 5h6v6h-6z M4 15h6v5H4z M14 15h6v5h-6z'],
 ['/closet/seller/catalog','Catálogo','M4 7h16v13H4z M8 7V4h8v3 M9 12h6'],
 ['/closet/seller/orders','Pedidos','M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5'],
 ['/closet/seller/disputes','Proteção','M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6z M9 12l2 2 4-4'],
 ['/closet/seller/payments','Financeiro','M4 7h16v11H4z M4 10h16 M8 15h3']
] as const;
export default function SellerLayout({children}:{children:React.ReactNode}){const p=usePathname();return <div className={styles.sellerBody}>{children}<nav className={styles.nav} aria-label="Operação do vendedor">{items.map(([href,label,path])=>{const active=href==='/closet/seller'?p===href||p===href+'/':p.startsWith(href);return <a key={href} href={href} className={`${styles.item} ${active?styles.active:''}`}>{ico(path)}<span>{label}</span></a>})}</nav></div>}
