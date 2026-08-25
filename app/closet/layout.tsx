import type { ReactNode } from 'react';
import ClosetShellNav from './ClosetShellNav';

export default function ClosetLayout({children}:{children:ReactNode}){
 return <>
  {children}
  <ClosetShellNav/>
 </>;
}
