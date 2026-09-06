import type { ReactNode } from 'react';
import ClosetShellNav from './ClosetShellNav';
import ClosetAddRedirect from './ClosetAddRedirect';
import ClosetStylistRedirect from './ClosetStylistRedirect';
import ClosetManualEntry from './ClosetManualEntry';
import styles from './closetShell.module.css';

export default function ClosetLayout({children}:{children:ReactNode}){
 return <div className={styles.frame}>
  <div className={styles.content}>{children}</div>
  <ClosetAddRedirect/>
  <ClosetStylistRedirect/>
  <ClosetManualEntry/>
  <ClosetShellNav/>
 </div>;
}
