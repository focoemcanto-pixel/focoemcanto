import type { ReactNode } from 'react';
import ClosetShellNav from './ClosetShellNav';
import ClosetAddRedirect from './ClosetAddRedirect';
import styles from './closetShell.module.css';

export default function ClosetLayout({children}:{children:ReactNode}){
 return <div className={styles.frame}>
  <div className={styles.content}>{children}</div>
  <ClosetAddRedirect/>
  <ClosetShellNav/>
 </div>;
}
